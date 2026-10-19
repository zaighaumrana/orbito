import accepted from './shop-release.json' with {type:'json'};
import support from '../../releases/shop-release-support-v2.json' with {type:'json'};
import active from '../../releases/active-shop-release.json' with {type:'json'};
export const releases:Record<string,any>={'accepted-v1':accepted,'support-v2':support};
export const activeRelease=active;
export async function validateRelease(release:any){
 const {sha256,...body}=release;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)))),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==sha256)throw Error('Release fingerprint mismatch');
 return release;
}
export async function pinManagedRelease(admin:any,requestId:string){
 const result=await admin.rpc('platform_managed_release_pin',{p_request:requestId,p_release:active.release_id,p_sha256:active.sha256});
 if(result.error)throw Error('Managed release pin unavailable');
 const release=releases[result.data?.release_id];
 if(!release||release.sha256!==result.data.sha256)throw Error('Pinned release unavailable; restore the exact recorded package before retrying.');
 return validateRelease(release);
}
