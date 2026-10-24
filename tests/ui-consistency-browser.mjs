// Real application modules; isolated transport. Never connects to a hosted service.
import {createServer} from 'vite';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const evidence=resolve(process.env.ORBITO_UI_EVIDENCE),phase=process.argv.includes('--before')?'before':'after';
const job=JSON.parse(readFileSync(resolve(evidence,'review-before.json'),'utf8').replace(/^\uFEFF/,''));
mkdirSync(evidence,{recursive:true});
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public-fixture'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'isolated-ui',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-sdk':null,load:id=>id==='\0fixture-sdk'?'export const createClient=(...a)=>window.fixtureClientFactory(...a);':null}]});
let browser;const errors=[],external=[],results=[];
try {
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));
 await context.addInitScript(installPlatformFixture);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 await page.goto(origin);await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady;});
 await page.evaluate(async job=>{
  window.reviewFixture=job;window.uiCalls=[];const sdk=window.fixtureSDK,original=sdk.rpc;
  sdk.rpc=async(name,args)=>{window.uiCalls.push({name,args});if(name==='platform_upgrade_status')return {data:structuredClone(window.reviewFixture)};return original(name,args);};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.copyFail)throw Error('denied');window.copied=value;}}});
  window.showUI=async(route,theme='light',mode='managed')=>{
   const {pState:s}=await import('/src/state.js');s.page=route;s.theme=theme;s.modal=null;s.filter='';s.dataReady=true;
   const c={...s.data.clients[0],id:job.client_id,pairing_mode:mode,supabase_url:`https://${job.project_ref}.supabase.co`,lifecycle_state:'Active'};s.selectedClient=c;s.data.clients=[c];
   s.clientData={clientId:c.id,requestGeneration:s.clientRequestGeneration,config:c,operations:{requests:[],supplies:[],thermal:{},source:{source_id:job.source_id},projection:{payload:{outstanding_total:123}}},provisioning:{connection:{project_ref:job.project_ref,client_binding:job.client_binding,health:{checks:{}}}}};
   s.clientFinanceLoaded=c.id;s.data.invoices=[{id:71,client_id:c.id,period_start:'2026-10-01',period_end:'2026-10-14',created_at:'2026-10-14',total_due:123,bill_count:1,bill_charges:123,event_rate:123,payment_status:'Unpaid',remaining_balance:123}];s.data.payments=[];s.data.usage=[];
   s.backendInventory={clientId:c.id,catalog:[{release_id:job.plan.source_release,sha256:job.source_sha256,supported:true},{release_id:job.plan.target_release,sha256:job.target_sha256,supported:true,approved_for_new:true}],report:{runtime_health:'unknown',compliance:'unable_to_verify',limitations:job.plan.limitations}};
   s.backendUpgrade=mode==='byo'?{clientId:c.id,statusLoaded:true,job:null}:{clientId:c.id,job:structuredClone(job)};
   s.supportView={ready:true,rows:[{id:1,client_id:c.id,client_name:c.name,project_ref:job.project_ref,subject:'Saved support request',message:'Synthetic browser acceptance data only.',verified:true,revision:1,status:'Open',created_at:'2026-10-23'}]};
   await (await import('/src/backend-upgrade-loader.js')).loadUpgradeUI();(await import('/src/render.js')).render();
  };
 },job);
 const measure=async label=>{
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,unlabelled:[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(n=>n.getClientRects().length&&!n.labels?.length&&!n.hasAttribute('aria-label')&&!n.hasAttribute('aria-labelledby')).map(n=>n.id||n.name),native:[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.className).map(b=>b.textContent.trim())}));results.push({label,...layout});
  if(phase==='after'){assert.equal(layout.overflow,false,`${label}: page overflow`);assert.deepEqual(layout.native,[],`${label}: unstyled buttons`);assert.deepEqual(layout.unlabelled,[],`${label}: unlabelled fields`);}
 };
 for(const width of [1440,1024,768,390])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:960});
  for(const route of ['overview','clients','billing','support','team','settings','client-detail']){
   await page.evaluate(([r,t])=>window.showUI(r,t),[route,theme]);await measure(`${route}-${width}-${theme}`);
   if(width===1440&&theme==='light'||width===390&&theme==='dark')await page.screenshot({path:resolve(evidence,`${phase}-${route}-${width}-${theme}.png`),fullPage:true});
  }
  for(const mode of ['managed','byo']){
   await page.evaluate(([t,m])=>window.showUI('client-detail',t,m),[theme,mode]);
   const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Controlled backend upgrade',exact:true})});
   await panel.scrollIntoViewIfNeeded();await measure(`${mode}-upgrade-${width}-${theme}`);
   if(width===1440||width===390){
    // Element captures taller than the viewport otherwise composite the sticky
    // header across their middle. Only the screenshot hides the shell header.
    await page.addStyleTag({content:'.platform-topbar{visibility:hidden}.skip-link{visibility:hidden}'}).then(async style=>{await panel.screenshot({path:resolve(evidence,`${phase}-${mode}-${width}-${theme}.png`)});await style.evaluate(n=>n.remove());});
   }
  }
  for(const type of ['view-logs','view-invoice','record-payment','edit-client-rates','add-client','add-platform-user']){
   await page.evaluate(async type=>{const {pState:s}=await import('/src/state.js');s.modal={type,data:{clientId:s.selectedClient.id,invoiceId:71,client:s.selectedClient}};(await import('/src/render.js')).render();},type);await measure(`${type}-${width}-${theme}`);
   if(type==='view-logs'&&(width===390||width===1440)&&theme==='light')await page.screenshot({path:resolve(evidence,`${phase}-${type}-${width}.png`)});
  }
 }
 if(phase==='after'){
  await page.evaluate(()=>window.showUI('client-detail'));{
   const calls=await page.evaluate(()=>window.uiCalls.length);
   await page.locator('[data-p-action="upgrade-status"]').click();await page.waitForFunction(()=>!document.querySelector('[data-p-action="upgrade-status"]').disabled);
   assert.equal(await page.evaluate(()=>window.uiCalls.length),calls+1);
   const original=await page.evaluate(async()=>JSON.stringify((await import('/src/state.js')).pState.backendUpgrade.job));assert.deepEqual(JSON.parse(original),job);
   await page.locator('#upgrade-source-review').fill('review-reference-preserved');
   await page.locator('[data-p-action="theme"]').click();assert.equal(await page.locator('#upgrade-source-review').inputValue(),'review-reference-preserved');
   const advanced=page.locator('.upgrade-panel > details');await advanced.locator('summary').first().click();
   const copy=advanced.getByRole('button',{name:'Copy Request ID',exact:true});await copy.click();assert.equal(await page.evaluate(()=>window.copied),job.request_id);
   await page.evaluate(()=>window.copyFail=true);await copy.click();assert.ok(await page.getByText('Copy is unavailable. Select the displayed value to copy it.',{exact:true}).isVisible());
   await page.evaluate(()=>window.copyFail=false);
   for(let i=0;i<3;i++)await page.evaluate(async()=>{(await import('/src/render.js')).render();});
   assert.equal(await page.evaluate(()=>window.uiCalls.length),calls+1,'Renders must make no backend/provider calls');
   assert.deepEqual(await page.evaluate(()=>window.fixtureWrites),[],'No provider writes');
   await page.evaluate(()=>window.showUI('client-detail','light','byo'));
   assert.equal(await page.locator('[data-p-action="upgrade-approve"]').count(),0,'Incomplete draft has no approval');
   await page.locator('#upgrade-source').selectOption(job.source_sha256);
   await page.locator('[data-p-action="upgrade-review"]').click();
   await page.waitForFunction(()=>!document.querySelector('[data-p-action="upgrade-review"]').disabled);
   assert.ok(await page.locator('.upgrade-panel [role="alert"]').textContent().then(t=>t.includes('empty')));
   assert.equal(await page.evaluate(()=>window.uiCalls.length),calls+1);assert.deepEqual(await page.evaluate(()=>window.fixtureWrites),[]);
   await page.locator('#upgrade-assessment').fill('{');await page.locator('[data-p-action="upgrade-review"]').click();
   await page.waitForFunction(()=>!document.querySelector('[data-p-action="upgrade-review"]').disabled);
   assert.ok(await page.locator('.upgrade-panel [role="alert"]').textContent().then(t=>t.includes('not valid JSON')));
   assert.equal(await page.evaluate(()=>window.uiCalls.length),calls+1);assert.deepEqual(await page.evaluate(()=>window.fixtureWrites),[]);
   await page.locator('[data-p-action="upgrade-review"]').focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');assert.ok(await page.locator('[data-p-action="upgrade-review"]').evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));

  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(resolve(evidence,`${phase}-layout-results.json`),JSON.stringify({results,errors,external},null,2));
 console.log(`PASS ${phase}: ${results.length} route/modal/theme/width inspections; zero external traffic/page errors. Local isolated transport, not hosted acceptance.`);
}finally{await browser?.close();await server.close();}
