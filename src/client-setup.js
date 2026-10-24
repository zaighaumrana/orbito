import {copyValue,technicalRows} from './ui-primitives.js';
export {copyValue} from './ui-primitives.js';
import { esc } from './operations.js';
import {supportSetupPanel} from './support-setup.js';
import {renderByoWizard} from './wizard-views.js';
import {createByoStages,renderByoStage} from './byo-stages.js';
export function managedSetupModal(client,detail,action='managed-setup') {
  const job=detail.provisioning?.job;
  const retry=['retry','paused'].includes(job?.state) && ['managed-setup','rotate-turnstile'].includes(job.action);
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><h2>${action==='rotate-turnstile'?'Rotate Turnstile Secret':'Provision managed Shop'}</h2><p>Target: ${esc(client.supabase_url)}. The server uses an approved Shop release. Successful stages are retained; owner passwords remain in Shop Auth.</p><form data-p-form="client-provisioning" autocomplete="off"><label class="field"><span>Public Turnstile site key</span><input name="site_key" required maxlength="200" value="${esc(retry?job.params.site_key:client.turnstile_site_key || '')}" ${retry?'readonly':''}></label><label class="field"><span>Turnstile Secret · install once, never retained</span><input name="turnstile_secret" type="password" autocomplete="off" maxlength="512"><small>Re-enter only if this stage needs retry. Leave blank if the recorded Turnstile stage already passed.</small></label><button class="primary-button" name="action" value="${retry?'resume':action}">${retry?'Retry recorded stages':'Install on this Shop'}</button><button type="button" class="secondary-button" data-p-close>Cancel</button></form></section></div>`;
}
export function setupState(client,detail) {
  const h=detail.provisioning?.connection?.health || {}, checks=h.checks || {}, job=detail.provisioning?.job;
  const connected=checks.database_reachable===true;
  const runtime=['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'].every(k=>checks[k]===true);
  const reserved=checks.owner_reservation===true, active=h.owner_setup==='owner_active' && h.owner_account==='active', complete=h.onboarding==='onboarding_complete';
  const busy=job && !['complete','retry','paused'].includes(job.state);
  let action=client.pairing_mode==='byo' ? 'byo-setup':'managed-setup',label=client.pairing_mode==='byo' ? 'Complete BYO Setup':'Provision managed Shop';
  let message='Connect this Shop and install its runtime before reserving the owner.';
  if (detail.provisioning?.connection?.bridge_call_configured && connected) { action='bootstrap-shop';label='Provision Shop';message='Reserve the owner and send the initial Shop configuration.'; }
  if (reserved && !runtime) { action=client.pairing_mode==='byo'?'byo-setup':'onboarding-status';label=client.pairing_mode==='byo'?'Complete BYO Setup':'Verify Runtime';message='Runtime verification needs attention. Check the setup guide, then verify again.'; }
  if (reserved && runtime) { action='onboarding-status';label='Check Owner Account';message='Create one confirmed Auth user in the Shop Dashboard using the reserved email, then check here.'; }
  if (h.owner_account==='conflict') { action='onboarding-status';label='Check Owner Account';message='Owner identity conflicts with the reservation. Reconcile Shop Auth and existing account mappings before retrying.'; }
  if (h.infrastructure==='ready' && ['ready','active'].includes(h.owner_account)) { action='open-login';label='Open Shop Login';message=active?'The owner can finish the six saved setup steps in the Shop.':'Owner account detected. Log into the Shop to activate ownership and begin setup.'; }
  if (['retry','paused'].includes(job?.state) && job.action==='bootstrap-shop' && runtime && !complete) { action='resume';label='Retry Provisioning';message='Resume the recorded operation using the same owner reservation.'; }
  if (complete) { action='open-shop';label='Open Shop';message='Business setup is complete.'; }
  if(['retry','paused'].includes(job?.state) && ['managed-setup','rotate-turnstile'].includes(job.action)) {action='managed-setup';label=job.state==='paused'?'Continue managed provisioning':'Retry managed provisioning';message='Resume the recorded stages. Re-enter the Turnstile secret only if its installation stage needs retry.';}
  return {h,checks,job,connected,runtime,reserved,active,complete,busy,action,label,message};
}
const status=(label,ok,positive='Verified') => `<li><span class="setup-dot ${ok?'good':'pending'}" aria-hidden="true"></span>${esc(label)}<span class="setup-value">${ok?esc(positive):'Pending'}</span></li>`;
const safeShop=url=> {try {const u=new URL(url);return u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash ? u.origin : null;} catch {return null;}};
export function runtimeObservation(state,verifiedAt) {
  const timestamp=verifiedAt ? new Date(verifiedAt) : null;
  const checked=timestamp && Number.isFinite(timestamp.getTime()) ? ' Last checked '+timestamp.toLocaleString()+'.' : '';
  const backend=state.runtime ? 'Backend runtime preflight verified.' : checked ? 'Backend runtime preflight needs attention.' : 'Backend runtime preflight is pending.';
  return backend+checked+' Refresh after changes. Hosted external checks still require the smoke test: CAPTCHA hostname, DNS/TLS and browser routing.';
}
export function renderClientSetup(client,detail,master) {
  const s=setupState(client,detail),{h,checks,job}=s;
  const stages=[['Client Created',true],['Shop Connected',s.connected],['Runtime Verified',s.runtime],['Owner Reserved',s.reserved],['Owner Activated',s.active],['Shop Setup Complete',s.complete]];
  const current=stages.findIndex(([,done])=>!done), failed=job?.state==='retry' || Boolean(detail.provisioningError);
  const shop=safeShop(client.shop_url), project=detail.provisioning?.connection?.project_ref || /^https:\/\/([a-z]{20})\.supabase\.co$/.exec(client.supabase_url||'')?.[1] || '';
  const primary=s.action.startsWith('open-') ? (shop?`<a class="primary-button" href="${esc(shop+(s.action==='open-login'?'/login':''))}" target="_blank" rel="noopener noreferrer">${s.label} ↗</a>`:'<span class="badge warn">Set the Shop URL</span>') : master ? (['byo-setup','managed-setup'].includes(s.action)?`<button class="primary-button" data-p-modal="${s.action}" ${s.busy?'disabled':''}>${s.label}</button>`:`<form data-p-form="client-provisioning"><button name="action" value="${s.action}" class="primary-button" ${s.busy?'disabled':''}>${s.label}</button></form>`):'<p class="muted">Setup actions require the master administrator.</p>';
  return `<section class="card client-setup"><div class="setup-heading"><h2>Shop setup</h2><span class="badge ${failed?'bad':h.infrastructure==='ready'?'good':'warn'}">${failed?'Needs attention':h.infrastructure==='ready'?'Infrastructure ready':'Setup pending'}</span></div>
    <ol class="setup-progress">${stages.map(([label,done],i)=>`<li class="${done?'done':i===current?(failed?'failed':'current'):'pending'}" ${i===current?'aria-current="step"':''}><span>${done?'✓':i+1}</span><strong>${label}</strong><small>${done?'Completed':i===current?(failed?'Needs attention':'Next step'):'Pending'}</small></li>`).join('')}</ol>
    <div class="setup-health">
      <article><h3>Connection</h3><ul>${status('Supabase connected',s.connected)}${status('Database reachable',checks.database_reachable)}</ul></article>
      <article><h3>Runtime</h3><ul>${status('Migrations',checks.migrations)}${status('Database privileges',checks.database_privileges)}${status('Edge Functions',checks.edge_functions)}${status('Authentication',checks.authentication)}${status('Required configuration',checks.runtime_configuration)}${status('Turnstile private setting · real CAPTCHA test still required',h.runtime_details?.turnstile,'Present')}${status('Logo storage · inline',checks.storage)}</ul></article>
      <article><h3>Platform Bridge</h3><ul>${status('Connection',checks.bridge_configuration)}${status('Usage delivery',checks.bridge_mode)}${status('Configuration received',checks.config_projection)}</ul></article>
      <article><h3>Owner</h3><strong>${esc(client.owner_name)}</strong><p class="setup-email">${esc(client.owner_email)}</p><span class="badge ${s.active?'good':'warn'}">${s.active?'Active':h.owner_account==='ready'?'Waiting for owner login':h.owner_account==='unconfirmed'?'Email not confirmed':h.owner_account==='conflict'?'Identity needs attention':s.reserved?'Waiting for Auth account':'Not reserved'}</span></article>
      <article><h3>${esc(client.plan)} features</h3><div class="setup-features">${[['POS & repair',true],['Workshop',client.technician_module_enabled],['Live Tracking',client.live_tracking_enabled],['EMS',client.ems_enabled],['Break Tracking',client.ems_enabled&&client.ems_track_breaks],['Inventory',client.inventory_module_enabled],['Paper Resupply',client.paper_resupply_enabled],['Printing & thermal',true]].filter(([,on])=>on).map(([label])=>`<span class="badge">${label}</span>`).join('')}</div></article>
    </div>
    <div class="setup-next"><div><h3>${s.complete?'Ready for business':'Next action'}</h3><p>${esc(s.message)}</p></div>${primary}</div>
    ${supportSetupPanel(client,detail,master)}
    ${master&&client.pairing_mode==='byo'?'<button class="secondary-button" data-p-modal="byo-setup">Resume BYO Setup</button>':''}
    <p class="muted setup-observed">${esc(runtimeObservation(s,detail.provisioning?.connection?.verified_at))}</p>
    ${master && client.pairing_mode==='managed' && ['Active','Suspended'].includes(client.lifecycle_state) && !['destroyed','decommissioned'].includes(client.infrastructure_state) && detail.provisioning?.connection?.bridge_call_configured && detail.operations?.source?'<button class="secondary-button" data-p-action="open-shop-support">Open Shop as Support</button>':''}
    <details class="setup-advanced"><summary>Advanced / Technical Details</summary>${technicalRows([['Client ID',client.id],['Project Ref',project],['Shop URL',client.shop_url],['Binding',detail.provisioning?.connection?.client_binding],['Source ID',detail.operations?.source?.source_id],['Usage mode',detail.operations?.source?'Bridge':'Not provisioned'],['Cutover',detail.operations?.source?.usage_from_sequence],['Last contact',detail.operations?.source?.last_received_at],['Last operation',job?job.action+' · '+job.state:'None']])}
      <ul>${Object.entries(checks).map(([key,value])=>status(key.replaceAll('_',' '),value)).join('')}</ul>
      <ul>${Object.entries(h.runtime_details?.functions || {}).map(([name,ok])=>status('Function · '+name,ok)).join('')}</ul>
      ${client.pairing_mode==='managed'?`<p>Support access configuration: <strong>${h.support_auth_configured===true?'Verified':'Not verified'}</strong></p>${master && s.reserved && detail.provisioning?.connection?.bridge_call_configured && client.lifecycle_state!=='Archived' && !['destroyed','decommissioned'].includes(client.infrastructure_state)?`<form data-p-form="client-provisioning"><button name="action" value="repair-support-access" class="secondary-button" ${s.busy?'disabled':''}>Configure Support Access</button></form>`:''}`:''}
      <h3>Cloudflare Pages public environment</h3><p>Copy only these three public values. CAPTCHA hostname, DNS/TLS and SPA routing still require hosted verification.</p>
      <form data-p-form="public-environment" autocomplete="off"><label class="field"><span>Shop public anon JWT</span><input name="anon" required value="${esc(detail.publicEnv?.VITE_SUPABASE_ANON || '')}"></label><label class="field"><span>Public Turnstile site key</span><input name="site_key" required value="${esc(detail.publicEnv?.VITE_TURNSTILE_SITE_KEY || client.turnstile_site_key || '')}"></label><pre>VITE_SUPABASE_URL=${esc(client.supabase_url)}\nVITE_SUPABASE_ANON=public Shop anon JWT\nVITE_TURNSTILE_SITE_KEY=public site key</pre><div class="action-group"><button class="secondary-button">Copy public environment block</button>${master && client.pairing_mode==='managed'?'<button type="button" class="secondary-button" data-p-action="load-public-environment">Load managed public values</button><button type="button" class="secondary-button" data-p-modal="rotate-turnstile">Rotate Turnstile Secret</button>':''}</div></form>
      ${job?.error?`<p role="alert">${esc(job.error)}</p>`:''}${detail.provisioningError?'<p role="alert">Apply the Platform onboarding migrations and deploy its updated functions.</p>':''}
      ${master?`<form data-p-form="client-provisioning" class="setup-secondary"><button name="action" value="onboarding-status" class="secondary-button" ${s.busy||!detail.provisioning?.connection?.bridge_call_configured?'disabled':''}>Refresh owner & runtime</button><button name="action" value="invite-owner" class="secondary-button" ${s.busy||h.infrastructure!=='ready'||s.active?'disabled':''}>Send optional email invitation</button>${job?.state==='retry'?'<button name="action" value="resume" class="secondary-button">Retry recorded operation</button>':''}</form>`:''}
      <p class="muted">Manual owner creation is the default. Passwords stay in Shop Auth. Optional invitations need working email delivery and an allowed /invite/accept redirect.</p>
    </details></section>`;
}
export function byoGuideStages(client,detail) {
 if(!client||client.onboarding_version!==2||client.pairing_mode!=='byo')return [];
 const project=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(client.supabase_url||'')?.[1]||'SHOP_PROJECT_REF';
 return createByoStages(client,{project,shop:safeShop(client.shop_url)||'https://CUSTOMER_SHOP_HOST',setup:setupState(client,detail),copyValue});
}
export function byoSetupModal(client,detail,ui={}) {
 const stages=byoGuideStages(client,detail);if(!stages.length)return '';
 return renderByoWizard(client,detail,stages,ui,copyValue);
}
// Kept for documentation/walkthrough consumers; the wizard uses structured stages.
export function byoGuideContent(client,detail) {
 const stages=byoGuideStages(client,detail);if(!stages.length)return '';
 return '<ol class="byo-steps">'+stages.map(s=>'<li><h3>'+esc(s.title)+'</h3>'+renderByoStage(s,copyValue,'fresh')+'</li>').join('')+'</ol>';
}
