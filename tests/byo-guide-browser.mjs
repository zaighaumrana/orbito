// Real Platform entry/events/forms; persistent isolated provider double. Native
// SQL separately establishes authorization, tenant binding and atomic receipts.
import {createServer} from 'vite';import {pathToFileURL} from 'node:url';import {mkdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import assert from 'node:assert/strict';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'fixture',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-sdk':null,load:id=>id==='\0fixture-sdk'?'export const createClient=(...a)=>window.fixtureClientFactory(...a);':null}]});
const records=new Map(),creations=new Map(),calls=[],errors=[],external=[];let browser,lost=true,releaseCreation;
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));
 await context.exposeBinding('wizardRPC',async(_s,name,a,role)=>{
  if(name==='created')return [...creations.values()].map(x=>x.row);
  calls.push({name,a,role});if(!['master_admin','portfolio_manager'].includes(role))return {error:{code:'42501'}};
  if(name==='platform_create_client_once'){
   let saved=creations.get(a.p_request);if(saved&&saved.payload!==JSON.stringify(a.p_data))return {error:{code:'42501'}};
   if(!saved){saved={payload:JSON.stringify(a.p_data),row:{...a.p_data,id:3,onboarding_version:2,lifecycle_state:'Provisioning',infrastructure_state:'unknown',status:'Active'}};creations.set(a.p_request,saved)}
   if(lost){lost=false;await new Promise(resolve=>{releaseCreation=resolve});return {error:{code:'transport'}}}return {data:saved.row};
  }
  if(role!=='master_admin')return {error:{code:'42501'}};
  const ref=a.p_client===1?'abcdefghijklmnopqrst':'bcdefghijklmnopqrstu';if(a.p_project_ref!==ref)return {error:{code:'42501'}};
  let s=records.get(a.p_client)||{client_id:a.p_client,project_ref:ref,client_binding:'orbito-client-'+a.p_client,revision:0,current_step:1,marks:{},history:[],observations:{backend_runtime_verified:false,owner_active:false,onboarding_complete:false,support_enabled:false}};
  if(a.p_step){if(a.p_revision!==s.revision||a.p_binding!==s.client_binding)return {error:{code:'40001'}};s=structuredClone(s);s.revision++;s.current_step=a.p_step;if(a.p_mark)s.marks[a.p_step]={mark:a.p_mark,category:a.p_category};s.history.push({actor:'synthetic-master',at:'2026-10-21T12:00:00Z',step:a.p_step,mark:a.p_mark||'viewed'});records.set(a.p_client,s)}return {data:structuredClone(s)};
 });
 function fixture(){
  const enrich=async rows=>{rows.forEach(c=>{c.pairing_mode='byo';if(c.id===2){c.supabase_url='https://bcdefghijklmnopqrstu.supabase.co';c.owner_email='other@example.test';c.owner_name='Other Owner';if(window.routeOnly)c.lifecycle_state='Archived'}});for(const c of await window.wizardRPC('created',{},window.fixtureRole))if(!rows.some(x=>x.id===c.id))rows.push(c);return rows};
  const from=window.fixtureSDK.from;window.fixtureSDK.from=table=>{const q=from(table);if(table==='clients'){const range=q.range;q.range=async(...a)=>{const r=await range(...a);r.data=await enrich(r.data);return r}}return q};
  const original=window.fixtureSDK.rpc;window.fixtureSDK.rpc=async(name,a={})=>{
  if(['platform_byo_progress','platform_create_client_once'].includes(name))return window.wizardRPC(name,a,window.fixtureRole);
  if(name==='platform_provision_status')return {data:{connection:{bridge_call_configured:true,health:{checks:{}}}}};
  if(name==='platform_support_automation_status')return {data:{state:'waiting',reason:'prerequisites'}};
  const r=await original(name,a);if(name==='platform_read_page'&&a.p_dataset==='clients'&&Array.isArray(r.data.rows)){
   r.data.rows=await enrich(r.data.rows);
  }return r;
 }}
 await context.addInitScript({content:'window.routeOnly='+JSON.stringify(process.argv.includes('--route-only'))+';('+installPlatformFixture.toString()+')();('+fixture.toString()+')();'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 const ready=()=>page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady});
 const clients=async()=>{if(await page.locator('#p-sidebar').getAttribute('aria-hidden')==='true')await page.locator('#p-menu-btn').click();await page.locator('[data-p-page="clients"]').first().click()};
 const openClient=async id=>{await clients();await page.locator(`[data-p-action="open-client"][data-p-id="${id}"]`).click();await page.getByRole('button',{name:'Resume BYO Setup',exact:true}).waitFor()};
 const wizardStep=n=>page.waitForFunction(n=>document.querySelector('[data-wizard="byo"]')?.dataset.step===String(n),n);
 const shots=async prefix=>{if(!process.env.SUPPORT_VISUAL_DIR)return;mkdirSync(process.env.SUPPORT_VISUAL_DIR,{recursive:true});for(const width of [320,768,1024,1440])for(const theme of ['light','dark']){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'dialog horizontal overflow');await page.getByRole('dialog').evaluate(e=>e.scrollTop=0);await page.screenshot({path:join(process.env.SUPPORT_VISUAL_DIR,`${prefix}-${width}-${theme}.png`)})}};
 if(process.argv.includes('--route-only')){
  const selected=id=>page.waitForFunction(async id=>{const {pState}=await import('/src/state.js');return pState.page==='client-detail'&&pState.selectedClient?.id===id&&pState.clientData?.clientId===id&&!pState.clientData.loading},id);
  await page.goto(origin+'/clients/1');await ready();await selected(1);assert.equal(new URL(page.url()).pathname,'/clients/1');
  await page.reload();await ready();await selected(1);
  await page.goto(origin+'/clients?view=historical');await ready();await page.locator('[data-p-action="open-client"][data-p-id="2"]').click();await selected(2);assert.match(page.url(),/\/clients\/2\?view=historical$/);
  await page.reload();await ready();await selected(2);await page.getByRole('button',{name:'← Back',exact:true}).click();assert.match(page.url(),/\/clients\?view=historical$/);
  await page.goBack();await selected(2);await page.goForward();await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.page==='clients'&&pState.clientView==='historical'});
  await page.goto(origin+'/clients/999');await ready();await page.getByText('This client is unavailable or you do not have access.',{exact:true}).waitFor();
  await page.goto(origin+'/clients/2?view=historical&fixtureRole=portfolio_manager');await ready();await page.getByText('Historical clients require the Master administrator.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(async()=>{const {pState}=await import('/src/state.js');return pState.selectedClient?.id??null}),null);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: authorized direct detail/reload, historical selection/reload, Back/Forward, missing ID and Manager historical denial; no external requests.');
 }else if(process.argv.includes('--refinement-only')){
  // Focused correction pass: no client creation, database or hosted operations.
  await page.goto(origin+'/');await ready();await openClient(1);
  const support=page.locator('.support-enrollment');
  await page.setViewportSize({width:1440,height:1000});
  const bounds=await support.locator('input').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,height:r.height}}));
  assert.equal(bounds[0].top,bounds[1].top);assert.equal(bounds[0].height,bounds[1].height);
  const screenshot=async name=>{if(process.env.SUPPORT_VISUAL_DIR){mkdirSync(process.env.SUPPORT_VISUAL_DIR,{recursive:true});await page.screenshot({path:join(process.env.SUPPORT_VISUAL_DIR,name+'.png')})}};
  await support.scrollIntoViewIfNeeded();await screenshot('refinement-support-desktop-light');
  await page.setViewportSize({width:375,height:900});await page.evaluate(async()=>{const {pState}=await import('/src/state.js');pState.theme='dark';const {render}=await import('/src/render.js');render()});
  const fields=await support.locator('input').evaluateAll(es=>es.map(e=>({left:e.getBoundingClientRect().left,top:e.getBoundingClientRect().top})));
  assert.equal(fields[0].left,fields[1].left);assert.ok(fields[1].top>fields[0].top);
  await support.scrollIntoViewIfNeeded();await screenshot('refinement-support-mobile-dark');
  await page.getByRole('button',{name:'Resume BYO Setup',exact:true}).click();
  const commands=[];
  for(let n=1;n<=12;n++){
   await wizardStep(n);await page.waitForFunction(()=>!document.querySelector('[data-p-action="byo-next"]')?.disabled||document.querySelector('[data-wizard="byo"]')?.dataset.step==='12');
   assert.ok(await page.locator('.byo-tasks>li').count()>=3);assert.ok(await page.locator('.byo-context').isVisible());
   assert.equal(await page.locator('.wizard-problem').getAttribute('open'),null);
   if(n===5){
    const install=()=>page.locator('.setup-command').filter({hasText:'--mode'});
    assert.ok(await install().locator('button').isDisabled());
    assert.ok(await page.locator('.setup-command').filter({hasText:'$setupRoot ='}).locator('button').isEnabled());
    await page.locator('[data-byo-mode]').selectOption('existing');
    assert.match(await install().locator('code').textContent(),/--mode existing/);
    await page.locator('[data-byo-mode]').selectOption('fresh');
    const text=await install().locator('code').textContent();await install().locator('button').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),text);
    await page.locator('.wizard-problem summary').click();await page.locator('[data-byo-category]').selectOption('configuration');
    assert.match(await page.locator('.byo-recovery-advice').textContent(),/Restore \$setupRoot/);
    await page.locator('[data-byo-category]').selectOption('unknown_write');assert.match(await page.locator('.byo-recovery-advice').textContent(),/Keep the write fence/);
    await page.getByRole('button',{name:'Record needs attention',exact:true}).click();await page.getByText('Needs attention / blocked',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Acknowledge this stage',exact:true}).click();await page.getByText('Operator acknowledged completion',{exact:true}).waitFor();
    await page.getByText('Backend observation pending',{exact:true}).waitFor();
    assert.ok(await page.getByText('Returning after closing or restarting PowerShell?',{exact:true}).isVisible());
    await page.locator('.byo-tasks>li').first().scrollIntoViewIfNeeded();await screenshot('refinement-wizard-mobile-dark');
   }
   if(n===6)assert.match(await page.locator('.byo-tasks').textContent(),/Recovery \/ continuation only/);
   if(n===8)assert.equal(await page.locator('.byo-tasks>li').count(),8);
   if(n===9)assert.equal(await page.locator('.byo-tasks>li').count(),9);
   if(n===11){assert.equal(await page.locator('.byo-tasks>li').count(),10);assert.match(await page.locator('.byo-tasks').textContent(),/not the Supabase project ID/)}
   commands.push(...await page.locator('.setup-command code').allTextContents());
   assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'wizard overflow at stage '+n);
   if(n<12)await page.locator('[data-p-action="byo-next"]').click();
  }
  for(const flag of ['--login','--public-config','--status','--verify-dist','--enroll','--acceptance core','--acceptance support'])assert.ok(commands.some(c=>c.includes(flag)),flag);
  await page.locator('[data-p-action="byo-back"]').click();await wizardStep(11);
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Resume BYO Setup',exact:true}).click();await wizardStep(11);
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(async()=>{const {pState}=await import('/src/state.js');pState.theme='light';const {render}=await import('/src/render.js');render()});await page.locator('.byo-tasks').scrollIntoViewIfNeeded();await screenshot('refinement-wizard-desktop-light');await page.keyboard.press('Escape');
  // Exercise the real refresh event and authorized loader. Managed/complete makes
  // any accidental Support reconciliation observable; all provider writes fail.
  await page.evaluate(async()=>{
   const {pState}=await import('/src/state.js');pState.selectedClient.pairing_mode='managed';
   window.paperReads=[];window.paperWrites=[];window.paperVersion=2;window.paperDelay=false;window.paperFail=false;
   const original=window.fixtureSDK.rpc;
   window.fixtureSDK.functions.invoke=async(...args)=>{window.paperWrites.push(args);throw Error('Unexpected write')};
   window.fixtureSDK.rpc=async(name,a)=>{
    if(name==='platform_client_operations'){
     window.paperReads.push(a.p_client);const client=a.p_client,version=window.paperVersion;
     if(window.paperDelay){window.paperDelay=false;await new Promise(resolve=>window.releasePaperRead=resolve)}
     if(window.paperFail)return {error:{message:'Synthetic disconnected'}};
     return {data:{client,requests:[{request_id:'99000000-0000-4000-8000-000000000099',status:window.paperClosed?'fulfilled':'approved',sync_version:version,requested_at:'2026-10-22',communication:[{message:'Delivery updated '+version,expectation:'Tomorrow',at:'2026-10-22'}]}],supplies:[{reference:'Confirmed supply '+version,roll_count:1,usable_length_mm:1000,paper_width_mm:80,delivered_at:'2026-10-22'}],thermal:{}}};
    }
    if(name==='platform_provision_status')return {data:{job:{state:'complete'},connection:{health:{checks:{}}}}};
    return original(name,a);
   };
  });
  const delivery=()=>page.locator('form[data-p-form="paper-delivery"]');await delivery().locator('[name="reference"]').fill('Unsaved original');
  await page.evaluate(()=>window.paperDelay=true);await page.getByRole('button',{name:'Refresh paper status',exact:true}).click();
  await page.waitForFunction(()=>Boolean(window.releasePaperRead));assert.ok(await page.getByRole('button',{name:'Refreshing…'}).isDisabled());
  await page.evaluate(()=>document.querySelector('[data-p-action="refresh-paper"]').click());
  await delivery().locator('[name="reference"]').fill('Typed during refresh');await page.evaluate(()=>window.releasePaperRead());
  await page.getByText('Delivery updated 2',{exact:false}).waitFor();await page.getByText('Confirmed supply 2',{exact:false}).waitFor();assert.equal(await delivery().locator('[name="reference"]').inputValue(),'Typed during refresh');
  await page.locator('.paper-section-heading').scrollIntoViewIfNeeded();await screenshot('refinement-paper-desktop-light');
  assert.deepEqual(await page.evaluate(()=>window.paperReads),[1]);assert.deepEqual(await page.evaluate(()=>window.paperWrites),[]);
  await page.evaluate(()=>window.paperFail=true);await page.getByRole('button',{name:'Refresh paper status',exact:true}).click();await page.getByText('Paper status could not be refreshed.',{exact:false}).waitFor();assert.equal(await delivery().locator('[name="reference"]').inputValue(),'Typed during refresh');
  await delivery().locator('[name="request_id"]').selectOption('99000000-0000-4000-8000-000000000099');
  await page.evaluate(()=>{window.paperFail=false;window.paperClosed=true;window.paperVersion=3});await page.getByRole('button',{name:'Refresh paper status',exact:true}).click();
  await page.getByText('The draft request is no longer active.',{exact:false}).waitFor();assert.equal(await delivery().locator('[name="request_id"]').inputValue(),'99000000-0000-4000-8000-000000000099');
  await page.setViewportSize({width:375,height:900});await page.evaluate(async()=>{const {pState}=await import('/src/state.js');pState.theme='dark';const {render}=await import('/src/render.js');render()});
  await page.locator('.paper-section-heading').scrollIntoViewIfNeeded();assert.ok(await page.locator('.paper-section-heading').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}));await screenshot('refinement-paper-mobile-dark');
  await page.evaluate(()=>{window.paperFail=false;window.paperDelay=true;window.releasePaperRead=null});
  await page.getByRole('button',{name:'Refresh paper status',exact:true}).click();await page.waitForFunction(()=>Boolean(window.releasePaperRead));
  await openClient(2);await page.evaluate(()=>window.releasePaperRead());
  await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.clientData?.clientId===2&&!pState.clientData.loading});
  assert.equal(await page.evaluate(async()=>{const {pState}=await import('/src/state.js');return pState.clientData.operations.client}),2);
  assert.equal(await delivery().locator('[name="reference"]').inputValue(),'');
  // One session-change boundary while a read is in flight.
  await page.evaluate(()=>{window.paperDelay=true;window.releasePaperRead=null});await page.getByRole('button',{name:'Refresh paper status',exact:true}).click();await page.waitForFunction(()=>Boolean(window.releasePaperRead));
  await page.evaluate(async()=>{const {pState}=await import('/src/state.js');pState.authorityGeneration++;pState.clientData={};window.releasePaperRead()});
  await page.waitForTimeout(50);assert.equal(await page.evaluate(async()=>{const {pState}=await import('/src/state.js');return Object.keys(pState.clientData).length}),0);
  assert.deepEqual(await page.evaluate(()=>window.paperWrites),[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: focused twelve-stage navigation/copy/recovery; Support alignment desktop/mobile, wizard light/dark; paper read-only targeting, single flight, live draft retention, failure, departed client/session fencing. No external requests or provider writes.');
 } else {
 await page.goto(origin+'/');await ready();await clients();await page.locator('[data-p-modal="add-client"]').click();
 const form=()=>page.locator('form[data-p-form="add-client"]'),next=()=>page.getByRole('button',{name:'Next',exact:true});
 await next().click();assert.ok(await form().locator('[data-client-step="0"]').isVisible());
 await form().locator('[name="name"]').fill('Fresh Wizard Shop');await next().click();await form().locator('[name="owner_name"]').fill('Wizard Owner');await form().locator('[name="owner_email"]').fill('invalid');await next().click();assert.ok(await form().locator('[data-client-step="1"]').isVisible());await form().locator('[name="owner_email"]').fill('wizard@example.test');await next().click();
 await form().locator('[name="plan"]').selectOption('Pro Plus');await form().locator('[name="ems_track_breaks"]').selectOption('true');await form().locator('[name="paper_resupply_enabled"]').selectOption('true');await next().click();
 await form().locator('[name="currency"]').fill('PKR');await form().locator('[name="event_rate"]').fill('5.50');await form().locator('[name="inventory_addon"]').selectOption('true');await form().locator('[name="inventory_rate"]').fill('2.25');await next().click();
 await form().locator('[name="pairing_mode"]').selectOption('byo');await form().locator('[name="shop_url"]').fill('https://new.example.test');await form().locator('[name="project_ref"]').fill('cdefghijklmnopqrstuv');
 await page.getByRole('button',{name:'Review client',exact:true}).click();await page.getByRole('region',{name:'Review new client'}).waitFor();await page.getByRole('button',{name:'Save draft & close'}).click();await page.locator('[data-p-modal="add-client"]').click();assert.equal(await form().locator('[name="shop_url"]').inputValue(),'https://new.example.test');
 await form().locator('[name="shop_url"]').fill('https://reviewed.example.test');assert.equal(await page.getByRole('button',{name:'Save Client',exact:true}).count(),0);await page.getByRole('button',{name:'Review client',exact:true}).click();await shots('client-wizard');await page.getByRole('button',{name:'Save Client',exact:true}).click();for(let n=0;!releaseCreation&&n<100;n++)await new Promise(r=>setTimeout(r,20));assert.equal(typeof releaseCreation,'function');await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.locator('[data-p-modal="add-client"]').click();releaseCreation();await page.getByRole('button',{name:'Retry original creation'}).waitFor();assert.equal(creations.size,1);await page.getByRole('button',{name:'Retry original creation'}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(creations.size,1);assert.deepEqual(calls.filter(c=>c.name==='platform_create_client_once').map(c=>c.a.p_request),[[...creations.keys()][0],[...creations.keys()][0]]);
 await openClient(1);await page.getByRole('button',{name:'Resume BYO Setup',exact:true}).click();const steps=[],commands=[];
 for(let n=1;n<=12;n++){
  await wizardStep(n);await page.waitForFunction(()=>!document.querySelector('[data-p-action="byo-next"]')?.disabled||document.querySelector('[data-wizard="byo"]')?.dataset.step==='12');
  if(n===5){assert.ok(await page.locator('.setup-command').filter({hasText:'--mode'}).locator('button.setup-copy').isDisabled());await page.locator('[data-byo-mode]').selectOption('fresh');const text=await page.locator('.setup-command').filter({hasText:'--mode'}).locator('code').textContent();assert.match(text,/--client-id 1 --project-ref abcdefghijklmnopqrst/);await page.locator('.setup-command').filter({hasText:'--mode'}).locator('button.setup-copy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),text);
   await page.getByRole('button',{name:'Acknowledge this stage'}).click();await page.getByText('Operator acknowledged completion',{exact:true}).waitFor();await page.getByText('Backend observation pending',{exact:true}).waitFor();await page.locator('.wizard-problem summary').click();await page.locator('[data-byo-category]').selectOption('unknown_write');await page.getByRole('button',{name:'Record needs attention',exact:true}).click();await page.getByText('Needs attention / blocked',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Close · resume later'}).click();await page.getByRole('button',{name:'Resume BYO Setup',exact:true}).click();await wizardStep(5);await page.getByText('Needs attention / blocked',{exact:true}).waitFor();
   await page.reload();await ready();await openClient(1);await page.getByRole('button',{name:'Resume BYO Setup',exact:true}).click();await wizardStep(5);await page.locator('[data-byo-mode]').selectOption('fresh');
   records.get(1).revision++;await page.getByRole('button',{name:'Acknowledge this stage'}).click();await page.getByText('Progress was not confirmed.',{exact:false}).waitFor();await page.locator('[role="alert"] [data-p-action="byo-refresh"]').click();await page.waitForFunction(()=>!document.querySelector('[data-p-action="byo-next"]').disabled);await shots('byo-wizard');
  }
  steps.push(await page.locator('[data-stage-title]').textContent());commands.push(...await page.locator('.setup-command code').allTextContents());if(n<12)await page.locator('[data-p-action="byo-next"]').click();
 }
 for(const flag of ['--login','--public-config','--status','--verify-dist','--enroll','--acceptance core','--acceptance support'])assert.ok(commands.some(c=>c.includes(flag)),flag);
 await page.keyboard.press('Tab');assert.ok(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)));await page.keyboard.press('Escape');await openClient(2);await page.getByRole('button',{name:'Resume BYO Setup',exact:true}).click();await wizardStep(1);assert.equal(records.has(2),false);
 await page.keyboard.press('Escape');await page.locator('input[type=file][name="enrollment"]').setInputFiles({name:'synthetic-handoff.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.getByText('synthetic-handoff.json',{exact:true}).waitFor();
 await page.goto(origin+'/?fixtureRole=portfolio_manager');await ready();await clients();await page.locator('[data-p-action="open-client"][data-p-id="1"]').click();assert.equal(await page.getByRole('button',{name:'Resume BYO Setup',exact:true}).count(),0);
 if(process.env.SUPPORT_VISUAL_DIR)writeFileSync(join(process.env.SUPPORT_VISUAL_DIR,'wizard-screen-walkthrough.json'),JSON.stringify({steps,commands,transport:'provider doubles; no hosted I/O'},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: actual five-step client wizard validation/draft/review/lost-response retry; one creation; twelve-stage BYO navigation/copy/manual-vs-proof/block/reopen/refresh/revision conflict/client isolation; branded file input; role gate, focus/Escape; four widths/light-dark. No external requests.');
 }
}catch(e){console.error(e);console.error('Fixture RPC calls:',JSON.stringify(calls.map(c=>({name:c.name,request:c.a.p_request}))));console.error('Browser errors:',JSON.stringify(errors));if(browser){for(const c of browser.contexts())for(const p of c.pages())console.error('Visible alerts:',await p.locator('[role="alert"]').allTextContents().catch(()=>[]))}throw e}finally{await browser?.close();await server.close()}
