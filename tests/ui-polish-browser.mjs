// Actual UI modules; synthetic Auth/data/CAPTCHA, loopback requests only.
import {createServer} from 'vite';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
let chromium;
try {({chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright'));}
catch {console.log('SKIP: existing Playwright unavailable; no installation attempted.');process.exitCode=2;}
if(chromium){
 const baseline=execFileSync('git',['show','974d011b0501e5028d4fa6c7fc8766c798f7fa34:src/modals/client.js'],{encoding:'utf8'});
 const ctx={pState:{selectedClient:{}}};vm.createContext(ctx);
 vm.runInContext(baseline.replace(/^import .*$/gm,'').replace('export function','function')+';globalThis.old=clientModals("add-client");',ctx);
 const evidence=process.env.ORBITO_UI_EVIDENCE?resolve(process.env.ORBITO_UI_EVIDENCE):null;
 if(evidence){assert.ok(relative(process.cwd(),evidence).startsWith('..'));mkdirSync(evidence,{recursive:true});}
 const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},
  define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public-fixture'),'import.meta.env.VITE_PLATFORM_AUTH_EMAIL':JSON.stringify('master@example.test'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},
  plugins:[{name:'synthetic-ui-transport',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-sdk':null,load:id=>id==='\0fixture-sdk'?'export const createClient=(...args)=>window.fixtureClientFactory(...args);':null}]});
 let browser;const errors=[],external=[];
 try {
  await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));
  await context.addInitScript(installPlatformFixture);
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,768,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:960});await page.goto(origin+'/?fixtureRole=anonymous');
   await page.locator('[data-auth-form="login"]').waitFor();
   await page.evaluate(async theme=>{const {pState}=await import('/src/state.js');pState.theme=theme;(await import('/src/render.js')).render();},theme);
   // Reserve the real default Turnstile footprint without contacting its provider.
   await page.locator('#verification-widget').evaluate(n=>{const box=document.createElement('div');box.style.cssText='width:300px;height:65px;flex-shrink:0';box.textContent='Synthetic verification';n.append(box);});
   assert.ok(await page.locator('#platform-username').isVisible());assert.equal(await page.locator('#platform-pin').getAttribute('autocomplete'),'current-password');
   assert.equal(await page.locator('#platform-pin-error').textContent(),'Unable to sign in. Please check your credentials. If your account has been suspended, contact your administrator.');
   const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow at '+width);
   await noOverflow();await page.evaluate(()=>document.fonts.ready);
   if(evidence)await page.screenshot({path:resolve(evidence,`login-${width}-${theme}.png`),fullPage:true});
   await page.goto(origin);await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated&&pState.dataReady;});
   await page.evaluate(async theme=>{const {pState}=await import('/src/state.js');pState.theme=theme;pState.modal={type:'add-client'};(await import('/src/render.js')).render();},theme);
   const form=page.locator('[data-p-form="add-client"]');await form.waitFor();
   const actionBox=await form.getByRole('button',{name:'Next',exact:true}).boundingBox();assert.ok(actionBox.y>=0&&actionBox.y+actionBox.height<=960,'Actions remain in the viewport');
   const contract=await form.evaluate((current,old)=>{
    const prior=document.createElement('template');prior.innerHTML=old;
    const controls=root=>[...root.querySelectorAll('input,select')].map(n=>({tag:n.tagName,attributes:[...n.attributes].filter(a=>a.name!=='disabled').map(a=>[a.name,a.value]).sort(),options:[...n.querySelectorAll('option')].map(o=>({value:o.value,text:o.textContent.trim()}))})).sort((a,b)=>a.attributes.find(x=>x[0]==='name')[1].localeCompare(b.attributes.find(x=>x[0]==='name')[1]));
    return {before:controls(prior.content),after:controls(current),labelled:[...current.querySelectorAll('input,select')].every(n=>n.labels.length>0),sections:current.querySelectorAll('fieldset>legend').length};
   },ctx.old);
   assert.deepEqual(contract.after,contract.before,'All original controls, options and validation attributes retained');assert.equal(contract.labelled,true);assert.equal(contract.sections,5);
   assert.equal(await form.evaluate(n=>n.checkValidity()),false,'Required validation unchanged');
   assert.equal(await form.locator('fieldset:visible').count(),1);
   await page.evaluate(async()=>{const {pState}=await import('/src/state.js');pState.clientWizard.step=3;(await import('/src/render.js')).render()});
   await form.locator('[name="inventory_addon"]').selectOption('true');assert.ok(await page.locator('#onboard-inv-rate-field').isVisible());
   await form.locator('[name="inventory_addon"]').selectOption('false');assert.ok(await page.locator('#onboard-inv-rate-field').isHidden());
   await noOverflow();if(width===1440)assert.ok((await page.locator('.add-client-modal').boundingBox()).width<=860);
   if(evidence)await page.screenshot({path:resolve(evidence,`add-client-${width}-${theme}.png`),fullPage:true});
   await form.getByRole('button',{name:'Save draft & close',exact:true}).click();await form.waitFor({state:'detached'});
   assert.deepEqual(await page.evaluate(()=>window.fixtureWrites),[],'No hosted/client submission or configuration writes');
   console.log(`PASS: login and Add Client ${width}px ${theme}; field contract, labels, responsive layout, addon visibility and Cancel`);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: 6 browser groups; zero page errors/external requests. Native provider challenge and hosted flows not tested.');
 } finally {await browser?.close();await server.close();}
}
