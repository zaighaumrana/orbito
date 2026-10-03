import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}
const reply=(status: number,body: any)=>Response.json(body,{status,headers})
const hash=async(value: string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')
async function requestText(req: Request) {
 const reader=req.body?.getReader(),decoder=new TextDecoder();let size=0,text=''
 if(!reader)return ''
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return null}text+=decoder.decode(value,{stream:true})}
 return text+decoder.decode()
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers})
 if(req.method!=='POST')return reply(405,{error:'POST required'})
 try {
  const text=await requestText(req);if(text===null)return reply(413,{error:'Request too large'})
  const body=JSON.parse(text)
  if(!body || Array.isArray(body))return reply(400,{error:'Invalid support request'})
  const url=Deno.env.get('SUPABASE_URL')!,options={auth:{persistSession:false,autoRefreshToken:false}}
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options)
  if(body.action==='issue'){
   if(Object.keys(body).some(k=>!['action','client_id'].includes(k)) || !Number.isSafeInteger(body.client_id) || body.client_id<1)return reply(400,{error:'Invalid client'})
   const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{...options,global:{headers:{Authorization:req.headers.get('authorization')||''}}})
   const user=await caller.auth.getUser(),identity=await caller.rpc('platform_operator_identity')
   if(user.error || !user.data?.user || identity.error || identity.data?.auth_user_id!==user.data.user.id || identity.data?.role!=='master_admin')return reply(403,{error:'Verified master administrator required'})
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
   const platformRef=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(url)?.[1]
   if(!platformRef)return reply(503,{error:'Platform project identity invalid'})
   const grant=await admin.rpc('platform_support_issue',{p_client:body.client_id,p_actor:user.data.user.id,p_token_hash:await hash(token),p_platform_project:platformRef})
   if(grant.error || !grant.data)return reply(409,{error:'Support access requires an active or suspended, paired managed Shop'})
   return reply(200,{token,shop_url:grant.data.shop_url,expires_at:grant.data.expires_at})
  }
  if(body.action==='exchange'){
   if(Object.keys(body).some(k=>!['action','token','client_id','project_ref','client_binding','source_id'].includes(k))
    || typeof body.token!=='string' || !/^[a-f0-9]{64}$/.test(body.token) || !Number.isSafeInteger(body.client_id) || body.client_id<1
    || typeof body.project_ref!=='string' || !/^[a-z]{20}$/.test(body.project_ref) || typeof body.client_binding!=='string' || !body.client_binding || body.client_binding.length>256
    || typeof body.source_id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.source_id))return reply(400,{error:'Invalid support authorization'})
   const secret=req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]||''
   if(secret.length<32 || secret.length>512)return reply(401,{error:'Shop pairing required'})
   const result=await admin.rpc('platform_support_consume',{p_token_hash:await hash(body.token),p_source_hash:await hash(secret),p_client:body.client_id,p_project:body.project_ref,p_binding:body.client_binding,p_source:body.source_id})
   if(result.error || !result.data?.ok)return reply(401,{error:'Support authorization invalid, expired or already used. Open a new support session from Platform.'})
   const {ok,contract,platform_user_id,platform_email,client_id,project_ref,client_binding,source_id}=result.data
   return reply(200,{ok,contract,platform_user_id,platform_email,client_id,project_ref,client_binding,source_id})
  }
  return reply(400,{error:'Invalid support action'})
 } catch {return reply(503,{error:'Secure support access unavailable. Open a new support session from Platform.'})}
})
