// Actual Platform entry, navigation, modal event and copy controls. Provider double.
import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'fixture',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-sdk':null,load:id=>id==='\0fixture-sdk'?'export const createClient=(...a)=>window.fixtureClientFactory(...a);':null}]});
let browser;const errors=[],external=[];
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));await context.addInitScript(installPlatformFixture);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto(origin+'/');await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady});
 await page.locator('[data-p-page="clients"]').click();await page.locator('[data-p-action="open-client"][data-p-id="1"]').click();
 await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.clientData?.clientId===1&&!pState.clientData.loading});
 await page.evaluate(async()=>{const {pState}=await import('/src/state.js');const {render}=await import('/src/render.js');pState.selectedClient={...pState.selectedClient,id:50,pairing_mode:'byo',owner_email:'owner@example.test'};pState.clientData={...pState.clientData,clientId:50,config:{id:50},supportAutomation:{state:'waiting',reason:'prerequisites'},provisioning:{connection:{health:{owner_account:'active',onboarding:'onboarding_complete',checks:Object.fromEntries(['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'].map(k=>[k,true]))}}}};render()});
 await page.getByText('Ready for BYO Support enrollment',{exact:true}).waitFor();await page.getByRole('button',{name:'Open complete BYO guide',exact:true}).click();await page.getByRole('dialog').waitFor();
 const steps=await page.locator('.byo-steps>li').allTextContents();assert.equal(steps.length,12);
 const commands=await page.locator('.setup-command code').allTextContents();
 for(const text of ['--login','--public-config','--status','--verify-dist','--enroll','--record-acceptance'])assert.ok(commands.some(c=>c.includes(text)),text);
 const install=commands.find(c=>c.includes('--mode fresh'));assert.match(install,/--journal "\$setupRoot\/journal.json"/);assert.match(install,/--public-config "\$setupRoot\/public-shop.json"/);
 const copy=page.locator('.setup-command').filter({hasText:install}).locator('button.setup-copy');await copy.click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),install);
 if(process.env.SUPPORT_VISUAL_DIR){mkdirSync(process.env.SUPPORT_VISUAL_DIR,{recursive:true});writeFileSync(join(process.env.SUPPORT_VISUAL_DIR,'actual-screen-walkthrough.json'),JSON.stringify({kind:'local browser/provider double',steps,commands},null,2));
  for(const width of [320,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),JSON.stringify(await page.getByRole('dialog').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,overflow:[...e.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>e.getBoundingClientRect().right).map(x=>[x.tagName,x.className,x.clientWidth,x.scrollWidth]).slice(0,12)}))));await page.screenshot({path:join(process.env.SUPPORT_VISUAL_DIR,`byo-guide-${width}.png`)});}}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: actual Platform entry/navigation, ready-but-disabled BYO Support, twelve guide stages, context-bound installer/build commands, clipboard copy, 320/1440 layout; no hosted I/O.');
}finally{await browser?.close();await server.close();}
