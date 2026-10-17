// Capture routing hints before the SDK's asynchronous fragment consumption.
// The provider/DB remain the authority; URL data never activates a member.
const initial = new URLSearchParams(window.location.hash.slice(1));
let hint = initial.get('type');
let hasReset = new URLSearchParams(window.location.search).has('reset');
let proof = initial.get('token_hash');
let failedLink = initial.has('error') || initial.has('error_code');
if (failedLink || proof) history.replaceState(null,'',window.location.pathname+window.location.search);
let generation = 0;

export function createSetupRouter({pb,state,render,notify}) {
  const error = message => { state.authenticated=false;state.authRouting=false;state.page='setup-error';state.setupMessage=message;render(); };
  function clear() {
    generation++;
    if(hasReset || hint || proof || failedLink) {
      const query=new URLSearchParams(window.location.search);query.delete('reset');
      history.replaceState(null,'',window.location.pathname+(query.size?'?'+query.toString():''));
    }
    hint=null;hasReset=false;proof=null;failedLink=false;state.passwordFlow=null;state.recoveryEmail=null;
  }
  async function resolve(session,event) {
    const current=++generation;
    if (failedLink) { error('This account link is invalid, expired or already used. Contact your administrator for a new approved link.');return true; }
    if (!session) {
      if(hasReset){error('No valid account-link session was found. Open the latest email link, or contact your administrator.');return true;}
      return false;
    }
    const verified=await pb.auth.getUser();
    if(current!==generation)return true;
    if(verified.error || !verified.data?.user) {error('The account-link session could not be verified. Try again or contact your administrator.');return true;}
    const context=await pb.rpc('platform_team_setup_context');
    if(current!==generation)return true;
    if(context.error || context.data?.auth_user_id!==verified.data.user.id) {
      if(hasReset || event==='PASSWORD_RECOVERY'){error('The account is not eligible for setup, or its invitation is still being recorded. Retry verification or contact your administrator.');return true;}
      return false;
    }
    const kind=context.data.kind;
    const recovery=event==='PASSWORD_RECOVERY' || hint==='recovery';
    if(kind==='pending' || (kind==='active' && recovery)) {
      state.passwordFlow={requestId:state.passwordFlow?.requestId || crypto.randomUUID(),kind};
      state.recoveryEmail=context.data.email;state.authenticated=false;state.authRouting=false;state.page='reset-password';render();return true;
    }
    if(kind==='inactive'){error('Your account has been deactivated by the administrator. Please contact your administrator to restore access.');return true;}
    // ?reset=true alone never turns the existing master session into onboarding.
    return false;
  }
  return {
    async boot(session) {
      const scheduled=generation;
      if(proof){
        const hash=proof;
        // Remove credentials before any render/analytics/navigation. Memory only.
        history.replaceState(null,'',window.location.pathname+window.location.search);
        const result=await pb.auth.verifyOtp({token_hash:hash,type:hint});
        if(scheduled!==generation)return true;
        if(result.error || !result.data?.session){error('This link is invalid, expired, revoked or already used. Contact your administrator.');return true;}
        session=result.data.session;
      }
      return resolve(session,hint==='recovery'?'PASSWORD_RECOVERY':'INITIAL_SESSION');
    },
    event(event,session) {
      if(event==='SIGNED_OUT'){clear();return;}
      if(state.passwordFlow || !['SIGNED_IN','INITIAL_SESSION','PASSWORD_RECOVERY'].includes(event))return;
      // Auth callbacks must stay synchronous: SDK calls here can deadlock its lock.
      const scheduled=generation;
      setTimeout(()=>{if(scheduled===generation && !state.passwordFlow)void resolve(session,event).catch(()=>{if(generation===scheduled+1)error('Account verification is unavailable. Retry or contact your administrator.');});},0);
    },
    async retry(){const scheduled=generation;const {data,error:failure}=await pb.auth.getSession();if(scheduled!==generation)return true;if(failure)throw failure;return resolve(data.session,hint==='recovery'?'PASSWORD_RECOVERY':'INITIAL_SESSION');},
    clear,
  };
}
