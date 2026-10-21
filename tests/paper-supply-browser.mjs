import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const shots=process.env.SUPPORT_VISUAL_DIR;assert.ok(shots,'Explicit evidence directory required');await mkdir(shots,{recursive:true});
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_PLATFORM_AUTH_EMAIL':JSON.stringify('master@example.test'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'fixture',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-sdk':null,load:id=>id==='\0fixture-sdk'?'export const createClient=(...args)=>window.fixtureClientFactory(...args);':null}]});
let browser;const errors=[],external=[];
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));
 function fixture(){const original=window.fixtureSDK.rpc;window.paperCommands=[];window.paperFailure=false;window.paperRows=[{request_id:'99000000-0000-4000-8000-000000000002',status:'requested',sync_version:1,requested_at:'2026-10-20T10:00:00Z',communication:[]}];window.fixtureSDK.rpc=async(name,args={})=>{
  if(name==='platform_client_operations'){if(window.paperReadFailure){window.paperReadFailure=false;return {error:{message:'Synthetic read unavailable'}}}return {data:{client:args.p_client,requests:window.paperRows,supplies:window.deliverySupplies||[],thermal:{},projection:{payload:{outstanding_total:123}}}};}
  if(name==='platform_paper_decision'&&window.deliveryUX){
   window.paperCommands.push(args);if(window.deliveryGate)await new Promise(resolve=>window.releaseDelivery=resolve);
   if(window.deliveryOutcome==='offline')return {error:{message:'Synthetic disconnected'}};
   const r=window.paperRows.find(r=>r.request_id===args.p_request);
   if(window.deliveryOutcome==='stale'){r.sync_version++;return {error:{code:'P0001',message:'Stale or invalid lifecycle transition'}};}
   if(window.deliveryOutcome==='fulfilled'){r.status='fulfilled';r.sync_version++;return {error:{code:'P0001',message:'Stale or invalid lifecycle transition'}};}
   if(!window.deliverySupplies.some(d=>d.delivery_id===args.p_delivery.delivery_id))window.deliverySupplies.push({...args.p_delivery,client_id:args.p_client,request_id:args.p_request,status:'delivered'});
   r.status='fulfilled';r.sync_version++;r.communication=[{message:args.p_message,status:'fulfilled'}];
   return window.deliveryOutcome==='lost'?{error:{message:'Synthetic response lost'}}:{data:null};
  }
  if(name==='platform_paper_decision'){window.paperCommands.push(args);if(window.paperFailure)return {error:{message:'Transport unavailable'}};const r=window.paperRows.find(r=>r.request_id===args.p_request);r.status=args.p_status;r.sync_version++;r.communication.push({status:args.p_status,message:args.p_message,expectation:args.p_expectation,at:'2026-10-20T10:30:00Z',revision:r.sync_version});return {data:null};}
  return original(name,args);
 };}
 await context.addInitScript({content:'('+installPlatformFixture.toString()+')();('+fixture.toString()+')();'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto(origin+'/?fixtureRole=master_admin');await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady;});
 await page.locator('[data-p-page="clients"]').click();await page.locator('[data-p-action="open-client"][data-p-id="1"]').click();
 await page.locator('[data-p-action="paper-status"][data-status="rejected"]').waitFor();
 if(process.argv.includes('--delivery-only')){
  const form=()=>page.locator('[data-p-form="paper-delivery"]'),status=()=>form().locator('[data-delivery-status]');
  const reset=async()=>{await page.evaluate(async()=>{window.deliveryUX=true;window.deliveryOutcome='success';window.deliverySupplies=[];window.paperCommands=[];window.deliveryGate=false;localStorage.removeItem('orbito-operation:supply:1');window.paperRows=[{request_id:'99000000-0000-4000-8000-000000000002',status:'approved',sync_version:2,communication:[]}];const {pState}=await import('/src/state.js');const {loadClientData}=await import('/src/supabase.js');await loadClientData(pState.selectedClient,{readOnly:true});const {render}=await import('/src/render.js');render()});};
  const fill=async time=>{for(const [name,value] of Object.entries({request_id:'99000000-0000-4000-8000-000000000002',reference:'Delivery UX fixture',roll_count:'2',usable_length_mm:'1000',paper_width_mm:'80',message:'Paper received',delivered_at:time})){
   const field=form().locator(`[name="${name}"]`);if(name==='request_id')await field.selectOption(value);else await field.fill(value);
  }};
  const local=delta=>page.evaluate(delta=>{const d=new Date(Date.now()+delta);return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16)},delta);
  const confirm=()=>form().locator('[type="submit"]').click();
  await reset();await fill(await local(86400000));await confirm();assert.match(await status().textContent(),/in the future/);assert.equal(await page.evaluate(()=>window.paperCommands.length),0);assert.equal(await form().locator('[name="roll_count"]').inputValue(),'2');
  // Verify local-time interpretation and safe allowlisted messages without a new suite.
  await page.evaluate(async()=>{const {deliveryInput,deliveryError}=await import('/src/paper-delivery.js');const base={reference:'R',roll_count:1,usable_length_mm:1000,paper_width_mm:80};for(const v of ['', '2026-02-30T12:00']){let rejected=false;try{deliveryInput({...base,delivered_at:v})}catch{rejected=true}if(!rejected)throw Error('Invalid time accepted')};const raw='2026-01-02T10:30';if(deliveryInput({...base,delivered_at:raw}).delivery.delivered_at!==new Date(raw).toISOString())throw Error('Local time converted incorrectly');if(!deliveryError({definiteFailure:true,message:'Delivery conflict'}).includes('identity conflicts'))throw Error('Identity conflict message missing');if(deliveryError({definiteFailure:true,message:'PRIVATE DATABASE DETAILS'}).includes('PRIVATE'))throw Error('Raw database message exposed')});
  await fill(await local(-3600000));await page.evaluate(()=>{window.paperReadFailure=true;window.deliveryGate=true});await confirm();await page.waitForFunction(()=>Boolean(window.releaseDelivery));assert.ok(await form().locator('[type="submit"]').isDisabled());assert.ok(await page.locator('[data-p-action="refresh-paper"]').isDisabled());
  await form().evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(await page.evaluate(()=>window.paperCommands.length),1);
  await page.evaluate(()=>{window.deliveryGate=false;window.releaseDelivery()});await page.waitForFunction(()=>document.querySelector('[data-delivery-status]')?.textContent.includes('Delivery recorded successfully'));
  assert.match(await status().textContent(),/History could not be refreshed/);assert.equal(await page.evaluate(()=>localStorage.getItem('orbito-operation:supply:1')),null);assert.equal(await page.locator('.platform-toast-error').count(),0);
  await reset();await fill(await local(-3600000));await page.evaluate(()=>window.deliveryOutcome='lost');await confirm();await page.waitForFunction(()=>document.querySelector('[data-delivery-status]')?.textContent.includes('already recorded'));
  assert.equal(await page.evaluate(()=>window.deliverySupplies.length),1);assert.equal(await page.evaluate(()=>window.paperCommands.length),1);assert.equal(await page.evaluate(()=>localStorage.getItem('orbito-operation:supply:1')),null);
  await reset();await fill(await local(-3600000));await page.evaluate(()=>window.deliveryOutcome='offline');await confirm();await page.getByText('The connection did not confirm the delivery outcome.',{exact:false}).waitFor();
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbito-operation:supply:1')));await page.reload();await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady});await page.locator('[data-p-page="clients"]').click();await page.locator('[data-p-action="open-client"][data-p-id="1"]').click();
  assert.equal(await form().locator('[name="reference"]').inputValue(),'Delivery UX fixture');assert.ok(await form().locator('[name="reference"]').isDisabled());
  await page.evaluate(()=>{window.deliveryUX=true;window.deliverySupplies=[];window.deliveryOutcome='success';window.paperRows[0].status='approved';window.paperRows[0].sync_version=2});await page.getByRole('button',{name:'Check original delivery',exact:true}).click();assert.equal(await page.evaluate(()=>window.paperCommands.length),0);
  await confirm();await page.waitForFunction(()=>document.querySelector('[data-delivery-status]')?.textContent.includes('recorded successfully'));assert.equal(await page.evaluate(()=>window.paperCommands[0].p_delivery.delivery_id),original.requestId);
  await reset();await fill(await local(-3600000));await page.evaluate(()=>window.deliveryOutcome='stale');await confirm();await page.getByText('The request revision has changed.',{exact:false}).waitFor();const staleId=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbito-operation:supply:1')).requestId);
  await page.evaluate(()=>window.paperRows[0].status='fulfilled');await page.getByRole('button',{name:'Check original delivery',exact:true}).click();await page.getByText('This request is already fulfilled.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('orbito-operation:supply:1')).requestId),staleId);assert.equal(await page.evaluate(()=>window.paperCommands.length),1);assert.equal(await page.evaluate(()=>window.deliverySupplies.length),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: delivery-only future/invalid/local time, success with failed read, overlap lock, lost response reconciliation, reload/original UUID retry, stale/already fulfilled and safe error text. No hosted requests.');
 }else{
 // Pin the actual pre-communication fragment; current HEAD delegates rendering.
 const baseline=spawnSync('git',['show','2af20cfda151a71f395d2fff1299812ae1af9c45:src/pages/clients.js'],{encoding:'utf8',windowsHide:true}).stdout;
 const begin=baseline.indexOf('<div class="card"><h2>Paper Requests / Deliveries</h2>'),end=baseline.indexOf('<div class="card"><h2>Invoice History</h2>',begin);
 assert.ok(begin>0&&end>begin);
 await page.evaluate(({source})=>{const card=[...document.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent==='Paper Requests / Deliveries');window.savedPaperHTML=card.outerHTML;card.outerHTML=Function('o','canConfig','esc','metres','return `'+source+'`')({requests:window.paperRows,supplies:[]},true,s=>String(s??'').replaceAll('<','&lt;'),()=>0);},{source:baseline.slice(begin,end)});
 await page.getByRole('heading',{name:'Paper Requests / Deliveries'}).scrollIntoViewIfNeeded();await page.screenshot({path:join(shots,'paper-before-historical-fragment.png'),fullPage:true});
 await page.evaluate(()=>{const c=[...document.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent==='Paper Requests / Deliveries');c.outerHTML=window.savedPaperHTML;});
 await page.locator('[data-p-action="paper-status"][data-status="rejected"]').click();
 await page.getByRole('dialog').waitFor();assert.ok(await page.getByRole('dialog').getByText('Northstar Repairs',{exact:false}).isVisible());
 assert.equal(await page.locator('textarea[name="message"]').getAttribute('required'),'');
 await page.getByRole('button',{name:'Keep request unchanged'}).click();assert.equal(await page.evaluate(()=>window.paperCommands.length),0);
 await page.locator('[data-p-action="paper-status"][data-status="approved"]').click();
 await page.locator('textarea[name="message"]').fill('Approved <script>plain text</script>');await page.locator('input[name="expectation"]').fill('3–5 working days');
 for(const width of [320,1440])for(const theme of ['light','dark']){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'dialog overflow '+width);await page.screenshot({path:join(shots,`paper-approve-${theme}-${width}.png`),fullPage:false});}
 await page.getByRole('button',{name:'Confirm approve',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(await page.locator('.paper-message script').count(),0);await page.getByText('Expected delivery: 3–5 working days',{exact:false}).waitFor();
 await page.locator('[data-p-action="paper-status"][data-status="dispatched"]').click();await page.locator('textarea[name="message"]').fill('Courier collected');await page.getByRole('button',{name:'Confirm dispatch',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>window.paperCommands.map(p=>[p.p_client,p.p_version,p.p_status])),[[1,1,'approved'],[1,2,'dispatched']]);
 // A new request exercises required rejection reason and uncertain same-value retry.
 await page.evaluate(async()=>{window.paperRows=[{request_id:'99000000-0000-4000-8000-000000000003',status:'requested',sync_version:1,requested_at:'2026-10-20',communication:[]}];const {pState}=await import('/src/state.js');const {loadClientData}=await import('/src/supabase.js');await loadClientData(pState.selectedClient);const {render}=await import('/src/render.js');render();});
 await page.locator('[data-p-action="paper-status"][data-status="rejected"]').click();await page.locator('textarea[name="message"]').fill('Outside delivery area');await page.evaluate(()=>window.paperFailure=true);await page.getByRole('button',{name:'Confirm reject',exact:true}).click();await page.getByText('Outcome unconfirmed.',{exact:false}).waitFor();assert.equal(await page.locator('textarea[name="message"]').getAttribute('readonly'),'');
 await page.screenshot({path:join(shots,'paper-reject-uncertain-mobile.png'),fullPage:false});await page.evaluate(()=>window.paperFailure=false);await page.getByRole('button',{name:'Confirm reject',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 const commands=await page.evaluate(()=>window.paperCommands);assert.deepEqual(commands.at(-1),commands.at(-2));
 await page.getByText('Outside delivery area',{exact:false}).first().waitFor();
 // Actual Shop renderer in the same isolated browser; no remote SDK or private values.
 const historySource=await readFile(new URL('../../Orbitoshopv2-v1/src/admin/pages/paper-history.js',import.meta.url),'utf8');
 const htmlSource=await readFile(new URL('../../Orbitoshopv2-v1/public/ui-text.js',import.meta.url),'utf8');
 await page.evaluate(({historySource,htmlSource})=>{const esc=Function(htmlSource.replaceAll('export ', '')+';return escapeHTML;')();const history=Function('esc',historySource.replace(/^import .*$/gm,'').replaceAll('export ','')+';return paperHistory;')(esc);document.getElementById('platform-app').innerHTML='<main class="content">'+history([{request_id:'99000000-0000-4000-8000-000000000003',status:'rejected',requested_at:'2026-10-20',communication:[{status:'rejected',message:'Outside delivery area <img src=x onerror=alert(1)>',expectation:'',at:'2026-10-20T10:30:00Z'}]}])+'</main>';},{historySource,htmlSource});
 assert.equal(await page.locator('img[src="x"]').count(),0);await page.screenshot({path:join(shots,'shop-paper-rejection.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: actual Platform navigation/forms/events, exact customer/request, cancel without writes, required reason, approval/ETA, dispatch, unknown same-payload retry, escaped Shop history, light/dark 320/1440 screenshots; no external requests.');
 }
}catch(error){if(browser){for(const context of browser.contexts())for(const page of context.pages())console.error('Delivery fixture diagnostic:',await page.evaluate(()=>({status:document.querySelector('[data-delivery-status]')?.textContent,saved:localStorage.getItem('orbito-operation:supply:1'),commands:window.paperCommands,supplies:window.deliverySupplies,rows:window.paperRows})).catch(()=>null))}throw error}
finally{await browser?.close();await server.close();}
