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
  if(name==='platform_client_operations')return {data:{client:args.p_client,requests:window.paperRows,supplies:[],thermal:{},projection:{payload:{outstanding_total:123}}}};
  if(name==='platform_paper_decision'){window.paperCommands.push(args);if(window.paperFailure)return {error:{message:'Transport unavailable'}};const r=window.paperRows.find(r=>r.request_id===args.p_request);r.status=args.p_status;r.sync_version++;r.communication.push({status:args.p_status,message:args.p_message,expectation:args.p_expectation,at:'2026-10-20T10:30:00Z',revision:r.sync_version});return {data:null};}
  return original(name,args);
 };}
 await context.addInitScript({content:'('+installPlatformFixture.toString()+')();('+fixture.toString()+')();'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto(origin+'/?fixtureRole=master_admin');await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady;});
 await page.locator('[data-p-page="clients"]').click();await page.locator('[data-p-action="open-client"][data-p-id="1"]').click();
 await page.locator('[data-p-action="paper-status"][data-status="rejected"]').waitFor();
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
}finally{await browser?.close();await server.close();}
