import { createClient } from '@supabase/supabase-js';
import { pState, setPCFG, refreshRoleState } from './state.js';
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
      suspended: 'Your account has been deactivated by the administrator. Please contact your administrator to restore access.',
      master_only: 'Only the verified master administrator can change the Platform username.',
      network: 'Authentication could not be reached. Check your connection and try again.',
      rate_limit: 'Too many authentication attempts. Wait before trying again.',
      authentication: 'Password verification could not be completed. Try again after fresh verification.',
      continuity: 'Password verification is disabled until administrator session continuity is verified. Contact the Platform owner.',
      diagnostic_uncertain: 'Master session continuity could not be confirmed. Sign in again if needed. Permanent deletion remains disabled.',
      diagnostic_cleanup: 'Temporary-session cleanup could not be confirmed. Contact the Platform owner before another diagnostic. Permanent deletion remains disabled.',
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
  if (error || data?.auth_user_id !== verified.data.user.id || !['master_admin','portfolio_manager','billing_person'].includes(data?.role)) {
    // Only a verified Auth identity can receive its own suspension notice.
    // Native pre-auth user_banned errors stay generic: they precede password checks.
    const notice=await pb.rpc('platform_account_access_notice');
    if(!notice.error && notice.data?.auth_user_id===verified.data.user.id && notice.data.inactive===true)throw new PlatformAuthError('suspended');
    throw new PlatformAuthError('authority');
  }
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
// Diagnostic only. It deliberately does NOT consult or enable the delete policy,
// and its result is never used as authorization by reauthenticateMaster/deletion.
export async function diagnoseMasterSession(password,captchaToken) {
  if(!password || !captchaToken)throw new PlatformAuthError(!password?'invalid_credentials':'captcha_failed');
  const context=captureAuthority(),owned=()=>authorityCurrent(context);
  const before=await loadOperatorIdentity();
  if(!owned())throw new PlatformAuthError('session');
  if(before.role!=='master_admin' || !before.session_id)throw new PlatformAuthError('master_only');
  const verifier=createClient(import.meta.env.VITE_PLATFORM_URL,import.meta.env.VITE_PLATFORM_ANON,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'platform-continuity-diagnostic'}});
  let sessionCreated=false,verified=false,cleanupFailed=false;
  try {
    const result=await verifier.auth.signInWithPassword({email:before.email,password,options:{captchaToken}});
    sessionCreated=Boolean(result.data?.session);
    if(!owned())throw new PlatformAuthError('session');
    if(result.error)throw (['invalid_credentials','captcha_failed'].includes(result.error.code) || result.error.status===429)?authFailure(result.error):new PlatformAuthError('diagnostic_uncertain');
    if(!sessionCreated || result.data.user?.id!==before.auth_user_id)throw new PlatformAuthError('authority');
    const temporary=await verifier.rpc('platform_operator_identity');
    if(!owned())throw new PlatformAuthError('session');
    if(temporary.error || temporary.data?.role!=='master_admin' || temporary.data.auth_user_id!==before.auth_user_id
      || !temporary.data.session_id || temporary.data.session_id===before.session_id)throw new PlatformAuthError('authority');
    // A session row/getUser alone cannot prove single-session continuity. Test
    // native refresh WHILE the temporary grant exists, before cleaning it up.
    const duringRefresh=await pb.auth.refreshSession();
    if(!owned())throw new PlatformAuthError('session');
    if(duringRefresh.error || duringRefresh.data?.session?.user?.id!==before.auth_user_id)throw new PlatformAuthError('diagnostic_uncertain');
    const during=await loadOperatorIdentity();
    verified=during.role==='master_admin' && during.auth_user_id===before.auth_user_id && during.session_id===before.session_id;
  } finally {
    password='';captchaToken='';
    if(sessionCreated){try{cleanupFailed=Boolean((await verifier.auth.signOut({scope:'local'}))?.error);}catch{cleanupFailed=true;}}
    if(cleanupFailed)throw new PlatformAuthError('diagnostic_cleanup');
  }
  if(!owned())throw new PlatformAuthError('session');
  if(!verified)throw new PlatformAuthError('diagnostic_uncertain');
  const refreshed=await pb.auth.refreshSession();
  if(!owned())throw new PlatformAuthError('session');
  if(refreshed.error || refreshed.data?.session?.user?.id!==before.auth_user_id)throw new PlatformAuthError('diagnostic_uncertain');
  // Two independent canonical reads after cleanup/refresh, no token inspection,
  // no setSession, no original-session sign-in or sign-out.
  for(let n=0;n<2;n++){
    const after=await loadOperatorIdentity();
    if(!owned())throw new PlatformAuthError('session');
    if(after.role!=='master_admin' || after.auth_user_id!==before.auth_user_id || after.session_id!==before.session_id)throw new PlatformAuthError('diagnostic_uncertain');
  }
  return {success:true};
}
export async function loadConfig() {
  if(pState.currentUser.role!=='master_admin')return;
  const generation=pState.authorityGeneration;
  const { data, error } = await pb.from('platform_config').select('id,admin_username').single();
  if (error) throw error;
  if (data && generation===pState.authorityGeneration) setPCFG(data);
}
async function memberRows(dataset,context,onRoleChange) {
  const rows=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await pb.rpc('platform_read_page',{p_dataset:dataset,p_offset:offset});
    if(error)throw error;
    if(data?.auth_user_id!==context.id || data?.session_id!==context.session || !Array.isArray(data?.rows)
      || !['master_admin','portfolio_manager','billing_person'].includes(data.role))throw Error('Read authorization could not be verified.');
    if(data.role!==context.role){
      // Handle each owned response even if another dataset already rejected.
      if(authorityCurrent(context))onRoleChange(data.role);
      throw Error('Your role changed. Refreshing authorized data.');
    }
    rows.push(...data.rows);if(data.rows.length<1000)return rows;
  }
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
export async function loadPlatform(retryRole=true) {
  if(!pState.authenticated)return;
  let context=captureAuthority();
  let roleRefresh;
  const onRoleChange=role=>{
    refreshRoleState({...pState.currentUser,role});context=captureAuthority();
    if(retryRole){
      const refreshed=context;roleRefresh=loadPlatform(false);
      // The old aggregate may already have failed; still render its successor.
      roleRefresh.then(()=>{if(authorityCurrent(refreshed))pState.onRoleChange?.();},()=>{});
    }else{
      pState.dataError='Your role changed again. Refresh authorized Platform data before making changes.';
      pState.onDataError?.();
    }
  };
  try {
  const identity=await loadOperatorIdentity();
  if(!authorityCurrent(context))return;
  if(identity.auth_user_id!==context.id || identity.session_id!==context.session)throw new PlatformAuthError('authority');
  if(identity.role!==context.role){refreshRoleState(identity);context=captureAuthority();}
  if(context.role!=='master_admin'){
    const datasets=context.role==='portfolio_manager'?['clients','support','invoices','account']:['clients','usage','invoices','payments','credits','rateLog','account'];
    const [pages,summary,dashboard]=await Promise.all([Promise.all(datasets.map(name=>memberRows(name,context,onRoleChange))),pb.rpc('platform_usage_summary'),pb.rpc('platform_dashboard_summary')]);
    if(summary.error || !Array.isArray(summary.data))throw summary.error || Error('Usage summary unavailable.');
    if(dashboard.error || !Number.isInteger(dashboard.data?.open_tickets))throw dashboard.error || Error('Dashboard summary unavailable.');
    if(!authorityCurrent(context))return;
    const next={clients:[],support:[],usage:[],invoices:[],rateLog:[],payments:[],credits:[],platformUsers:[],teamArchive:[],teamOperations:[]};
    datasets.forEach((name,i)=>next[name==='account'?'platformUsers':name]=pages[i]);
    Object.assign(pState.data,next,{usageSummary:summary.data,openTickets:dashboard.data.open_tickets});
  }else{
  const [clients,support,usage,invoices,rateLog,payments,credits,platformUsers,summary,teamArchive,teamHistory] = await Promise.all([
    allRows('clients','id'), allRows('support_tickets','id'),
    allRows('usage_logs','id'), allRows('billing_cycles','id'), allRows('pricing_rate_log','id'),
    allRows('payments','id'), allRows('client_credit','id'),
    allRows('platform_users','id','id,auth_user_id,name,email,role,status,created_at,suspended_from'),
    pb.rpc('platform_usage_summary'),
    pState.currentUser.role==='master_admin'?allRows('platform_team_archive','deleted_at'):[],
    pState.currentUser.role==='master_admin'?pb.rpc('platform_team_history'):{data:{operations:[]}},
  ]);
  if (summary.error || !Array.isArray(summary.data)) throw summary.error || Error('Usage summary unavailable.');
  if(teamHistory.error || !Array.isArray(teamHistory.data?.operations))throw teamHistory.error || Error('Team history unavailable.');
  if(!authorityCurrent(context))return;
  Object.assign(pState.data, { clients,support,usage,invoices,rateLog,payments,credits,platformUsers,usageSummary: summary.data,teamArchive,teamOperations:teamHistory.data.operations });
  }
  pState.dataReady=true;pState.dataError=null;
  if (pState.selectedClient) {
    const selected=pState.data.clients.find(c => c.id === pState.selectedClient.id);
    if(selected)pState.selectedClient=selected;else selectClient();
  }
  }catch(error){
    if(roleRefresh)return roleRefresh;
    if(!authorityCurrent(context))return;
    pState.dataReady=false;pState.dataError='Authorized Platform data is unavailable. Refresh before making changes.';
    pState.onDataError?.();
    throw error;
  }
}
export async function loadClientData(client) {
  if(!pState.authenticated || !client)return false;
  if(!['master_admin','portfolio_manager'].includes(pState.currentUser.role))return false;
  if(pState.selectedClient?.id!==client.id)selectClient(client);
  const context=captureView(),request=++pState.clientRequestGeneration;
  const current=()=>viewCurrent(context,false) && request===pState.clientRequestGeneration;
  pState.clientData={clientId:client.id,requestGeneration:request,loading:true};
  try {
    const [operations,provision,overhaul,support]=await Promise.all([
      pb.rpc('platform_client_operations',{p_client:client.id}),
      pState.currentUser.role==='master_admin'?pb.rpc('platform_provision_status',{p_client:client.id}):{data:null},
      pb.rpc('platform_overhaul_status',{p_client:client.id}),
      pb.rpc('platform_support_automation_status',{p_client:client.id}),
    ]);
    if(!current())return false;
    if(operations.error)throw new Error('Client operations unavailable. Refresh status before making changes.');
    let supportStatus=support.error?{state:'attention',reason:'status_unavailable'}:support.data;
    if(pState.currentUser.role==='master_admin'&&client.pairing_mode==='managed'&&client.onboarding_version===2&&provision.data?.job?.state==='complete'&&supportStatus?.state!=='enabled'&&supportStatus?.state!=='revoked'){
      try{
        const automatic=await pb.functions.invoke('platform-provision',{body:{client_id:client.id,request_id:crypto.randomUUID(),action:'support-reconcile',params:{}}});
        if(!current())return false;
        if(!automatic.error&&automatic.data?.support)supportStatus=automatic.data.support;
      }catch{/* Optional Support cannot suppress the business client view. */}
    }
    if(!current())return false;
    if(!overhaul.error)localStorage.removeItem(`orbito-operation:config:${client.id}`);
    const connection=provision.data?.connection;
    const latestRead=connection?.verified_at && (!client.config_synced_at || new Date(connection.verified_at)>new Date(client.config_synced_at));
    pState.clientData={clientId:client.id,requestGeneration:request,loading:false,
      config:latestRead?{...client,...connection.health?.shop_config,id:client.id}:client,operations:operations.data,
      provisioning:provision.data,provisioningError:provision.error?.message,overhaul:overhaul.data,overhaulError:overhaul.error?.message,
      verifiedAt:latestRead?connection.verified_at:client.config_synced_at,supportAutomation:supportStatus};
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
  const result=await serverConfigOperation(client.id,updates,async()=>{
    const {data,error}=await pb.rpc('platform_overhaul_status',{p_client:client.id});
    if(error)throw error;
    if(!viewCurrent(context) || !clientDataMatches(client))throw Error('The client view changed. No follow-up configuration request was sent.');
    return data;
  }, async (requestId,changes) => {
    if(!viewCurrent(context) || !clientDataMatches(client))return;
    const { data, error } = await pb.functions.invoke('platform-config', { body: { client_id: client.id, request_id: requestId, changes } });
    if (error || data?.state !== 'applied') {
      let body = data;
      try { if (error?.context) body = await error.context.clone().json(); } catch {}
      const failure = new Error(body?.error || error?.message || 'Config synchronization incomplete');
      failure.definiteFailure = body?.definite_failure === true;
      throw failure;
    }
    return data;
  },()=>viewCurrent(context) && clientDataMatches(client));
  return result?.state==='applied' && viewCurrent(context);
}

// Support is paged independently; late responses cannot cross session/role/view boundaries.
export async function loadSupportPage(offset=0) {
 const context=captureView(),generation=pState.authorityGeneration,request=(pState.supportRequest||0)+1;
 pState.supportRequest=request;
 if(!['master_admin','portfolio_manager'].includes(pState.currentUser.role))throw new PlatformAuthError('authority');
 const {data,error}=await pb.rpc('platform_support_ticket_page',{p_offset:offset});
 if(!viewCurrent(context)||generation!==pState.authorityGeneration||request!==pState.supportRequest)return;
 if(error||!Array.isArray(data?.rows))throw error||Error('Support tickets unavailable.');
 pState.supportView=data;
}
