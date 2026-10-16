// Actual Vite/frontend modules and DOM; only Supabase transport is synthetic.
// Owned headless browser/server, loopback only, no hosted account/client writes.
import {createServer} from 'vite';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const baseline=process.argv[2]==='--baseline';
assert.ok(process.argv.length===2 || (process.argv.length===3 && baseline),'Only pinned --baseline is accepted');
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright'));}
catch{console.log('SKIP: existing Playwright unavailable');process.exitCode=2;}
if(chromium){
 const reviewed='6ea96cbc6cddda1b07b37646dba7e3456e45d52f';
 const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},
  define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public-fixture'),'import.meta.env.VITE_PLATFORM_AUTH_EMAIL':JSON.stringify('master@example.test'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('')},
  plugins:[{name:'synthetic-supabase',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-supabase':null,
   load:id=>id==='\0fixture-supabase'?'export const createClient=()=>window.fixtureSDK;':null,
   transform:(_code,id)=>baseline && id.replaceAll('\\','/').endsWith('/src/render.js')?execFileSync('git',['show',reviewed+':src/render.js'],{encoding:'utf8'}):null}]});
 let browser,page;const errors=[],external=[];
 try{
  await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  const context=await browser.newContext();await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():(external.push(route.request().url()),route.abort()));
  await context.addInitScript(()=>{
   window.fixtureRole=new URL(location.href).searchParams.get('fixtureRole') || 'master_admin';
   const actor=window.fixtureRole==='master_admin'?'97000000-0000-4000-8000-000000000001':'97000000-0000-4000-8000-000000000002',session='97000000-0000-4000-8000-000000000009';
   window.fixtureClients=[{id:1,name:'Client One',industry:'Retail',plan:'Basic',currency:'PKR',currency_symbol:'Rs.',status:'Active',lifecycle_state:'Active',onboarding_version:2,pairing_mode:'managed',owner_name:'Fixture Owner',owner_email:'owner@example.test',billing_policy:'usage-v1',infrastructure_state:'present',shop_url:'https://shop.example.test',supabase_url:'https://abcdefghijklmnopqrst.supabase.co'},
    {id:2,name:'Client Two',industry:'Retail',plan:'Basic',currency:'PKR',status:'Active',lifecycle_state:'Active',onboarding_version:2}];
   window.fixtureWrites=[];window.fixtureQueries=[];window.fixtureRevoked=false;window.fixtureShopRead=null;
   const identity=()=>({auth_user_id:actor,email:'employee@example.test',role:window.fixtureRole,username:window.fixtureRole==='master_admin'?'Fixture Master':'Fixture Employee',session_id:session});
   const pick=(row,fields)=>Object.fromEntries(fields.map(key=>[key,row[key]]));
   const memberRows=dataset=>({clients:window.fixtureClients.map(c=>pick(c,window.fixtureRole==='billing_person'?['id','name','plan','status','lifecycle_state','currency','billing_policy']:['id','name','industry','plan','status','lifecycle_state','infrastructure_state','onboarding_version','pairing_mode','shop_url','currency','billing_policy','ems_enabled'])),
    support:[{id:1,client_id:1,client_name:'Client One',subject:'Required support',message:'Required support content',status:'Open'}],
    invoices:[{id:71,client_id:1,period_start:'2026-10-01',period_end:'2026-10-12',total_due:123,payment_status:'Unpaid',status:'Unpaid'}],
    payments:[{id:1,invoice_id:71,client_id:1,amount:10}],usage:[{id:1,client_id:1,module_type:'BILL',token_count:1,rate_at_log:5}],credits:[],rateLog:[],account:[{id:actor,auth_user_id:actor,name:'Fixture Employee',email:'employee@example.test',role:window.fixtureRole,status:'Active'}]})[dataset];
   const query=table=>{window.fixtureQueries.push(table);let mode='read',payload,id;const q={select:()=>q,order:()=>q,eq:(_key,value)=>{id=value;return q;},range:async()=>({data:table==='clients'?window.fixtureClients:[]}),
    single:async()=>({data:table==='platform_config'?{id:1,admin_username:'Fixture Master'}:window.fixtureClients.find(c=>c.id===id)}),
    update:value=>{mode='update';payload=value;return q;},insert:value=>{mode='insert';payload=value;return q;},
    then:resolve=>{window.fixtureWrites.push({table,mode,id,payload});if(mode==='update')Object.assign(window.fixtureClients.find(c=>c.id===id),payload);resolve({});}};return q;};
   window.fixtureSDK={from:query,auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:actor}}}}),getUser:async()=>({data:{user:{id:actor}}}),signOut:async()=>({})},
    rpc:async(name,args)=>{if(name==='platform_save_client'){window.fixtureWrites.push({id:args.p_client,payload:args.p_data});Object.assign(window.fixtureClients.find(c=>c.id===args.p_client),args.p_data);return {data:window.fixtureClients.find(c=>c.id===args.p_client)};}
     if(name==='platform_read_page')return window.fixtureDenyPayments && args.p_dataset==='payments'?{error:{code:'42501'}}:{data:{...identity(),rows:args.p_offset?[]:memberRows(args.p_dataset)}};
     return {data:name==='platform_operator_identity'?identity():name==='platform_session_status'?{authorized:!window.fixtureRevoked,...identity()}:name==='platform_team_setup_context'?{kind:'active',auth_user_id:actor}:name==='platform_team_history'?{operations:[]}:name==='platform_dashboard_summary'?{open_tickets:1}:name==='platform_usage_summary'?[]:name==='platform_client_operations'?{client:args.p_client,requests:[],supplies:[],thermal:{},projection:{payload:{outstanding_total:113}}}:{} };},
    functions:{invoke:async(name)=>name==='platform-config'?new Promise((resolve,reject)=>window.fixtureShopRead={resolve,reject}):({data:{}})}};
  });
  page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
  const state=()=>page.evaluate(async()=>{const {pState}=await import('/src/state.js');return {client:pState.selectedClient?.id,loading:pState.clientData.loading,config:pState.clientData.config,authenticated:pState.authenticated};});
  const start=async width=>{await page.setViewportSize({width,height:900});await page.goto(origin);await page.getByRole('button',{name:'Manage',exact:true}).first().click();await page.getByText('Manage modules',{exact:true}).click();await page.getByRole('button',{name:'Read current Shop settings',exact:true}).waitFor();};
  const read=async()=>{await page.getByRole('button',{name:'Read current Shop settings',exact:true}).click();await page.waitForFunction(()=>window.fixtureShopRead!==null);};
  const open=()=>page.getByRole('button',{name:'Edit Client',exact:true}).click();
  const navigate=async name=>{const link=page.locator('[data-p-page="'+name+'"]').first();if((await link.boundingBox()).x<0)await page.locator('#p-menu-btn').click();await link.click();};
  const finish=async outcome=>{await page.evaluate(outcome=>{const gate=window.fixtureShopRead;window.fixtureShopRead=null;if(outcome==='network')gate.reject(Error('Synthetic failure'));else gate.resolve(outcome==='api'?{error:{message:'Synthetic failure'}}:{data:{config:{id:999,ems_enabled:true}}});},outcome);await page.waitForFunction(async()=>!(await import('/src/state.js')).pState.clientData.loading);};
  for(const width of [320,768,1440]){
   for(const outcome of ['success','api','network']){
    await start(width);await read();await open();
    const form=page.locator('form[data-p-form="edit-client"]');await form.locator('[name=name]').fill('Unsaved Name');await form.locator('[name=industry]').fill('Unsaved Industry');await form.locator('[name=plan]').selectOption('Pro');
    await form.locator('[name=industry]').focus();await form.locator('[name=industry]').evaluate(el=>{window.editedInput=el;el.setSelectionRange(2,7);});
    await finish(outcome);
    assert.equal(await form.locator('[name=name]').inputValue(),'Unsaved Name','background response must preserve typed fields');
    assert.equal(await form.locator('[name=plan]').inputValue(),'Pro');
    assert.deepEqual(await page.evaluate(()=>({same:document.querySelector('[data-p-form="edit-client"] [name=industry]')===window.editedInput,focus:document.activeElement===window.editedInput,start:window.editedInput.selectionStart,end:window.editedInput.selectionEnd})),{same:true,focus:true,start:2,end:7});
    await page.evaluate(async()=>{const {loadPlatform}=await import('/src/supabase.js'),{render}=await import('/src/render.js');await loadPlatform();render();});
    assert.equal(await form.locator('[name=name]').inputValue(),'Unsaved Name','routine background refresh must preserve the live form too');
    if(outcome!=='success'){await form.getByRole('button',{name:'Save',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);assert.equal(await form.locator('[name=name]').inputValue(),'Unsaved Name');await page.getByText('Refresh the selected client before saving changes. Your draft has been kept.',{exact:true}).waitFor();await page.getByRole('button',{name:'Dismiss notification',exact:true}).click();}
    await form.getByRole('button',{name:'Cancel',exact:true}).click();await form.waitFor({state:'detached'});
    if(outcome!=='success')await page.getByRole('button',{name:'Refresh status',exact:true}).click();
    assert.equal((await state()).loading,false);await open();assert.equal(await page.locator('[data-p-form="edit-client"] [name=name]').inputValue(),'Client One');await page.locator('[data-p-form="edit-client"]').getByRole('button',{name:'Cancel',exact:true}).click();
   }
   for(const outcome of ['success','api','network']){
    await start(width);await read();await open();await page.locator('[data-p-form="edit-client"]').getByRole('button',{name:'Cancel',exact:true}).click();await finish(outcome);
    assert.equal((await state()).loading,false);assert.equal(await page.locator('[data-p-form="edit-client"]').count(),0);assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);
    if(outcome!=='success')await page.getByRole('button',{name:'Refresh status',exact:true}).click();
    await open();assert.equal(await page.locator('[data-p-form="edit-client"] [name=name]').inputValue(),'Client One');
    if(outcome==='success'){
     await page.locator('[data-p-form="edit-client"] [name=name]').fill('Saved Name');await page.locator('[data-p-form="edit-client"]').getByRole('button',{name:'Save',exact:true}).click();
     await page.locator('[data-p-form="edit-client"]').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.fixtureWrites.at(-1).payload.name),'Saved Name');
    }else await page.locator('[data-p-form="edit-client"]').getByRole('button',{name:'Cancel',exact:true}).click();
   }
   console.log('PASS: Edit Client DOM/input/focus/cursor, success/API/rejection, close/reopen and submit at '+width+'px');
  }
  for(const change of ['client','logout','revocation']){
   await start(1440);await read();
   if(change==='client'){await page.evaluate(async()=>{const {pState}=await import('/src/state.js'),{selectClient}=await import('/src/async-context.js');selectClient(window.fixtureClients[1]);pState.clientData={clientId:2,requestGeneration:pState.clientRequestGeneration,config:{id:2},operations:{client:2}};});}
   else if(change==='logout')await page.locator('[data-p-action="logout"]').click();
   else await page.evaluate(async()=>{window.fixtureRevoked=true;const {validateSession}=await import('/src/helpers.js'),{render}=await import('/src/render.js');await validateSession(render);});
   await finish('success');const s=await state();if(change==='client')assert.equal(s.config.id,2);else {assert.equal(s.authenticated,false);assert.equal(s.config,undefined);}
  }
  if(!baseline)for(const width of [320,768,1440]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/?fixtureRole=portfolio_manager');
   await navigate('clients');await page.getByRole('button',{name:'Manage',exact:true}).first().click();
   await page.getByText('INV-71',{exact:false}).waitFor();assert.equal(await page.locator('[data-p-action="view-invoice"]').count(),0);assert.equal(await page.getByText('Lifecycle / provisioning audit',{exact:true}).count(),0);
   await page.getByText('Manage modules',{exact:true}).click();await read();await open();await page.locator('[data-p-form="edit-client"] [name=name]').fill('Old role draft');
   await page.evaluate(async()=>{window.fixtureRole='billing_person';const {validateSession}=await import('/src/helpers.js'),{render}=await import('/src/render.js');await validateSession(render);});
   await finish('success');assert.equal(await page.locator('[data-p-form="edit-client"]').count(),0);
   await navigate('billing');await page.getByText('Client Billing Matrix',{exact:true}).waitFor();await page.locator('[data-p-action="view-invoice"]').first().click();await page.locator('[data-p-close]').first().click();
   const isolated=await page.evaluate(async()=>{const {pState}=await import('/src/state.js');return {role:pState.currentUser.role,support:pState.data.support.length,payments:pState.data.payments.length,accounts:pState.data.platformUsers.length,config:pState.clientData.config,queries:window.fixtureQueries};});
   assert.deepEqual(isolated,{role:'billing_person',support:0,payments:1,accounts:1,config:undefined,queries:[]});
   await page.evaluate(async()=>{window.fixtureDenyPayments=true;const {loadPlatform}=await import('/src/supabase.js');await loadPlatform().catch(()=>{});});
   await page.getByText('Authorized Platform data is unavailable.',{exact:false}).waitFor();assert.equal(await page.getByText('No issued invoices yet.',{exact:false}).count(),0);assert.equal(await page.locator('[data-p-action="generate-invoice"]').count(),0);
   await navigate('settings');await page.locator('[data-p-form="change-own-password"]').waitFor();assert.equal(await page.getByText('Team Management',{exact:true}).count(),0);
   console.log('PASS: Manager summary/support and Billing invoice/own-account journeys, live role invalidation and explicit read error at '+width+'px');
  }
  if(!baseline)for(const outcome of ['applied','uncertain']){
   await start(1440);
   await page.evaluate(async outcome=>{
    window.fixtureWrites=[];
    const prior=window.fixtureSDK.rpc;window.fixtureSDK.rpc=async(name,args)=>name==='platform_config_intent'?{data:{pending:true,changes:{technician_module_enabled:true}}}:prior(name,args);
    window.fixtureSDK.functions.invoke=async(name,{body})=>{window.fixtureWrites.push({name,body});return {data:{state:outcome}};};
    const {pState}=await import('/src/state.js');pState.clientData.overhaul={entitlement_intent:{pending:true}};(await import('/src/render.js')).render();
   },outcome);
   await page.getByRole('button',{name:'Reconcile current plan',exact:true}).click();
   await page.getByText(outcome==='applied'?'Current plan entitlements verified with the Shop.':'Shop synchronization is not confirmed.',{exact:outcome==='applied'}).waitFor();
   assert.equal(await page.evaluate(()=>window.fixtureWrites.length),1);
   if(outcome!=='applied')assert.equal(await page.getByText('Current plan entitlements verified with the Shop.',{exact:true}).count(),0);
  }
  console.log('PASS: explicit current-intent reconciliation and uncertain response in actual browser handlers');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: stale config denies client-switch/logout/revocation; zero external traffic/page errors');
 }catch(error){console.error(error.message);if(page)console.error(await page.evaluate(async()=>{const {pState}=await import('/src/state.js');return {role:pState.currentUser.role,ready:pState.dataReady,error:pState.dataError,modal:pState.modal?.type,writes:window.fixtureWrites,queries:window.fixtureQueries};}));process.exitCode=1;}finally{await browser?.close();await server.close();}
}
