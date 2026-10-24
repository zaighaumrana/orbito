// Two targeted frontend regressions. Real modules; synthetic SDK; no hosted I/O.
import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const makeJob=(client_id,mode)=>{
 const identity={client_id,mode,project_ref:'abcdefghijklmnopqrst',source_id:'99500000-0000-4000-8000-000000000001',client_binding:`fixture-${client_id}`,source_sha256:'a'.repeat(64),target_sha256:'b'.repeat(64)};
 return {...identity,request_id:`99500000-0000-4000-8000-00000000000${client_id+1}`,state:'review',plan_sha256:'c'.repeat(64),steps:{},plan:{contract:'retrasell-controlled-upgrade-v1',...identity,source_release:'support-v4',target_release:'support-v6',source_fully_verified:false,evidence_origin:mode==='managed'?'managed-provider-read-only':'customer-reported-read-only-assessment',compatibility:'additive-protocol-1',steps:[{name:'migration:20261023012311',type:'migration',sha256:'d'.repeat(64)},{name:'function:platform-bridge',type:'function',sha256:'e'.repeat(64)},{name:'function:support-tickets',type:'function',sha256:'f'.repeat(64)}]}};
};
const jobs=new Map([[1,makeJob(1,'managed')],[2,makeJob(2,'byo')]]),calls=[],edges=[];
const complete=job=>{job.state='verification_required';job.steps=Object.fromEntries(job.plan.steps.map(s=>[s.name,{state:'passed',sha256:s.sha256}]));job.verification={full_source_verified:false,components_verified:job.mode==='managed',components_reported:true};};
let hold,failStatus=false;
const defer=name=>{let release;const promise=new Promise(r=>release=r);hold={name,promise};return release;};
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public-fixture'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'targeted-ui-sdk',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-sdk':null,load:id=>id==='\0fixture-sdk'?'export const createClient=(...a)=>window.fixtureClientFactory(...a);':null}]});
let browser;const errors=[],external=[];
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));
 await context.exposeFunction('upgradeTestRpc',async(name,args)=>{
  calls.push({name,args});const job=name==='platform_upgrade_status'?jobs.get(args.p_client):[...jobs.values()].find(j=>j.request_id===args.p_request);assert.ok(job);
  let result={data:null};
  if(name==='platform_upgrade_status'){if(failStatus){failStatus=false;result={error:{message:'Synthetic status outage'}};}else result={data:structuredClone(job)};}
  else if(name==='platform_upgrade_approve'){assert.ok(['review','paused'].includes(job.state));job.state='approved';job.conditions=args.p_conditions;}
  else if(name==='platform_upgrade_close'){assert.equal(job.state,'verification_required');job.state='completed_reviewed';}
  else assert.fail('Unexpected upgrade mutation '+name);
  if(hold?.name===name){const waiting=hold;hold=null;await waiting.promise;}return result;
 });
 await context.exposeFunction('upgradeTestEdge',async(body)=>{
  edges.push(body);const job=[...jobs.values()].find(j=>j.request_id===body.request_id);assert.equal(job.state,'approved');
  if(body.action==='execute'){assert.equal(job.mode,'managed');complete(job);return {data:{job:structuredClone(job)}};}
  assert.equal(body.action,'customer-token');assert.equal(job.mode,'byo');job.customer_expires_at='2030-01-01T00:00:00Z';return {data:{approval:{contract:'synthetic-test-clearance'}}};
 });
 await context.addInitScript(installPlatformFixture);
 await context.addInitScript(()=>{
  const sdk=window.fixtureSDK,old=sdk.rpc,edge=sdk.functions.invoke;
  sdk.rpc=(name,args)=>name.startsWith('platform_upgrade_')?window.upgradeTestRpc(name,args):old(name,args);
  sdk.functions.invoke=(name,options)=>name==='platform-upgrade'?window.upgradeTestEdge(options.body):edge(name,options);
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 const ready=()=>page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady;});
 await page.goto(origin);await ready();
 const seed=async(id,loaded=true)=>page.evaluate(async({job,loaded})=>{
  const {pState:s}=await import('/src/state.js'),{selectClient}=await import('/src/async-context.js');
  s.page='client-detail';s.modal=null;const client={...s.data.clients.find(c=>c.id===job.client_id),id:job.client_id,pairing_mode:job.mode,lifecycle_state:'Active',supabase_url:`https://${job.project_ref}.supabase.co`};selectClient(client);
  s.clientData={clientId:client.id,requestGeneration:s.clientRequestGeneration,config:client,operations:{source:{source_id:job.source_id},thermal:{},requests:[],supplies:[]}};
  s.backendUpgrade={clientId:client.id,statusLoaded:loaded,job:loaded?job:null};
  const workflow=await (await import('/src/backend-upgrade-loader.js')).loadUpgradeUI();
  // Actual synchronous renderer, matching production event dispatch.
  const {render}=await import('/src/render.js');window.testUpgrade=action=>workflow.handleUpgrade(action,render);render();
 },{job:structuredClone(jobs.get(id)),loaded});
 const idle=()=>page.waitForFunction(async()=>!(await import('/src/state.js')).pState.backendUpgrade?.busy);
 const action=name=>page.locator(`.upgrade-panel [data-p-action="upgrade-${name}"]`);
 const submitDialog=async value=>{const dialog=page.locator('.platform-dialog');await dialog.locator('input').fill(value);await dialog.getByRole('button',{name:'Confirm',exact:true}).click();};
 const reviewClose=async()=>{await action('close').click();await submitDialog('synthetic-provider-review');await submitDialog('Reviewed synthetic component evidence; full source remains unverified.');await idle();};
 for(const id of [1,2]){
  const job=jobs.get(id);await seed(id);
  const initialEdges=edges.length;await page.evaluate(()=>window.testUpgrade('upgrade-execute'));assert.equal(edges.length,initialEdges,'No installation before approval');
  await page.locator('#upgrade-source-review').fill('synthetic-source-review');
  const approvals=calls.filter(c=>c.name==='platform_upgrade_approve').length,release=defer('platform_upgrade_approve');
  await action('approve').click();await submitDialog(`UPGRADE ${job.project_ref} ${job.target_sha256}`);
  await page.waitForFunction(async()=>!!(await import('/src/state.js')).pState.backendUpgrade.busy);
  assert.ok(await action('approve').isDisabled());await page.evaluate(()=>window.testUpgrade('upgrade-approve'));
  release();await idle();assert.equal(calls.filter(c=>c.name==='platform_upgrade_approve').length,approvals+1,'Duplicate approval suppressed');
  assert.equal(await action('approve').count(),0,'Approved jobs do not offer approval again');assert.ok(await page.locator('.upgrade-panel').getByText('Approved',{exact:true}).isVisible());
  await page.evaluate(()=>window.testUpgrade('upgrade-approve'));assert.equal(calls.filter(c=>c.name==='platform_upgrade_approve').length,approvals+1,'Stale action dispatch denied');
  const reads=calls.filter(c=>c.name==='platform_upgrade_status').length;
  if(job.mode==='managed')await action('execute').click();
  else {const downloading=page.waitForEvent('download');await action('download').click();await page.locator('.platform-dialog').getByRole('button',{name:'Confirm',exact:true}).click();const download=await downloading;await download.cancel();}
  await idle();
  assert.equal(calls.filter(c=>c.name==='platform_upgrade_status').length,reads+(job.mode==='byo'?1:0),'Only a scoped read when the backend returns no job');
  if(job.mode==='byo'){complete(job);await action('status').click();await idle();}
  assert.equal(await action('execute').count(),0);assert.equal(await action('download').count(),0);assert.equal(await action('approve').count(),0);
  await reviewClose();assert.ok(await page.locator('.upgrade-panel').getByText('Completed · source limitation reviewed',{exact:true}).isVisible());
  assert.equal(await action('close').count(),0);assert.ok(await page.locator('.upgrade-panel').getByText('Review acknowledgment recorded. The installed-source limitation remains recorded.',{exact:true}).isVisible());
  const beforeRender=calls.length,beforeEdges=edges.length;await page.evaluate(async()=>{const {render}=await import('/src/render.js');render();render();});assert.equal(calls.length,beforeRender);assert.equal(edges.length,beforeEdges);
  if(id===1){await page.reload();await ready();await page.getByRole('button',{name:'Open upgrade review',exact:true}).click();await action('status').click();await idle();assert.ok(await page.locator('.upgrade-panel').getByText('Completed · source limitation reviewed',{exact:true}).isVisible());}
  console.log(`PASS ${job.mode}: authoritative approval, duplicate click, ${job.mode==='managed'?'returned execution checkpoints':'clearance status read'}, final acknowledgment and state-specific controls`);
 }
 // A stale same-view operation must not replace a newer owned state object.
 jobs.get(1).state='review';await seed(1);let release=defer('platform_upgrade_status');
 await page.evaluate(()=>{window.oldUpgrade=window.testUpgrade('upgrade-status');});await page.waitForFunction(async()=>!!(await import('/src/state.js')).pState.backendUpgrade.busy);
 jobs.get(1).state='completed_reviewed';await page.evaluate(async()=>{const {pState:s}=await import('/src/state.js');s.backendUpgrade={...s.backendUpgrade,busy:false};});
 await page.evaluate(()=>window.testUpgrade('upgrade-status'));release();await page.evaluate(()=>window.oldUpgrade);assert.equal(await page.evaluate(async()=>(await import('/src/state.js')).pState.backendUpgrade.job.state),'completed_reviewed');
 release=defer('platform_upgrade_status');await page.evaluate(()=>{window.oldUpgrade=window.testUpgrade('upgrade-status');});await seed(2,false);await action('status').click();await idle();release();await page.evaluate(()=>window.oldUpgrade);assert.equal(await page.evaluate(async()=>(await import('/src/state.js')).pState.backendUpgrade.job.client_id),2,'Departed client response discarded');
 await seed(2,false);release=defer('platform_upgrade_status');await page.evaluate(()=>{window.oldUpgrade=window.testUpgrade('upgrade-status');});
 await page.evaluate(async()=>{const {pState:s}=await import('/src/state.js');s.modal={type:'view-logs',data:{clientId:2}};(await import('/src/render.js')).render();});
 release();await page.evaluate(()=>window.oldUpgrade);assert.equal(await page.evaluate(async()=>(await import('/src/state.js')).pState.backendUpgrade.busy),false,'A local modal must not strand a client-owned action in its busy state');
 jobs.set(2,makeJob(2,'byo'));await seed(2);failStatus=true;await page.locator('#upgrade-source-review').fill('synthetic-source-review');await action('approve').click();await submitDialog(`UPGRADE ${jobs.get(2).project_ref} ${jobs.get(2).target_sha256}`);await idle();
 assert.equal(await action('approve').count(),0);assert.equal(await action('download').count(),0);assert.ok(await action('close').isDisabled());assert.ok(await page.locator('.upgrade-panel [role=alert]').textContent().then(t=>t.includes('accepted')));
 const beforeRecovery=edges.length;await action('status').click();await idle();assert.ok(await action('download').isEnabled());assert.equal(edges.length,beforeRecovery,'Status recovery never executes or reissues clearance');
 console.log('PASS stale/uncertain UI: newer state and client retained; accepted action with failed status blocks writes until one status read recovers');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:960});await page.evaluate(async()=>{const {syncSidebar}=await import('/src/render.js');syncSidebar(true);});
  const menu=page.locator('#p-menu-btn');
  const closeInside=page.locator('.sidebar-close');await closeInside.focus();await page.keyboard.press('Enter');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.ok(await page.locator('#p-sidebar').evaluate(n=>n.inert));assert.equal(await page.evaluate(()=>document.activeElement.id),'p-menu-btn');
  if(width===1440)assert.equal((await page.locator('.platform-main').boundingBox()).x,0,'Desktop content expands into collapsed navigation');
  // Existing Back action must not reset a closed navigation during route render.
  await page.locator('button[data-p-page="clients"]').filter({hasText:'Back'}).click();await page.waitForFunction(async()=>(await import('/src/state.js')).pState.page==='clients');assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await menu.focus();await page.keyboard.press('Enter');assert.equal(await menu.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#p-sidebar').getAttribute('aria-hidden'),null);
  await page.evaluate(async()=>{(await import('/src/render.js')).render();});assert.equal(await menu.getAttribute('aria-expanded'),'true','An ordinary render must not close an open navigation');
  await page.locator('.platform-nav [data-p-page="billing"]').click();await page.waitForFunction(async()=>(await import('/src/state.js')).pState.page==='billing');assert.equal(await menu.getAttribute('aria-expanded'),String(width===1440));
  await page.evaluate(async()=>{(await import('/src/render.js')).render();});assert.equal(await menu.getAttribute('aria-expanded'),String(width===1440),'Route render preserves expected navigation state');
  if(width===1440){assert.ok((await page.locator('.platform-main').boundingBox()).x>200);await closeInside.click();}
  await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await seed(2);
  console.log(`PASS navigation ${width}px: keyboard close/reopen, Back and Billing routes, rerender, Escape and content width`);
 }
 await page.setViewportSize({width:1440,height:960});await page.locator('#p-menu-btn').click();assert.equal(await page.locator('#p-menu-btn').getAttribute('aria-expanded'),'true');await page.setViewportSize({width:390,height:960});assert.equal(await page.locator('#p-menu-btn').getAttribute('aria-expanded'),'false');await page.setViewportSize({width:1440,height:960});assert.equal(await page.locator('#p-menu-btn').getAttribute('aria-expanded'),'true','Desktop preference survives mobile resize');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: five focused browser groups, zero page errors/external requests; no hosted job or provider mutation');
}finally{await browser?.close();await server.close();}
