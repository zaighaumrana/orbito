import { pb } from './supabase.js';
import { captureView, viewCurrent } from './async-context.js';
export async function openShopSupport(client) {
 const context=captureView();
 if(!viewCurrent(context) || context.client!==client?.id)return;
 // Open synchronously from the click so browsers do not block the new tab.
 const tab=window.open('about:blank','_blank');
 if(!tab)throw new Error('Allow pop-ups to open this support session.');
 tab.opener=null;
 try {
  // Read the protected Master approval independently of the editable business URL.
  const approved=await pb.rpc('platform_support_destination',{p_client:client.id});
  if(!viewCurrent(context)){tab.close();return;}
  if(approved.error || approved.data?.client_id!==client.id)throw new Error('A Master-approved Shop support destination is required.');
  const expected=approved.data;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const origin=new URL(expected.origin);
  if(origin.protocol!=='https:' || origin.origin!==expected.origin || origin.pathname!=='/' || origin.search || origin.hash || origin.username || origin.password
    || !/^[a-z]{20}$/.test(expected.project_ref||'') || typeof expected.client_binding!=='string' || !expected.client_binding
    || !uuid.test(expected.source_id||'') || !uuid.test(expected.revision||''))throw new Error('A valid current Master-approved Shop support destination is required.');
  const {data,error}=await pb.functions.invoke('platform-support',{body:{action:'issue',client_id:client.id}});
  if(!viewCurrent(context)){tab.close();return;}
  if(error || !/^[a-f0-9]{64}$/.test(data?.token||''))throw new Error('Support authorization could not be issued. Check your master session and Shop pairing.');
  const destination=new URL(data.shop_url);
  if(destination.protocol!=='https:' || destination.username || destination.password || destination.search || destination.hash || destination.pathname!=='/'
    || destination.origin!==expected.origin || data.shop_url!==expected.origin
    || !['client_id','project_ref','client_binding','source_id','revision','origin'].every(k=>data.destination?.[k]===expected[k]))throw new Error('Approved Shop pairing changed. Review the support destination again.');
  destination.pathname='/';destination.hash='support='+data.token;
  tab.location.replace(destination.href);
 } catch(error){tab.close();throw error;}
}
