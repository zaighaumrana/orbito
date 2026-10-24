import {assessBackend} from '../_shared/backend-inventory.ts';
import {releases} from '../_shared/shop-release-registry.ts';
import {bridgeCallCredential} from '../_shared/shop-credentials.ts';
import {jsonBody} from '../platform-support-tickets/protocol.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const reply=(status:number,body:any)=>Response.json(body,{status,headers:cors});
export const migrationInventoryQuery="select version,name,encode(extensions.digest(replace(array_to_string(statements,E'\\n'),E'\\r\\n',E'\\n'),'sha256'),'hex') as sha256 from supabase_migrations.schema_migrations order by version";
export function inventoryHandler(env:(key:string)=>string|undefined,makeClients:any,transport:typeof fetch=fetch){return async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return reply(405,{error:'POST required'});
 const deadline=Date.now()+65000;
 const http:typeof fetch=(input,init={})=>{const left=deadline-Date.now();if(left<1000)throw Error('Diagnostic budget exhausted');return transport(input,{...init,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(Math.min(15000,left)),...(init.signal?[init.signal]:[])])});};
 const {caller,admin}=makeClients(req.headers.get('authorization')||'',http);
 let body:any;try{body=await jsonBody(req);if(!body||Object.keys(body).join(',')!=='client_id'||!Number.isSafeInteger(body.client_id)||body.client_id<1)throw Error();}catch{return reply(400,{error:'Exact client required'});}
 const auth=await caller.auth.getUser();if(auth.error||!auth.data?.user)return reply(401,{error:'Sign in required'});
 const claim=await caller.rpc('platform_backend_inventory_begin',{p_client:body.client_id});
 if(claim.error)return reply(claim.error.code==='PT429'?429:403,{error:'Live Master access and an eligible Shop are required. Wait before repeating a refresh.'});
 const c=claim.data,observation:any={origin:c.mode==='managed'?'managed-provider-and-restricted-bridge':'restricted-bridge-attestation',limitations:[]};
 const url=env('SUPABASE_URL')||'';
 if(!/^[a-z]{20}$/.test(c.project_ref)||url===`https://${c.project_ref}.supabase.co`)return reply(403,{error:'Distinct exact Shop required'});
 if(c.mode==='managed')try{
  const token=env('PLATFORM_MANAGEMENT_TOKEN');if(!token)throw Error();
  const api=async(path:string,body?:any)=>{const response=await http(`https://api.supabase.com/v1/projects/${c.project_ref}${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok){await response.body?.cancel();throw Error();}return jsonBody(response,1048576);};
  const project=await api('');if(project?.id!==c.project_ref)throw Error();
  const history=await api('/database/query',{query:migrationInventoryQuery});
  if(!Array.isArray(history)||history.length>500||history.some((r:any)=>!/^\d{14}$/.test(r.version)||typeof r.name!=='string'||r.name.length>150||!/^[a-f0-9]{64}$/.test(r.sha256)))throw Error();
  observation.migrations=history;
  const deployed=await api('/functions');if(!Array.isArray(deployed)||deployed.length>100)throw Error();
  const names=[...new Set(Object.values(releases).flatMap((r:any)=>r.functions.map((f:any)=>f.name)))];
  observation.functions=names.map(name=>{const f=deployed.find((f:any)=>(f.slug||f.name)===name);return {name,present:!!f,verify_jwt:f?.verify_jwt,source_sha256:null,...(typeof f?.version==='number'?{provider_revision:f.version}:{}),...(/^[a-f0-9]{64}$/.test(f?.ezbr_sha256||'')?{provider_bundle_sha256:f.ezbr_sha256}:{})};});
 }catch{observation.limitations.push('Managed provider evidence unavailable or incomplete; no remediation attempted');}
 try{
  const target=await bridgeCallCredential(admin,body.client_id);if(!target||target.project_ref!==c.project_ref||!c.source_id||!c.client_binding)throw Error();
  const challenge=crypto.randomUUID();const response=await http(`https://${c.project_ref}.supabase.co/functions/v1/platform-bridge`,{method:'POST',headers:{Authorization:'Bearer '+target.bridge_call_secret,'Content-Type':'application/json'},body:JSON.stringify({operation:'backend-capabilities',challenge})});
  if(!response.ok){await response.body?.cancel();throw Error();}const probe=await jsonBody(response,32768);
  if(probe.contract!=='retrasell-backend-capabilities-v1'||probe.challenge!==challenge||probe.client_id!==body.client_id||probe.source_id!==c.source_id||probe.client_binding!==c.client_binding)throw Error();
  const caps=['usage-outbox','billing-projection','config-journal','support-identity','support-consent','support-durable-submissions','owner-bootstrap','private-rls'];
  const runtime=['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'];
  if(caps.some(k=>typeof probe.capabilities?.[k]!=='boolean'))throw Error();
  observation.capabilities=Object.fromEntries(caps.map(k=>[k,probe.capabilities[k]]));observation.runtime=Object.fromEntries(runtime.map(k=>[k,typeof probe.runtime?.[k]==='boolean'?probe.runtime[k]:null]));
 }catch{observation.limitations.push('Restricted capability/runtime probe unavailable; older supported installations may lack it');}
 const report=assessBackend(c.catalog,releases,observation);
 const saved=await admin.rpc('platform_backend_inventory_finish',{p_client:body.client_id,p_invocation:c.invocation,p_report:report});
 if(saved.error)return reply(503,{error:'Diagnostic result could not be saved or ownership changed. Refresh the original client view.'});
 return reply(200,{report,checked_at:new Date().toISOString()});
};}
