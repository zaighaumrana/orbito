import { createClient } from '@supabase/supabase-js';
import { pState, setPCFG } from './state.js';
import { serverConfigOperation } from './operations.js';
import { captureAuthority, authorityCurrent, captureView, viewCurrent, selectClient, clientDataMatches } from './async-context.js';
export const pb = createClient(import.meta.env.VITE_PLATFORM_URL, import.meta.env.VITE_PLATFORM_ANON);
export const PLATFORM_AUTH_EMAIL = import.meta.env.VITE_PLATFORM_AUTH_EMAIL;
let passwordVerifier;
export class PlatformAuthError extends Error {
  constructor(code) {
    const messages = {
      captcha_failed: 'Verification expired or was rejected. Complete a fresh verification and try again.',
      invalid_credentials: 'The current password is incorrect.',
      session: 'Your session has expired. Sign in again.',
      authority: 'Your account is not authorized for this operation.',
      master_only: 'Only the verified master administrator can change the Platform username.',
      network: 'Authentication could not be reached. Check your connection and try again.',
      rate_limit: 'Too many authentication attempts. Wait before trying again.',
      authentication: 'Password verification could not be completed. Try again after fresh verification.',
      continuity: 'Password verification is disabled until administrator session continuity is verified. Contact the Platform owner.',
    };
    super(messages[code] || messages.authentication); this.code=code; this.userMessage=this.message;
  }
}
function authFailure(error) {
  if (error?.code==='captcha_failed') return new PlatformAuthError('captcha_failed');
  if (error?.code==='invalid_credentials') return new PlatformAuthError('invalid_credentials');
  if (error?.status===429 || /rate_limit/.test(error?.code || '')) return new PlatformAuthError('rate_limit');
  if (error instanceof TypeError || error?.name==='AuthRetryableFetchError' || error?.status===0) return new PlatformAuthError('network');
  return new PlatformAuthError('authentication');
}
export async function loadOperatorIdentity() {
  let verified;
  try { verified = await pb.auth.getUser(); }
  catch (error) { throw authFailure(error); }
  if (verified.error?.name==='AuthRetryableFetchError' || verified.error?.status===0) throw new PlatformAuthError('network');
  if (verified.error || !verified.data?.user) throw new PlatformAuthError('session');
  const { data, error } = await pb.rpc('platform_operator_identity');
  if (error || data?.auth_user_id !== verified.data.user.id || !['master_admin','portfolio_manager','billing_person'].includes(data?.role))
    throw new PlatformAuthError('authority');
  return data;
}
export async function reauthenticateMaster(password, captchaToken) {
  if (!captchaToken) throw new PlatformAuthError('captcha_failed');
  if (!password) throw new PlatformAuthError('invalid_credentials');
  const before = await loadOperatorIdentity();
  if (before.role!=='master_admin') throw new PlatformAuthError('master_only');
  if (before.password_verification_safe!==true) throw new PlatformAuthError('continuity');
  // Independent, memory-only Auth client: never replace the existing session.
  const verifier=passwordVerifier ||= createClient(import.meta.env.VITE_PLATFORM_URL,import.meta.env.VITE_PLATFORM_ANON,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'platform-password-verification'}});
  let sessionCreated=false;
  try {
    let result;
    try {result=await verifier.auth.signInWithPassword({email:before.email,password,options:{captchaToken}});}
    catch(error){throw authFailure(error);}
    sessionCreated=Boolean(result.data?.session);
    if(result.error)throw authFailure(result.error);
    if(!result.data?.session || result.data.user?.id!==before.auth_user_id)throw new PlatformAuthError('authority');
    const after=await loadOperatorIdentity();
    if(after.role!=='master_admin' || after.auth_user_id!==before.auth_user_id || after.email!==before.email)throw new PlatformAuthError('authority');
    return after;
  } finally {
    // Local scope revokes only the new verification session, never all sessions.
    if(sessionCreated){
      let cleanup;
      try { cleanup = await verifier.auth.signOut({scope:'local'}); }
      catch { throw new PlatformAuthError('authentication'); }
      if (cleanup?.error) throw new PlatformAuthError('authentication');
    }
  }
}
export async function loadConfig() {
  const generation=pState.authorityGeneration;
  const { data, error } = await pb.from('platform_config').select('id,admin_username').single();
  if (error) throw error;
  if (data && generation===pState.authorityGeneration) setPCFG(data);
}
// Paginate historical ledgers instead of silently accepting the default 1000 rows.
async function allRows(table, order, select = '*') {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await pb.from(table).select(select).order(order, { ascending: false }).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data); if (data.length < 1000) return rows;
  }
}
export async function loadPlatform() {
  if(!pState.authenticated)return;
  const context=captureAuthority();
  const [clients,support,usage,invoices,rateLog,payments,credits,platformUsers,summary,teamArchive,teamHistory] = await Promise.all([
    allRows('clients','id'), allRows('support_tickets','id'),
    allRows('usage_logs','id'), allRows('billing_cycles','id'), allRows('pricing_rate_log','id'),
    allRows('payments','id'), allRows('client_credit','id'),
    allRows('platform_users','id','id,auth_user_id,name,email,role,status,created_at,suspended_from'),
    pb.rpc('platform_usage_summary'),
    pState.currentUser.role==='master_admin'?allRows('platform_team_archive','deleted_at'):[],
    pState.currentUser.role==='master_admin'?pb.rpc('platform_team_history'):{data:{operations:[]}},
  ]);
  if (summary.error) throw summary.error;
  if(teamHistory.error)throw teamHistory.error;
  if(!authorityCurrent(context))return;
  Object.assign(pState.data, { clients,support,usage,invoices,rateLog,payments,credits,platformUsers,usageSummary: summary.data,teamArchive,teamOperations:teamHistory.data.operations });
  if (pState.selectedClient) {
    const selected=clients.find(c => c.id === pState.selectedClient.id);
    if(selected)pState.selectedClient=selected;else selectClient();
  }
}
export async function loadClientData(client) {
  if(!pState.authenticated || !client)return false;
  if(pState.selectedClient?.id!==client.id)selectClient(client);
  const context=captureView(),request=++pState.clientRequestGeneration;
  const current=()=>viewCurrent(context,false) && request===pState.clientRequestGeneration;
  pState.clientData={clientId:client.id,requestGeneration:request,loading:true};
  try {
    const [operations,provision,overhaul]=await Promise.all([
      pb.rpc('platform_client_operations',{p_client:client.id}),
      pb.rpc('platform_provision_status',{p_client:client.id}),
      pb.rpc('platform_overhaul_status',{p_client:client.id}),
    ]);
    if(!current())return false;
    if(operations.error)throw new Error('Client operations unavailable. Refresh status before making changes.');
    if(!overhaul.error)localStorage.removeItem(`orbito-operation:config:${client.id}`);
    const connection=provision.data?.connection;
    const latestRead=connection?.verified_at && (!client.config_synced_at || new Date(connection.verified_at)>new Date(client.config_synced_at));
    pState.clientData={clientId:client.id,requestGeneration:request,loading:false,
      config:latestRead?{...client,...connection.health?.shop_config,id:client.id}:client,operations:operations.data,
      provisioning:provision.data,provisioningError:provision.error?.message,overhaul:overhaul.data,overhaulError:overhaul.error?.message,
      verifiedAt:latestRead?connection.verified_at:client.config_synced_at};
    return true;
  } catch {
    if(!current())return false;
    pState.clientData={clientId:client.id,requestGeneration:request,loading:false,_error:'Client operations unavailable. Refresh status before making changes.'};
    return true;
  }
}
export async function updateClientConfig(client, updates) {
  if(!clientDataMatches(client))throw Error('Refresh the selected client before changing its configuration.');
  const context=captureView();
  await serverConfigOperation(client.id,updates,async()=>{
    const {data,error}=await pb.rpc('platform_overhaul_status',{p_client:client.id});
    if(error)throw error;
    if(!viewCurrent(context) || !clientDataMatches(client))throw Error('The client view changed. No follow-up configuration request was sent.');
    return data;
  }, async requestId => {
    if(!viewCurrent(context) || !clientDataMatches(client))return;
    const { data, error } = await pb.functions.invoke('platform-config', { body: { client_id: client.id, request_id: requestId, changes: updates } });
    if (error || data?.state !== 'applied') {
      let body = data;
      try { if (error?.context) body = await error.context.clone().json(); } catch {}
      const failure = new Error(body?.error || error?.message || 'Config synchronization incomplete');
      failure.definiteFailure = body?.definite_failure === true;
      throw failure;
    }
    return data;
  });
  return viewCurrent(context);
}
