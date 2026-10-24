// File contents and credential hash remain transient; nothing enters HTML,
// application state, browser storage, logs or another customer's request.
export async function submitByoSupport(form,client,sdk,current){
 if(!client||client.pairing_mode!=='byo'||!current())throw Error('Select the verified BYO client first.');
 const file=form.elements.enrollment.files?.[0];
 if(!file||file.size>8192)throw Error('Select the customer’s small hash enrollment file.');
 const handoff=JSON.parse(await file.text());
 if(!current())return;
 const fields=['request_id','project_ref','client_id','source_id','client_binding','secret_sha256'];
 if(Object.keys(handoff).sort().join(',')!==fields.sort().join(',')||handoff.client_id!==client.id
  ||client.supabase_url!==`https://${handoff.project_ref}.supabase.co`||!/^[a-f0-9]{64}$/.test(handoff.secret_sha256||'')
  ||![handoff.source_id,handoff.request_id].every(x=>/^[0-9a-f-]{36}$/i.test(x||'')))throw Error('Hash handoff does not match the selected Shop.');
 const publicKey=form.elements.shop_public_api_key.value.trim();
 const send=async(action,data)=>{
  if(!current())return;
  const response=await sdk.functions.invoke('platform-support-enrollment',{body:{client_id:client.id,request_id:handoff.request_id,action,...(data?{data}:{})}});
  if(response.error||response.data?.error)throw Error('Enrollment is incomplete. Retain the same customer file and retry after installation and owner readiness are verified.');
  if(!current())return;
  return response.data;
 };
 await send('prepare',{project_ref:handoff.project_ref,source_id:handoff.source_id,client_binding:handoff.client_binding,secret_sha256:handoff.secret_sha256,shop_public_api_key:publicKey,scopes:['ticket:create','ticket:read']});
 if(current())await send('verify');
}
