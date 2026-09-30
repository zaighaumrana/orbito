import { pb, loadClientData } from './supabase.js';
import { pState } from './state.js';
import { esc } from './operations.js';
import { render } from './render.js';

function onboardingPanel(client, detail) {
  const info = detail.provisioning || {}, health = info.connection?.health || {}, job = info.job;
  const pending = job && job.state !== 'complete';
  const master = pState.currentUser.role === 'master_admin';
  return `<section class="card"><h2>Shop onboarding</h2><p>Reserved Owner: ${esc(client.owner_name)} · ${esc(client.owner_email)}</p>
    <p>Supabase: ${esc(health.connection || 'Not paired')} · ${esc(client.pairing_mode === 'byo' ? 'Client-owned project' : 'Managed project')}</p>
    <p>Bridge call credential: ${info.connection?.bridge_call_configured ? 'Configured' : 'Missing'}</p>
    <p>Shop database: ${esc(health.config_access || 'Not verified')}</p>
    <p>Infrastructure: ${health.infrastructure === 'ready' ? 'Ready' : 'Pending'}</p>
    <p>Owner Setup: ${health.owner_setup === 'owner_active' ? 'Active' : 'Pending manual activation'}</p>
    <p>Shop onboarding: ${esc(health.onboarding || 'onboarding_pending')}</p>
    <p>Config projection: ${esc(health.billing_projection || 'Pending')}</p>
    <p>Printing &amp; Thermal Tracking: Included · Paper Resupply: ${client.paper_resupply_enabled ? 'Included' : 'Not included'}</p>
    ${job ? `<p role="status">${esc(job.action)} · ${esc(job.state)} · ${esc(job.error || '')}</p>` : ''}
    ${detail.provisioningError ? '<p role="alert">Apply the onboarding migration and deploy the updated functions before provisioning.</p>' : ''}
    <p class="muted">Manual setup is the default. After provisioning, an authorized operator creates a confirmed Auth user with the reserved email and a password directly in the Shop Supabase Dashboard → Authentication → Users. The owner then logs into the Shop to activate their account and complete setup. No password is entered into Platform.</p>
    ${master ? `<form data-p-form="client-provisioning"><div style="display:flex;gap:10px;flex-wrap:wrap">
      <button name="action" value="pair-shop" class="secondary-button" ${pending ? 'disabled' : ''}>${client.pairing_mode === 'byo' ? 'Download BYO pairing file' : 'Pair managed Shop'}</button>
      <button name="action" value="bootstrap-shop" class="primary-button" ${pending || !info.connection?.bridge_call_configured ? 'disabled' : ''}>Provision Shop / Reserve owner</button>
      <button name="action" value="onboarding-status" class="secondary-button" ${pending || !info.connection?.bridge_call_configured ? 'disabled' : ''}>Check Owner Account</button>
      <button name="action" value="invite-owner" class="secondary-button" ${pending || health.infrastructure !== 'ready' || health.owner_setup === 'owner_active' ? 'disabled' : ''}>Send optional email invitation</button>
      ${job?.state === 'retry' ? '<button name="action" value="resume" class="primary-button">Retry provisioning</button>' : ''}
      ${job?.state === 'retry' && job.step === 'reserved' ? '<button name="action" value="cancel" class="secondary-button">Dismiss failed attempt</button>' : ''}
    </div></form>` : ''}
    ${client.pairing_mode === 'byo' ? `<details><summary>BYO pairing instructions</summary><p>An authorized Shop operator downloads the sensitive pairing file, then runs:</p><pre>supabase secrets set --project-ref ${esc(/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(client.supabase_url || '')?.[1] || 'SHOP_PROJECT_REF')} --env-file orbito-shop-pairing.env</pre><p>Deploy Shop migrations and six Edge Functions, securely delete the pairing file, then click Provision Shop. The customer may temporarily grant authorized project access or follow setup through screen sharing. Never collect their Supabase login password, Shop service key, DB password, secret API key or permanent PAT.</p></details>` : ''}
    <p class="muted">Email invitation only runs when explicitly requested. It requires working Shop Auth email delivery and an allowed /invite/accept redirect URL; custom SMTP is recommended for reliable email delivery. Email failure leaves manual activation available. Check Shop Auth before retrying unknown outcomes or expired invitations.</p>
  </section>`;
}

async function submitOnboarding(form, requestedAction) {
  const client = pState.selectedClient, job = pState.clientData.provisioning?.job;
  form.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    if (requestedAction === 'cancel') {
      const { error } = await pb.rpc('platform_provision_cancel',{p_client:client.id,p_request:job.request_id});
      if (error) throw error;
    } else {
      const action = requestedAction === 'resume' ? job.action : requestedAction;
      const invoke = async (next, requestId) => {
        const result = await pb.functions.invoke('platform-provision',{body:{client_id:client.id,request_id:requestId,action:next,params:{}}});
        if (result.error || result.data?.error) {
          let message = result.data?.error;
          try { message ||= (await result.error.context.clone().json()).error; } catch {}
          throw new Error(message || 'Provisioning outcome unavailable. Refresh status and retry the recorded operation.');
        }
        return result.data;
      };
      const data = await invoke(action, requestedAction === 'resume' ? job.request_id : crypto.randomUUID());
      if (data.message) alert(data.message);
      if (data.setup_file) {
        const url = URL.createObjectURL(new Blob([data.setup_file],{type:'text/plain'}));
        delete data.setup_file;
        const link = document.createElement('a'); link.href=url; link.download='orbito-shop-pairing.env'; link.click();
        setTimeout(() => URL.revokeObjectURL(url),1000);
      } else if (action === 'pair-shop' && data.state === 'paired') {
        await invoke('bootstrap-shop',crypto.randomUUID());
      }
    }
  } catch (error) { alert(error.message); }
  finally { await loadClientData(client); render(); }
}

export function provisioningPanel(client, detail) {
  if (client.onboarding_version === 2) return onboardingPanel(client, detail);
  const info = detail.provisioning || {}, connection = info.connection, job = info.job;
  const health = connection?.health || {}, source = detail.operations?.source;
  const pending = job && job.state !== 'complete';
  const master = pState.currentUser.role === 'master_admin';
  const project = connection?.project_ref || /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(client.supabase_url || '')?.[1] || '';
  const binding = connection?.client_binding || source?.client_binding || `orbito-client-${client.id}`;
  return `<div class="card"><h2>Connection / Client Provisioning</h2>
    <p class="muted">Create Client → Configure Shop → Provision → Verify → Activate</p>
    ${detail.provisioningError ? `<p role="alert">${esc(detail.provisioningError)} — deploy the provisioning migration and function before using these controls.</p>` : ''}
    <p>Project: ${esc(project || "Not configured")} · Binding: ${esc(binding)}</p>
    <div class="grid two-col"><div>
      <p>Shop connection: <strong>${esc(health.error ? 'Error / needs attention' : health.connection || 'Not configured')}</strong></p>
      <p>Config access: ${esc(health.config_access || 'Not verified')}</p>
      <p>Usage bridge: ${esc(health.bridge || (source ? 'Not verified' : 'Not provisioned'))}</p>
      <p>Billing projection: ${esc(health.billing_projection || 'Not verified')} · version ${esc(detail.operations?.projection?.sync_version ?? '—')}</p>
    </div><div>
      <p>Usage mode: ${esc(health.usage_mode || 'Not verified')} · delivery: ${health.delivery_enabled === undefined ? 'Not verified' : health.delivery_enabled ? 'Enabled' : 'Disabled'}</p>
      <p>Source: ${esc(source?.source_id || 'Not provisioned')} · ${source?.enabled ? 'Enabled' : 'Disabled'}</p>
      <p>Cutover: ${esc(source?.usage_from_sequence ?? job?.cutover_sequence ?? 'Not captured')}</p>
      <p>Last contact: ${esc(source?.last_received_at || 'Never')} · last accepted event: ${esc(info.last_accepted_event || 'Never')}</p>
    </div></div>
    <p>Currency: ${esc(client.currency || 'Choose currency')} · BILL rate: ${esc(client.event_rate)} · INVENTORY rate: ${esc(client.inventory_rate)}</p>
    <p class="muted">Use Edit Details / Edit Rates for agreed billing settings. Provisioning does not change billing rules or enable modules automatically. Configure the six modules below before activation. Thermal collection is independent of Paper Resupply.</p>
    <p class="muted">Last verified: ${esc(connection?.verified_at || 'Never')}. These are recorded observations; Verify Setup refreshes them without posting accounting.</p>
    ${health.error ? `<p role="alert">${esc(health.error)}</p>` : ''}
    ${job ? `<p role="status">Last operation: ${esc(job.action)} · ${esc(job.state)} · ${esc(job.step)}<br>${esc(job.error || '')}</p>` : ''}
    ${master ? `<form data-p-form="client-provisioning" autocomplete="off" class="form-grid">
      <label class="field"><span>Shop Supabase Project Ref</span><input name="project_ref" pattern="[a-z]{20}" maxlength="20" value="${esc(project)}" ${connection ? 'readonly' : ''} placeholder="20-letter Shop project ref"></label>
      <label class="field"><span>Client binding</span><input name="client_binding" maxlength="200" value="${esc(binding)}" ${connection ? 'readonly' : ''}></label>
      <div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" name="action" value="provision" class="primary-button" ${pending || source?.usage_from_sequence != null ? 'disabled' : ''}>Provision Client</button>
        <button type="submit" name="action" value="verify" class="secondary-button" ${pending ? 'disabled' : ''}>Verify Setup</button>
        <button type="button" class="secondary-button" data-p-action="refresh-operations">Refresh status</button>
      </div>
      <label class="field" style="grid-column:1/-1"><span>Cutover / reconciliation note</span><input name="note" maxlength="500" placeholder="Confirm legacy accounting reviewed and Shop writes paused"></label>
      <label style="grid-column:1/-1"><input name="confirmed" type="checkbox"> Shop writes are paused, cached old clients retired, and legacy accounting is reconciled.</label>
      <button type="submit" name="action" value="activate" class="primary-button" ${pending || source?.enabled || !connection?.verified_at ? 'disabled' : ''}>Activate Bridge</button>
      <details style="grid-column:1/-1"><summary>Advanced — credentials / reconciliation / diagnostic IDs</summary>
        <p>Project: ${esc(project || 'Not configured')} · Binding: ${esc(binding)}<br>Request: ${esc(job?.request_id || 'None')}</p>
        <p class="muted">Rotation may briefly delay bridge delivery; queued events retain their identities. Running operations are locked until completed or explicitly reconciled by an administrator. Do not rebind an existing ledger to another Shop.</p>
        <button type="submit" name="action" value="rotate" class="secondary-button" ${pending || !source ? 'disabled' : ''}>Rotate Bridge Secret</button>
        ${job?.state === 'retry' ? `<button type="submit" name="action" value="resume" class="primary-button">Resume ${esc(job.action)}</button>
          ${['reserved','credential_saved'].includes(job.step) || job.action === 'verify' ? '<button type="submit" name="action" value="cancel" class="secondary-button">Dismiss failed setup attempt</button>' : ''}` : ''}
        <p class="muted">A shared Platform polling schedule must be configured once before live delivery. The test-accounting reset remains a manual, guarded maintenance script for test clients 1 and 3 only.</p>
      </details>
    </form>` : '<p>Provisioning and credential changes require the master administrator. Existing module and billing roles are unchanged.</p>'}
    <details><summary>Provisioning audit</summary>${(info.audit || []).map(a => `<p>${esc(a.created_at)} · ${esc(a.action)} · ${esc(a.detail?.request_id || '')}</p>`).join('') || '<p>No provisioning actions recorded.</p>'}</details>
  </div>`;
}

export async function submitProvisioning(form, requestedAction) {
  const client = pState.selectedClient, job = pState.clientData.provisioning?.job;
  if (!client || !requestedAction) return;
  if (client.onboarding_version === 2) return submitOnboarding(form, requestedAction);

  const buttons = [...form.querySelectorAll('button[type="submit"]')];
  const disabled = buttons.map(button => button.disabled);
  buttons.forEach(button => { button.disabled = true; });
  try {
    if (requestedAction === 'cancel') {
      const { error } = await pb.rpc('platform_provision_cancel',{ p_client:client.id,p_request:job.request_id });
      if (error) throw error;
    } else {
      const action = requestedAction === 'resume' ? job.action : requestedAction;
      let params = requestedAction === 'resume' ? job.params : {};
      if (['provision','replace'].includes(action) && requestedAction !== 'resume') params = { project_ref:form.elements.project_ref.value.trim(),client_binding:form.elements.client_binding.value.trim() };
      if (action === 'activate') {
        if (!form.elements.confirmed.checked) throw new Error('Confirm the paused Shop and reconciled legacy accounting before activation.');
        if (requestedAction !== 'resume') params = { confirmed:true,note:form.elements.note.value.trim() };
        if (!params.note || params.note.length < 5) throw new Error('Add a cutover note.');
        if (!confirm('Activate bridge billing for this client at the exact Shop sequence captured by the server? Keep Shop writes paused until success.')) return;
      }
      if (action === 'rotate' && !confirm('Rotate the bridge secret server-side? Delivery may pause until this operation completes.')) return;
      const body = { client_id:client.id,request_id:requestedAction === 'resume' ? job.request_id : crypto.randomUUID(),action,params };
      const result = await pb.functions.invoke('platform-provision',{ body });
      if (result.error || result.data?.error) {
        let message = result.data?.error;
        try { message ||= (await result.error.context.clone().json()).error; } catch { /* Generic transport failure. */ }
        throw new Error(message || 'Provisioning response unavailable. Refresh status before trying again.');
      }
    }
    await loadClientData(client); render();
  } catch (error) {
    // Status is server-owned and survives reload; never persist request bodies containing credentials.
    try { await loadClientData(client); render(); } catch {}
    alert(error.message);
  } finally {
    buttons.forEach((button,index) => { if (button.isConnected) button.disabled = disabled[index]; });
  }
}
