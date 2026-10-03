import { pb } from './supabase.js';
export async function openShopSupport(client) {
 // Open synchronously from the click so browsers do not block the new tab.
 const tab=window.open('about:blank','_blank');
 if(!tab)throw new Error('Allow pop-ups to open this support session.');
 tab.opener=null;
 try {
  const {data,error}=await pb.functions.invoke('platform-support',{body:{action:'issue',client_id:client.id}});
  if(error || !/^[a-f0-9]{64}$/.test(data?.token||''))throw new Error('Support authorization could not be issued. Check your master session and Shop pairing.');
  const destination=new URL(data.shop_url);
  if(destination.protocol!=='https:' || destination.username || destination.password || destination.search || destination.hash)throw new Error('Shop address is invalid.');
  destination.pathname='/';destination.hash='support='+data.token;
  tab.location.replace(destination.href);
 } catch(error){tab.close();throw error;}
}
