import {CONTRACT,UUID,jsonBody,bearer,project,http,rpc,proof,SupportError,fail} from '../platform-support-tickets/protocol.ts';

// No plaintext Support credential leaves this boundary. BYO secret installation
// runs in the customer's own CLI; only its hash is enrolled here.
export function enrollmentHandler(env: (key:string)=>string|undefined,fetcher: typeof fetch=fetch) {
 return async(req: Request)=>{
  const headers={'Cache-Control':'no-store'};
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405,headers});
  try {
   const b=await jsonBody(req);
   if(!b || Array.isArray(b) || Object.keys(b).some(k=>!['action','client_id','request_id','data'].includes(k))
    || !['prepare','status','install','verify','revoke'].includes(b.action)||!UUID.test(b.request_id||'')
    || !Number.isSafeInteger(b.client_id)||b.client_id<1 || (b.action!=='prepare' && b.data!==undefined))throw new SupportError(400);
   const url=env('SUPABASE_URL')||'',ref=project(url),anon=env('SUPABASE_ANON_KEY')||'',service=env('SUPABASE_SERVICE_ROLE_KEY')||'',token=bearer(req);
   const user=await http(fetcher,url+'/auth/v1/user',{apikey:anon,Authorization:'Bearer '+token});
   if(!user.ok)throw new SupportError(401);
   const identity=await rpc(fetcher,url,anon,token,'platform_operator_identity',{});
   if(identity?.role!=='master_admin'||identity.auth_user_id!==user.data?.id||!UUID.test(identity.session_id||''))throw new SupportError(403);
   const command=(action:string,data:any={})=>rpc(fetcher,url,service,service,'platform_support_credential_command',{
    p_actor:identity.auth_user_id,p_session:identity.session_id,p_client:b.client_id,p_request:b.request_id,p_action:action,p_data:data});
   if(b.action==='prepare'){
    const d=b.data;if(!d||typeof d!=='object'||Array.isArray(d)||d.project_ref===ref||!/^[a-z]{20}$/.test(d.project_ref||''))throw new SupportError(400);
    const key=d.shop_public_api_key;
    if(typeof key!=='string'||key.length>4096)throw new SupportError(400);
    // Current Shop gateway contract uses the project's legacy public anon JWT.
    // The registered key cannot be an arbitrary bearer/secret or another project.
    let claims:any;try{claims=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{throw new SupportError(400);}
    if(claims.role!=='anon'||claims.ref!==d.project_ref||claims.exp<=Date.now()/1000)throw new SupportError(400);
    return Response.json(await command('prepare',d),{headers});
   }
   if(b.action==='status'||b.action==='revoke')return Response.json(await command(b.action),{headers});
   const material=await command('material');
   const shop='https://'+material.project_ref+'.supabase.co';project(shop);
   if(material.project_ref===ref)throw new SupportError(403);
   const target=url+'/functions/v1/platform-support-tickets';
   if(b.action==='install'){
    if(material.pairing_mode!=='managed'||!/^[a-f0-9]{64}$/.test(material.secret||''))throw new SupportError(403);
    const management=env('PLATFORM_MANAGEMENT_TOKEN');if(!management)throw new SupportError(503);
    await command('installation_started');
    const installed=await http(fetcher,'https://api.supabase.com/v1/projects/'+material.project_ref+'/secrets',
     {Authorization:'Bearer '+management},[{name:'PLATFORM_SUPPORT_TICKETS_SECRET',value:material.secret},{name:'PLATFORM_SUPPORT_TICKETS_ENDPOINT',value:target}]);
    if(!installed.ok)throw new SupportError(503);
    await command('installation_acknowledged');
    // An install response is not an enable command. Explicit verify follows.
    return Response.json({installed:true,enabled:false,request_id:b.request_id},{headers});
   }
   const challenge=crypto.randomUUID();
   // Proof is keyed by SHA256(installed secret); only non-secret metadata returns.
   const capability=await http(fetcher,shop+'/functions/v1/support-tickets',{
    apikey:material.shop_public_api_key,Authorization:'Bearer '+material.shop_public_api_key,
    'x-support-probe':material.secret_sha256}, {action:'capability',challenge});
   const c=capability.data;
   const signed=[CONTRACT,challenge,material.project_ref,material.source_id,material.client_binding,b.client_id,target];
   if(!capability.ok||c.contract!==CONTRACT||c.challenge!==challenge||c.project_ref!==material.project_ref
    ||c.source_id!==material.source_id||c.client_binding!==material.client_binding||c.platform_client_id!==b.client_id
    ||c.endpoint!==target||c.proof!==await proof(material.secret_sha256,signed))throw new SupportError(503);
   return Response.json(await command('enable',{capability:CONTRACT}),{headers});
  }catch(error){return fail(error,headers);}
 };
}
