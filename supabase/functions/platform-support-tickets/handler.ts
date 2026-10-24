import {fields,jsonBody,bearer,sha,project,actor,rpc,SupportError,fail} from './protocol.ts';
export function ticketHandler(env: (key:string)=>string|undefined,fetcher: typeof fetch=fetch) {
 return async(req: Request)=>{
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
  try {
   const body=fields(await jsonBody(req),true),url=env('SUPABASE_URL')||'';project(url);
   const service=env('SUPABASE_SERVICE_ROLE_KEY')||'';if(!service)throw new SupportError(503);
   const token=bearer(req);if(!/^[a-f0-9]{64}$/.test(token))throw new SupportError(401);
   const hash=await sha(token);
   let source:any;try{source=await rpc(fetcher,url,service,service,'platform_support_ticket_source',{p_hash:hash,p_action:body.action});}
   catch(error){if(error instanceof SupportError && error.status===403)throw new SupportError(401);throw error;}
   if(!/^[a-z]{20}$/.test(source.project_ref||'')||source.project_ref===project(url))throw new SupportError(503);
   if(body.project_ref!==source.project_ref||body.source_id!==source.source_id||body.client_binding!==source.client_binding)throw new SupportError(403);
   // The credential record alone selects both destinations. Never use JWT iss or a visitor URL.
   const verified=await actor(fetcher,'https://'+source.project_ref+'.supabase.co',source.shop_public_api_key,bearer(req,'x-shop-user-authorization'));
   if(verified.source_id!==source.source_id||verified.client_binding!==source.client_binding||verified.platform_client_id!==source.client_id)throw new SupportError(403);
   const common={p_hash:hash,p_actor:verified,p_verified_at:new Date().toISOString()};
   if(body.action==='create'){
    const result=await rpc(fetcher,url,service,service,'platform_support_ticket_create',{...common,
     p_assertions:{project_ref:body.project_ref,source_id:body.source_id,client_binding:body.client_binding},p_request:body.request_id,
     p_fields:{subject:body.subject,category:body.category,message:body.message}});
    return Response.json(result,{status:202,headers:{'Cache-Control':'no-store'}});
   }
   const rows=await rpc(fetcher,url,service,service,'platform_support_ticket_read',{...common,p_ticket:body.action==='get'?body.ticket_id:null,p_offset:body.action==='list'?body.offset:0});
   if(!Array.isArray(rows))throw new SupportError(503);
   if(body.action==='get'&&!rows.length)throw new SupportError(404);
   return Response.json(body.action==='get'?{ticket:rows[0]}:{tickets:rows,offset:body.offset,has_more:rows.length===50},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return fail(error);}
 };
}
