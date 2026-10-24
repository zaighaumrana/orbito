import {pState} from './state.js';
import {captureAuthority,authorityCurrent,selectClient} from './async-context.js';
import {loadClientData,loadPlatform} from './supabase.js';
import {openSupport} from './support-controller.js';
let epoch=0;
export function routePath(){
 const historical=pState.clientView==='historical',query=pState.clientView==='all'?'?view=all':historical?'?view=historical':'';
 if(pState.page==='client-detail'&&pState.selectedClient)return `/clients/${pState.selectedClient.id}${historical?'?view=historical':''}`;
 const paths={overview:'/',clients:'/clients',billing:'/billing',support:'/support',settings:'/settings',team:'/team'};
 return (paths[pState.page]||'/')+(pState.page==='clients'?query:'');
}
export async function restoreRoute(render,target=location.href){
 if(!pState.authenticated)return;
 if(target!==location.href)history.replaceState(null,'',target);
 const owned=++epoch,context=captureAuthority(),url=new URL(location.href),path=url.pathname;
 let selection=null,clientId=null;
 const current=()=>owned===epoch&&authorityCurrent(context)&&(selection===null||pState.page==='client-detail'&&pState.selectedClient?.id===clientId&&pState.clientSelectionGeneration===selection);
 pState.resourceOffset=0;selectClient();pState.modal=null;pState.clientView='current';pState.routeError=null;
 const historical=url.searchParams.get('view')==='historical',all=url.searchParams.get('view')==='all';
 if(path.startsWith('/clients/')||path==='/clients'){
  pState.page='clients';
  if(pState.currentUser.role==='billing_person'){pState.routeError='Your role cannot open client details.';render();return}
  if((historical||all)&&pState.currentUser.role!=='master_admin'){pState.routeError='Historical clients require the Master administrator.';render();return}
  pState.clientView=historical?'historical':all?'all':'current';
  if(path==='/clients'){try{await loadPlatform();}catch{}if(current())render();return}
  const id=/^\/clients\/([1-9]\d*)\/?$/.exec(path)?.[1];
  let client=null;
  if(id){selectClient({id:Number(id)});clientId=Number(id);selection=pState.clientSelectionGeneration;pState.page='client-detail';try{await loadPlatform();}catch{if(current())render();return;}client=pState.selectedClient;if(!current())return;}
  if(!client||(client.lifecycle_state==='Archived'&&pState.currentUser.role!=='master_admin')){pState.routeError='This client is unavailable or you do not have access.';render();return}
  if(client.lifecycle_state==='Archived')pState.clientView='historical';
  if(!current())return;selectClient(client);clientId=client.id;selection=pState.clientSelectionGeneration;pState.page='client-detail';render();
  if(await loadClientData(client,{readOnly:true})&&current()&&pState.selectedClient?.id===client.id)render();return;
 }
 pState.page=({'/':'overview','/billing':'billing','/support':'support','/settings':'settings','/team':'team'})[path]||'overview';
 if(pState.page==='support'){pState.dataReady=true;pState.dataError=null;await openSupport(render);return;}
 try{await loadPlatform();}catch{/* Keep the verified session and render the resource retry state. */}if(current())render();
}
