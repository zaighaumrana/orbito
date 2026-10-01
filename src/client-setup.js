import { esc } from './operations.js';
export const copyValue = (value,label='Copy') => `<button type="button" class="setup-copy" data-p-action="copy-setup" data-copy-value="${esc(value)}" aria-label="Copy ${esc(label)}">${esc(label)}</button>`;
export function setupState(client,detail) {
  const h=detail.provisioning?.connection?.health || {}, checks=h.checks || {}, job=detail.provisioning?.job;
  const connected=checks.database_reachable===true;
  const runtime=['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'].every(k=>checks[k]===true);
  const reserved=checks.owner_reservation===true, active=h.owner_setup==='owner_active' && h.owner_account==='active', complete=h.onboarding==='onboarding_complete';
  const busy=job && job.state!=='complete' && job.state!=='retry';
  let action=client.pairing_mode==='byo' ? 'byo-setup':'pair-shop',label=client.pairing_mode==='byo' ? 'Complete BYO Setup':'Pair Shop';
  let message='Connect this Shop and install its runtime before reserving the owner.';
  if (detail.provisioning?.connection?.bridge_call_configured && connected) { action='bootstrap-shop';label='Provision Shop';message='Reserve the owner and send the initial Shop configuration.'; }
  if (reserved && !runtime) { action=client.pairing_mode==='byo'?'byo-setup':'onboarding-status';label=client.pairing_mode==='byo'?'Complete BYO Setup':'Verify Runtime';message='Runtime verification needs attention. Check the setup guide, then verify again.'; }
  if (reserved && runtime) { action='onboarding-status';label='Check Owner Account';message='Create one confirmed Auth user in the Shop Dashboard using the reserved email, then check here.'; }
  if (h.owner_account==='conflict') { action='onboarding-status';label='Check Owner Account';message='Owner identity conflicts with the reservation. Reconcile Shop Auth and existing account mappings before retrying.'; }
  if (h.infrastructure==='ready' && ['ready','active'].includes(h.owner_account)) { action='open-login';label='Open Shop Login';message=active?'The owner can finish the six saved setup steps in the Shop.':'Owner account detected. Log into the Shop to activate ownership and begin setup.'; }
  if (job?.state==='retry' && job.action==='bootstrap-shop' && runtime && !complete) { action='resume';label='Retry Provisioning';message='Resume the recorded operation using the same owner reservation.'; }
  if (complete) { action='open-shop';label='Open Shop';message='Business setup is complete.'; }
  return {h,checks,job,connected,runtime,reserved,active,complete,busy,action,label,message};
}
const status=(label,ok) => `<li><span class="setup-dot ${ok?'good':'pending'}" aria-hidden="true"></span>${esc(label)}<span class="setup-value">${ok?'Verified':'Pending'}</span></li>`;
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
  const primary=s.action.startsWith('open-') ? (shop?`<a class="primary-button" href="${esc(shop+(s.action==='open-login'?'/login':''))}" target="_blank" rel="noopener noreferrer">${s.label} ↗</a>`:'<span class="badge warn">Set the Shop URL</span>') : master ? (s.action==='byo-setup'?'<button class="primary-button" data-p-modal="byo-setup">Complete BYO Setup</button>':`<form data-p-form="client-provisioning"><button name="action" value="${s.action}" class="primary-button" ${s.busy?'disabled':''}>${s.label}</button></form>`):'<p class="muted">Setup actions require the master administrator.</p>';
  return `<section class="card client-setup"><div class="setup-heading"><h2>Shop setup</h2><span class="badge ${failed?'bad':h.infrastructure==='ready'?'good':'warn'}">${failed?'Needs attention':h.infrastructure==='ready'?'Infrastructure ready':'Setup pending'}</span></div>
    <ol class="setup-progress">${stages.map(([label,done],i)=>`<li class="${done?'done':i===current?(failed?'failed':'current'):'pending'}" ${i===current?'aria-current="step"':''}><span>${done?'✓':i+1}</span><strong>${label}</strong><small>${done?'Completed':i===current?(failed?'Needs attention':'Next step'):'Pending'}</small></li>`).join('')}</ol>
    <div class="setup-health">
      <article><h3>Connection</h3><ul>${status('Supabase connected',s.connected)}${status('Database reachable',checks.database_reachable)}</ul></article>
      <article><h3>Runtime</h3><ul>${status('Edge Functions',checks.edge_functions)}${status('Authentication',checks.authentication)}${status('Required configuration',checks.runtime_configuration)}${status('Logo storage · inline',checks.storage)}</ul></article>
      <article><h3>Platform Bridge</h3><ul>${status('Connection',checks.bridge_configuration)}${status('Usage delivery',checks.bridge_mode)}${status('Configuration received',checks.config_projection)}</ul></article>
      <article><h3>Owner</h3><strong>${esc(client.owner_name)}</strong><p class="setup-email">${esc(client.owner_email)}</p><span class="badge ${s.active?'good':'warn'}">${s.active?'Active':h.owner_account==='ready'?'Waiting for owner login':h.owner_account==='unconfirmed'?'Email not confirmed':h.owner_account==='conflict'?'Identity needs attention':s.reserved?'Waiting for Auth account':'Not reserved'}</span></article>
      <article><h3>${esc(client.plan)} features</h3><div class="setup-features">${[['POS & repair',true],['Workshop',client.technician_module_enabled],['Live Tracking',client.live_tracking_enabled],['EMS',client.ems_enabled],['Break Tracking',client.ems_enabled&&client.ems_track_breaks],['Inventory',client.inventory_module_enabled],['Paper Resupply',client.paper_resupply_enabled],['Printing & thermal',true]].filter(([,on])=>on).map(([label])=>`<span class="badge">${label}</span>`).join('')}</div></article>
    </div>
    <div class="setup-next"><div><h3>${s.complete?'Ready for business':'Next action'}</h3><p>${esc(s.message)}</p></div>${primary}</div>
    <p class="muted setup-observed">${esc(runtimeObservation(s,detail.provisioning?.connection?.verified_at))}</p>
    <details class="setup-advanced"><summary>Advanced / Technical Details</summary><dl>${[['Client ID',client.id],['Project Ref',project],['Shop URL',client.shop_url],['Binding',detail.provisioning?.connection?.client_binding],['Source ID',detail.operations?.source?.source_id],['Usage mode',detail.operations?.source?'Bridge':'Not provisioned'],['Cutover',detail.operations?.source?.usage_from_sequence],['Last contact',detail.operations?.source?.last_received_at],['Last operation',job?job.action+' · '+job.state:'None']].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value??'—')} ${value!=null?copyValue(value):''}</dd></div>`).join('')}</dl>
      <ul>${Object.entries(checks).map(([key,value])=>status(key.replaceAll('_',' '),value)).join('')}</ul>
      ${job?.error?`<p role="alert">${esc(job.error)}</p>`:''}${detail.provisioningError?'<p role="alert">Apply the Platform onboarding migrations and deploy its updated functions.</p>':''}
      ${master?`<form data-p-form="client-provisioning" class="setup-secondary"><button name="action" value="onboarding-status" class="secondary-button" ${s.busy||!detail.provisioning?.connection?.bridge_call_configured?'disabled':''}>Refresh owner & runtime</button><button name="action" value="invite-owner" class="secondary-button" ${s.busy||h.infrastructure!=='ready'||s.active?'disabled':''}>Send optional email invitation</button>${job?.state==='retry'?'<button name="action" value="resume" class="secondary-button">Retry recorded operation</button>':''}</form>`:''}
      <p class="muted">Manual owner creation is the default. Passwords stay in Shop Auth. Optional invitations need working email delivery and an allowed /invite/accept redirect.</p>
    </details></section>`;
}
export function byoSetupModal(client,detail) {
  if(!client || client.onboarding_version!==2 || client.pairing_mode!=='byo')return '';
  const project=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(client.supabase_url||'')?.[1]||'SHOP_PROJECT_REF';
  const command=`npm run byo:setup -- --project-ref ${project} --pairing-file "PATH_TO/orbito-shop-pairing.env" --runtime-file "PATH_TO/shop-runtime.env" --apply --remove-pairing`;
  const setup=setupState(client,detail);
  const badge=(ok,label)=>`<span class="badge ${ok?'good':'warn'}">${ok?label:'Pending'}</span>`;
  const reserveAction=setup.job?.state==='retry' && setup.job.action==='bootstrap-shop'?'resume':'bootstrap-shop';
  const cmd=(text)=>`<div class="setup-command"><code>${esc(text)}</code>${copyValue(text,'Copy command')}</div>`;
  return `<div class="modal-backdrop"><section class="modal byo-guide" role="dialog" aria-modal="true" aria-labelledby="byo-title"><div class="setup-heading"><h2 id="byo-title">Complete BYO Setup</h2><button class="icon-button" data-p-close aria-label="Close setup guide">✕</button></div><p>Client #${esc(client.id)} · Project ${esc(project)} ${copyValue(project,'Copy ref')}</p><ol class="byo-steps">
    <li><h3>Confirm Supabase access</h3><p>Use temporary project access, screen sharing, or an authorised local CLI account. Confirm this project is listed before making changes.</p>${cmd('supabase projects list --output json')}<p>Never send customer login credentials or privileged keys to Platform.</p></li>
    <li><h3>Download pairing package</h3>${badge(detail.provisioning?.connection?.bridge_call_configured,'Package prepared')}<p class="badge warn">Sensitive file · delete after installation</p><p>Save orbito-shop-pairing.env outside both repositories. Check your browser’s Downloads location.</p><form data-p-form="client-provisioning"><button name="action" value="pair-shop" class="secondary-button">Download pairing file</button></form>${cmd(`Test-Path (Join-Path $env:USERPROFILE 'Downloads/orbito-shop-pairing.env')`)}</li>
    <li><h3>Run Shop setup</h3>${badge(setup.checks.edge_functions,'Functions verified')}<p>Apply the complete Shop migration chain through approved Supabase Git integration first. In the Shop repository on feature/onboarding-v2, create a private runtime file containing TURNSTILE_SECRET. Use the setup command below; it verifies access, installs the three pairing settings and deploys all six functions. Read docs/BYO_SETUP.md for the exact sequence.</p>${cmd(command)}<p>Run without --apply first for a safe validation pass. No customer service key, database password or PAT is an input.</p></li>
    <li><h3>Verify runtime</h3>${badge(setup.runtime,'Runtime verified')}<p>The tool reports installed runtime checks and removes the pairing file only after success. Confirm removal, then verify the actual deployed Shop browser login and CAPTCHA domain.</p>${cmd(`Test-Path (Join-Path $env:USERPROFILE 'Downloads/orbito-shop-pairing.env')`)}<p>After successful removal, this must return False. Keep server TURNSTILE_SECRET out of every VITE variable.</p></li>
    <li><h3>Reserve owner</h3>${badge(setup.reserved,'Owner reserved')}<form data-p-form="client-provisioning"><button name="action" value="${reserveAction}" class="secondary-button" ${setup.busy||setup.complete?'disabled':''}>Provision Shop / Reserve owner</button></form><p>When infrastructure is ready, create one confirmed Auth user directly in the Shop Dashboard using ${esc(client.owner_email)}. Check Owner Account, then the owner logs in and completes six saved steps.</p></li>
  </ol><button class="secondary-button" data-p-close>Close guide</button></section></div>`;
}
