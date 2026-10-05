// Management responses can also contain privileged keys. Return only a legacy
// public anon JWT; callers must never expose or log the complete response.
export function legacyPublicAnonKey(keys: any,projectRef: string): string | undefined {
 if(!Array.isArray(keys) || !/^[a-z]{20}$/.test(projectRef || ''))return
 for(const key of keys){
  if(key?.name!=='anon' || (key.type!==undefined && key.type!=='legacy') || typeof key.api_key!=='string'
   || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key.api_key))continue
  try {
   const claims=JSON.parse(atob(key.api_key.split('.')[1].replaceAll('-','+').replaceAll('_','/')))
   const now=Date.now()/1000
   if(claims.role!=='anon' || claims.ref!==projectRef
    || (claims.exp!==undefined && (typeof claims.exp!=='number' || !Number.isFinite(claims.exp) || claims.exp<=now))
    || (claims.nbf!==undefined && (typeof claims.nbf!=='number' || !Number.isFinite(claims.nbf) || claims.nbf>now)))continue
   return key.api_key
  } catch { /* Ignore incompatible entries without retaining their values. */ }
 }
}
