import accepted from './shop-release.json' with {type:'json'};
import support from '../../releases/shop-release-support-v2.json' with {type:'json'};
import v3 from '../../releases/shop-release-support-v3.json' with {type:'json'};
import v4 from '../../releases/shop-release-support-v4.json' with {type:'json'};
import v5 from '../../releases/shop-release-support-v5.json' with {type:'json'};
import v6 from '../../releases/shop-release-support-v6.json' with {type:'json'};
import v7 from '../../releases/shop-release-support-v7.json' with {type:'json'};
import active from '../../releases/active-shop-release.json' with {type:'json'};
export const releases:Record<string,any>={'accepted-v1':accepted,'support-v2':support,'support-v3':v3,'support-v4':v4,'support-v5':v5,'support-v6':v6,'support-v7':v7};
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
