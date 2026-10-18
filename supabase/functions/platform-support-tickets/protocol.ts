// Shared Support v1 wire rules. Keep the two repositories byte-identical.
export const CONTRACT = 'retrasell-support-v1';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class SupportError extends Error { status: number; constructor(status: number) { super('Support request failed'); this.status=status; } }
export async function jsonBody(input: Request | Response, limit=16384, empty=false) {
 const reader=input.body?.getReader(); if(!reader){if(empty)return null;throw new SupportError(400);}
 const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
 try { while(true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>limit){await reader.cancel();throw new SupportError(413);}text+=decoder.decode(value,{stream:true});}
  const value=text+decoder.decode();return empty&&!value.trim()?null:JSON.parse(value);
 } catch(error) {if(error instanceof SupportError)throw error;throw new SupportError(400);}
}
export function fields(body: any, server=false) {
 if(!body || typeof body!=='object' || Array.isArray(body))throw new SupportError(400);
 let allowed=['action'];
 if(body.action==='create') {
  allowed.push('request_id','subject','category','message');
  if(!UUID.test(body.request_id||'') || typeof body.subject!=='string' || typeof body.message!=='string'
   || !['technical','billing_question','account','other'].includes(body.category))throw new SupportError(400);
  body={...body,subject:body.subject.trim(),message:body.message.trim()};
  if([...body.subject].length<1 || [...body.subject].length>160 || [...body.message].length<1 || [...body.message].length>4000)throw new SupportError(400);
 } else if(body.action==='list') {allowed.push('offset');if(!Number.isInteger(body.offset)||body.offset<0||body.offset>5000)throw new SupportError(400);
 } else if(body.action==='get') {allowed.push('ticket_id');if(!UUID.test(body.ticket_id||''))throw new SupportError(400);
 } else throw new SupportError(400);
 if(server){allowed.push('contract','project_ref','source_id','client_binding');if(body.contract!==CONTRACT)throw new SupportError(400);}
 if(Object.keys(body).some(k=>!allowed.includes(k)))throw new SupportError(400);
 return body;
}
export function project(url: string) {const match=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(url);if(!match)throw new SupportError(503);return match[1];}
export function endpoint(url: string, own: string) {
 if(!/^https:\/\/[a-z]{20}\.supabase\.co\/functions\/v1\/platform-support-tickets$/.test(url)||url.startsWith(own+'/'))throw new SupportError(503);return url;
}
export function bearer(req: Request, name='authorization') {const token=req.headers.get(name)?.match(/^Bearer (\S+)$/i)?.[1];if(!token||token.length>8192)throw new SupportError(401);return token;}
export const sha=async(value: string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function proof(secret: string, value: any) {const enc=new TextEncoder();const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function http(fetcher: typeof fetch,url: string,headers: any,body?: any) {
 let response: Response;try {response=await fetcher(url,{method:body===undefined?'GET':'POST',headers:{...headers,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(8000),...(body===undefined?{}:{body:JSON.stringify(body)})});}catch{throw new SupportError(503);}
 let data: any;try{data=await jsonBody(response,1048576,true);}catch{throw new SupportError(503);}
 return {ok:response.ok,status:response.status,data};
}
export async function rpc(fetcher: typeof fetch,url: string,key: string,token: string,name: string,args: any) {
 const result=await http(fetcher,url+'/rest/v1/rpc/'+name,{apikey:key,Authorization:'Bearer '+token},args);
 if(!result.ok){const code=result.data?.code;throw new SupportError(code==='23505'||code==='PT409'?409:code==='PT429'?429:code==='PT404'?404:code==='42501'?403:code==='22023'?400:503);}return result.data;
}
export async function actor(fetcher: typeof fetch,url: string,key: string,token: string) {
 let claims: any;try{claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{throw new SupportError(401);}
 const now=Date.now()/1000;if(!Number.isFinite(claims.exp)||claims.exp<=now||claims.exp>now+3660)throw new SupportError(401);
 const user=await http(fetcher,url+'/auth/v1/user',{apikey:key,Authorization:'Bearer '+token});
 if(!user.ok)throw new SupportError(user.status>=500?503:401);
 const context=await rpc(fetcher,url,key,token,'support_ticket_actor_context',{});
 if(!UUID.test(context?.auth_user_id||'') || !UUID.test(context?.session_id||'') || context.auth_user_id!==user.data?.id
  || context.auth_user_id!==claims.sub || context.session_id!==claims.session_id || !['Business Owner','Manager'].includes(context.role))throw new SupportError(403);
 return context;
}
export function fail(error: unknown,headers: any={}) {const status=error instanceof SupportError?error.status:503;return Response.json({error:status===409?'This request changed. Recover the original request before submitting again.':status===429?'Support limit reached. Try later.':status===503?'Support is unavailable or not enabled. Retry the same request after access is restored.':status===403?'Your current account or Shop cannot use customer Support.':status===401?'Sign in again to use Support.':status===404?'Ticket unavailable.':'Invalid Support request.'},{status,headers:{...headers,'Cache-Control':'no-store',...(status===429?{'Retry-After':'3600'}:{})}});}
