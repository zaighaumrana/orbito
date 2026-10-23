import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},
 define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_PLATFORM_AUTH_EMAIL':JSON.stringify('master@example.test'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},
 plugins:[{name:'support-sdk-fixture',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-sdk':null,load:id=>id==='\0fixture-sdk'?'export const createClient=(...args)=>window.fixtureClientFactory(...args);':null}]});
let browser;const external=[],errors=[];
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));
 const supportFixture=()=>{
  const rpc=window.fixtureSDK.rpc;
  window.fixtureSupportCommands=[];
  window.fixtureSupportCalls=[];
  window.fixtureSupportRows=[{id:101,client_id:1,client_name:'Verified Client',subject:'Scanner <script>text</script>',message:'<img src=x onerror=alert(1)>',category:'technical',status:'Open',verified:true,project_ref:'abcdefghijklmnopqrst',requester_role:'Manager',revision:1,created_at:'2026-10-18T00:00:00Z',history:[{action:'created',created_at:'2026-10-18T00:00:00Z'}]},
   {id:102,client_id:1,client_name:'Historical Name',subject:'Historical',message:'Legacy report',status:'Open',verified:false,revision:1,created_at:'2026-10-17T00:00:00Z'}];
  window.fixtureSDK.rpc=async(name,args={})=>{
   window.fixtureSupportCalls.push(name);
   if(name==='platform_support_ticket_page')return {data:{rows:structuredClone(args.p_offset?[window.fixtureSupportRows[1]]:window.fixtureSupportRows),offset:args.p_offset,has_more:!args.p_offset}};
   if(name==='platform_support_ticket_resolve'){window.fixtureSupportCommands.push(args);const row=window.fixtureSupportRows.find(t=>t.id===args.p_ticket);row.status='Resolved';row.revision++;row.resolution=args.p_resolution;row.history.push({action:'resolved',created_at:'2026-10-18T00:01:00Z'});return {data:{resolved:true,revision:row.revision}};}
   return rpc(name,args);
  };
 };
 await context.addInitScript({content:'('+installPlatformFixture.toString()+')();('+supportFixture.toString()+')();'});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 for(const role of ['master_admin','portfolio_manager']){
  await page.goto(origin+'/support?fixtureRole='+role,{waitUntil:'domcontentloaded',timeout:60000});await page.getByText('Verified Shop session',{exact:false}).waitFor();
  await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Verified Shop session',{exact:false}).waitFor();
  await page.locator('[data-p-page="overview"]').click();await page.locator('[data-p-page="support"]').click();await page.getByText('Verified Shop session',{exact:false}).waitFor();
  await page.goBack();await page.goForward();await page.getByText('Verified Shop session',{exact:false}).waitFor();
  assert.ok(await page.getByText('Legacy / Identity Not Verified',{exact:false}).isVisible());
  assert.equal(await page.locator('#platform-app script,#platform-app img[src="x"]').count(),0);
  if(process.env.SUPPORT_VISUAL_DIR&&role==='master_admin'){
   await mkdir(process.env.SUPPORT_VISUAL_DIR,{recursive:true});
   for(const theme of ['light','dark'])for(const width of [320,1440]){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});
    await page.screenshot({path:join(process.env.SUPPORT_VISUAL_DIR,`support-${theme}-${width}.png`),fullPage:true});
   }
  }
  await page.evaluate(()=>window.fixtureSupportCalls=[]);
  await page.locator('#support-resolution-101').fill('Reconnect <script>plain text</script>');await page.locator('[data-p-action="resolve-ticket"][data-p-id="101"]').click();
  await page.getByText('Resolution: Reconnect <script>plain text</script>',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.fixtureSupportCommands),[{p_ticket:101,p_revision:1,p_resolution:'Reconnect <script>plain text</script>'}]);
  assert.deepEqual(await page.evaluate(()=>window.fixtureSupportCalls),['platform_support_ticket_resolve','platform_support_ticket_page','platform_dashboard_summary']);
  await page.getByRole('button',{name:'Next',exact:true}).click();await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.supportView?.offset===50;});
  await page.getByRole('button',{name:'Previous',exact:true}).click();await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.supportView?.offset===0;});
  for(const width of [320,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No Support page overflow at '+width);}
 }
 if(process.env.SUPPORT_VISUAL_DIR){
  for(const mode of ['managed','byo'])for(const theme of ['light','dark'])for(const width of [320,1440]){
   await page.evaluate(async({mode,theme})=>{
    document.documentElement.dataset.theme=theme;const {supportSetupPanel}=await import('/src/support-setup.js');
    document.getElementById('platform-app').innerHTML='<main class="content"><section class="card">'+supportSetupPanel({pairing_mode:mode},{supportAutomation:{state:'attention',reason:'proof_pending',request_id:'99000000-0000-4000-8000-000000000001',write_unresolved:mode==='managed'}},true)+'</section></main>';
   },{mode,theme});
   await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Setup overflow: '+mode+theme+width);
   const button=page.getByRole('button').first();await button.focus();assert.ok(await button.evaluate(e=>getComputedStyle(e).minHeight==='44px'));await page.screenshot({path:join(process.env.SUPPORT_VISUAL_DIR,`setup-${mode}-${theme}-${width}.png`),fullPage:true});
  }
  await page.evaluate(async()=>{const {supportSetupPanel}=await import('/src/support-setup.js');document.getElementById('platform-app').innerHTML=supportSetupPanel({pairing_mode:'byo'},{},false)});assert.equal(await page.locator('form').count(),0);
 }
 await page.goto(origin+'/clients?fixtureRole=master_admin',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.page==='clients'&&pState.dataReady;});
 assert.equal((await page.evaluate(()=>window.fixtureSupportCalls)).filter(n=>n==='platform_route_resource').length,1);
 assert.ok(!(await page.evaluate(()=>window.fixtureSupportCalls)).includes('platform_read_page'));
 await page.locator('[data-p-action="open-client"][data-p-id="1"]').first().click();
 await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.page==='client-detail'&&pState.clientData.clientId===1&&!pState.clientData.loading;});
 assert.ok(page.url().includes('/clients/1'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.selectedClient?.id===1&&pState.clientData.clientId===1&&!pState.clientData.loading;});
 await page.goto(origin+'/?fixtureRole=billing_person',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady;});assert.equal(await page.locator('[data-p-page="support"]').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: actual Platform Support navigation, verified/legacy provenance, escaped input/resolution, expected revision, pagination, Master/Manager access, Billing exclusion, 320/768/1440px; zero page errors/external requests.');
}finally{await browser?.close();await server.close();}
