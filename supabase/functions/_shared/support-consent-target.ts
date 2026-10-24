import {legacyPublicAnonKey} from './public-api-key.ts';
// Deployment/owner approval gate, before issuing a capability. All requests target
// the canonical approved managed project; never a browser-supplied URL.
export async function approvedOwnerConsent(destination:any,consent:string,platformRef:string){
 const ref=destination.project_ref,token=Deno.env.get('PLATFORM_MANAGEMENT_TOKEN');
 if(!token||ref===platformRef||!/^[a-z]{20}$/.test(ref)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(consent))return false;
 const read=async(path:string,body?:any)=>{
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok){await r.body?.cancel();throw Error('Consent deployment unavailable')}return r.json();
 };
 try{
  const observed=await read('/database/query',{query:`select public.support_consent_capability() and exists(select 1 from app_private.support_consents c join app_private.support_cases k on k.ticket_id=c.ticket_id cross join app_private.bridge_config b cross join public.shop_config s where c.id='${consent}'::uuid and c.revoked_at is null and c.expires_at>clock_timestamp() and c.session_id is null and b.singleton and s.id=1 and s.platform_client_id=k.client_id and b.source_id=k.source_id and b.client_binding=k.client_binding and s.platform_client_id=${Number(destination.client_id)}) as approved`});
  if(observed?.[0]?.approved!==true)return false;
  const anon=legacyPublicAnonKey(await read('/api-keys?reveal=true'),ref);if(!anon)return false;
  for(const name of ['login','account-admin','verify-pin']){
   const r=await fetch(`https://${ref}.supabase.co/functions/v1/${name}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:anon,Authorization:'Bearer '+anon,'x-retrasell-support-policy':'v1','Content-Type':'application/json'},body:'{}'});
   if(!r.ok){await r.body?.cancel();return false}const body=await r.json();if(body?.contract!=='retrasell-owner-consent-v1'||body.function!==name)return false;
  }
  return true;
 }catch{return false}
}
