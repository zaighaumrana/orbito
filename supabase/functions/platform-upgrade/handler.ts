import {releases,validateRelease,activeRelease} from '../_shared/shop-release-registry.ts';
import catalog from '../../releases/approved-shop-releases.json' with {type:'json'};
import {digest,makeUpgradePlan,requireShopReady,requireUpgradeProgress,verifyUpgradeResult,shopUpgradeQuery,migrationEvidenceQuery} from '../_shared/upgrade-contract.js';
import {executeUpgrade} from '../_shared/upgrade-engine.js';
import {managedUpgradeProvider} from '../_shared/upgrade-provider.ts';
import {jsonBody} from '../platform-support-tickets/protocol.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-retrasell-upgrade-token','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const uuid=(v:any)=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const reply=(status:number,body:any)=>Response.json(body,{status,headers:cors});
const tokenHash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
export function upgradeHandler(env:any,clients:any,transport:typeof fetch=fetch){return async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return reply(405,{error:'POST required'});
 const started=Date.now(),deadline=started+75000;
 const http:typeof fetch=(url,init={})=>{const left=deadline-Date.now();if(left<5000)throw Error('Invocation budget exhausted');return transport(url,{...init,signal:AbortSignal.any([AbortSignal.timeout(Math.min(20000,left)),...(init.signal?[init.signal]:[])])});};
 const {caller,admin}=clients(req.headers.get('authorization')||'',http);
 const rpc=async(client:any,name:string,args:any)=>{const r=await client.rpc(name,args);if(r.error)throw Error('Upgrade authority, ownership, pending-operation or compatibility gate refused this action.');return r.data;};
 try{
  const b=await jsonBody(req,96000);if(!b||!uuid(b.request_id))return reply(400,{error:'Original upgrade request required'});
  const customer=req.headers.get('x-retrasell-upgrade-token');
  if(customer){
   if(!/^[a-f0-9]{64}$/.test(customer)||!['customer-claim','customer-command'].includes(b.action)||Object.keys(b).some(k=>!['action','request_id','invocation','kind','args'].includes(k)))return reply(403,{error:'Restricted customer clearance required'});
   const hash=await tokenHash(customer);
   if(b.action==='customer-claim')return reply(200,{job:await rpc(admin,'platform_upgrade_customer_claim',{p_request:b.request_id,p_hash:hash})});
   if(!uuid(b.invocation)||!['check','dispatch','passed','uncertain','pause','finish'].includes(b.kind))return reply(400,{error:'Restricted original command required'});
   return reply(200,{job:await rpc(admin,'platform_upgrade_command',{p_request:b.request_id,p_invocation:b.invocation,p_kind:b.kind,p_args:b.args||{},p_customer_hash:hash})});
  }
  const auth=await caller.auth.getUser();if(auth.error||!auth.data?.user)return reply(401,{error:'Sign in required'});
  const identity=await rpc(caller,'platform_operator_identity',{});if(identity.role!=='master_admin')return reply(403,{error:'Live Master approval required'});
  if(b.action==='review'){
   if(Object.keys(b).some(k=>!['action','request_id','client_id','source_sha256','observation'].includes(k)))throw Error('Exact review fields required.');
   const j=await rpc(caller,'platform_upgrade_prepare',{p_client:b.client_id,p_request:b.request_id,p_source:b.source_sha256,p_target:activeRelease.sha256});
   if(j.plan)return reply(200,{job:await rpc(caller,'platform_upgrade_status',{p_client:j.client_id})});
   if(j.project_ref===(env('SUPABASE_URL')||'').match(/https:\/\/([a-z]{20})/)?.[1])throw Error('Platform cannot be a Shop destination.');
   const source=await validateRelease(Object.values(releases).find((r:any)=>r.sha256===j.source_sha256)),target=await validateRelease(releases[activeRelease.release_id]);
   let observation:any;
   if(j.mode==='managed')observation=await managedUpgradeProvider(j.project_ref,env('PLATFORM_MANAGEMENT_TOKEN'),http).observe();
   else {observation=b.observation;if(!observation||JSON.stringify(observation).length>60000)throw Error('Customer-local projected assessment required.');observation={shop:observation.shop,migrations:observation.migrations,functions:observation.functions?.map((f:any)=>({name:f.name,present:f.present,verify_jwt:f.verify_jwt,source_sha256:null})),origin:'customer-reported-read-only-assessment',runtime_ready:observation.runtime_ready};}
   const plan=makeUpgradePlan(source,target,catalog.find((c:any)=>c.sha256===j.source_sha256),catalog.find((c:any)=>c.sha256===j.target_sha256),observation,{client_id:j.client_id,project_ref:j.project_ref,source_id:j.source_id,client_binding:j.client_binding});
   await rpc(admin,'platform_upgrade_store_plan',{p_request:j.request_id,p_plan:plan,p_sha256:await digest(plan)});
   return reply(200,{job:await rpc(caller,'platform_upgrade_status',{p_client:j.client_id})});
  }
  if(b.action==='customer-token'){
   if(Object.keys(b).some(k=>!['action','request_id','client_id'].includes(k)))throw Error('Exact request required.');
   const j=await rpc(caller,'platform_upgrade_status',{p_client:b.client_id});if(j?.request_id!==b.request_id||j.mode!=='byo'||j.actor_id!==auth.data.user.id)throw Error('Exact approved BYO job required.');
   const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
   await rpc(admin,'platform_upgrade_customer_token',{p_request:j.request_id,p_hash:await tokenHash(secret)});
   return reply(200,{approval:{contract:'retrasell-byo-upgrade-clearance-v1',platform_url:env('SUPABASE_URL'),platform_public_key:env('SUPABASE_ANON_KEY'),request_id:j.request_id,plan:j.plan,plan_sha256:j.plan_sha256,token:secret}});
  }
  if(b.action!=='execute'||Object.keys(b).some(k=>!['action','request_id'].includes(k)))return reply(400,{error:'Explicit review, customer token or execute required'});
  const j=await rpc(caller,'platform_upgrade_claim',{p_request:b.request_id});
  const release=await validateRelease(Object.values(releases).find((r:any)=>r.sha256===j.target_sha256)),provider=managedUpgradeProvider(j.project_ref,env('PLATFORM_MANAGEMENT_TOKEN'),http);
  const command=(kind:string,args:any={})=>rpc(admin,'platform_upgrade_command',{p_request:j.request_id,p_invocation:j.invocation,p_kind:kind,p_args:args});
  const inspect=async()=>{await command('check');const [rows,history]=await Promise.all([provider.query(shopUpgradeQuery),provider.query(migrationEvidenceQuery)]);requireShopReady({shop:rows?.[0]},j);requireUpgradeProgress(release,j.plan,history,j.steps);};
  try{return reply(200,{job:await executeUpgrade(j,release,{command,inspect,migrate:provider.migrate,deploy:provider.deploy,verify:async()=>verifyUpgradeResult(release,await provider.observe(),j)},{budget:Math.max(0,deadline-Date.now()-10000),maxSteps:2})});}
  catch{try{await command('uncertain');}catch{}return reply(409,{error:'Original upgrade stopped. Refresh its status and reconcile any uncertain provider outcome before continuing.',request_id:j.request_id});}
 }catch{return reply(409,{error:'Upgrade stopped by target, authority, pending-operation or evidence safeguards. Refresh the original job; no replacement identity was created.'});}
};}
