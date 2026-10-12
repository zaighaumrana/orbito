// Real local browser + actual Settings/dialog/event sources. Synthetic transports,
// mocked CAPTCHA, zero hosted navigation, real emails or Auth writes.
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright'));}
catch{console.log('SKIP: existing Playwright unavailable; no installation attempted.');process.exitCode=2;}
if(chromium){
 const fixture=`import {notify,confirmDialog,showMessage,deleteUserDialog,cancelDialogs} from '/dialogs.js';
 import {pState,PCFG,setPCFG,clearSensitiveState} from '/state.js';
 const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tit=(title,description)=>'<h1>'+esc(title)+'</h1><p>'+esc(description)+'</p>';
 setPCFG({admin_username:'Synthetic'});
 const master='97000000-0000-4000-8000-000000000001';
 Object.assign(pState,{authenticated:true,currentUser:{role:'master_admin',auth_user_id:master,email:'master@example.test'},data:{clients:[],support:[],teamOperations:[],teamArchive:[],platformUsers:['Active','Pending','Inactive'].map((status,n)=>({id:'97000000-0000-4000-8000-00000000000'+(n+2),name:n?'Synthetic '+status:'<img src=x onerror=alert(1)>',email:status.toLowerCase()+'@example.test',role:'billing_person',status,suspended_from:'Active',created_at:'2026-10-11'}))}});
 window.writes=0;window.state=pState;
 const loadOperatorIdentity=async()=>pState.currentUser,loadPlatform=async()=>{};
 const pb={rpc:async()=>({data:{authorized:!window.revoked,auth_user_id:master}}),auth:{signOut:async options=>{window.logoutScope=options.scope;}},functions:{invoke:async(name,{body})=>{if(name==='delete-platform-user'){window.writes++;const row=pState.data.platformUsers.find(u=>u.id===body.id);pState.data.teamArchive.push({...row,joined_at:row.created_at,deleted_at:'2026-10-11',deleted_by:master,operation_id:body.request_id,final_status:'Auth absence verified'});pState.data.platformUsers=pState.data.platformUsers.filter(u=>u!==row);}return{data:{success:true}};}}};
 const cleanupTurnstile=()=>pState.turnstileToken=null;
 const mountTurnstile=async(options={})=>{pState.turnstileToken='synthetic-verification';const button=document.querySelector(options.buttonSelector || '[data-captcha-submit]');if(button)button.disabled=false;};
 const setInterval=()=>{};
 `+read('src/helpers.js').slice(read('src/helpers.js').indexOf('let checking;')).replace(/^export /gm,'')+read('src/pages/settings.js').replace(/^import .*$/gm,'').replace(/^export /gm,'')+`
 const render=()=>document.getElementById('platform-app').innerHTML=pState.authenticated?'<div class="platform-main">'+pageSettings()+'</div>':'<h1>Sign in</h1>';
 `+read('src/events.js').replace(/^import[\s\S]*?;\s*/gm,'')+`
 initEvents();render();window.rerender=render;window.logout=async()=>{window.revoked=true;await validateSession(render);};window.ready=true;`;
 const resources={'/':{type:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main id="platform-app"></main><script type="module" src="/fixture.js"></script></body></html>'},'/fixture.js':{type:'text/javascript',body:fixture},'/state.js':{type:'text/javascript',body:read('src/state.js')},'/dialogs.js':{type:'text/javascript',body:read('src/dialogs.js')},'/styles.css':{type:'text/css',body:read('src/styles.css')}};
 const server=createServer((req,res)=>{const item=resources[req.url];res.writeHead(item?200:404,{'Content-Type':item?.type || 'text/plain'});res.end(item?.body || 'Not found');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let browser;const external=[],errors=[];
 try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch{console.log('SKIP: local Chromium unavailable; no tooling repair attempted.');process.exitCode=2;}
  if(browser){const context=await browser.newContext();await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():(external.push(route.request().url()),route.abort()));const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
   for(const width of [320,768,1440])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:900});await page.goto(origin);await page.waitForFunction(()=>window.ready);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const title of ['Active Users','Pending Invitations','Inactive Users','Archived Users'])await page.getByRole('heading',{name:title,exact:true}).waitFor();
    assert.equal(await page.locator('img').count(),0);assert.equal(await page.getByRole('button',{name:'Send Password Reset Email'}).count(),0);
    const opener=()=>page.getByRole('region',{name:'Active Users',exact:true}).getByRole('button',{name:'Delete Permanently',exact:true});
    const dialog=page.getByRole('alertdialog');
    await opener().click();await dialog.waitFor();assert.equal(await page.locator('input[name=password]').getAttribute('type'),'password');assert.equal(await page.locator('#platform-app').evaluate(n=>n.inert),true);
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.writes),0);
    await opener().click();await dialog.waitFor();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>window.writes),0);
    await opener().click();await dialog.waitFor();await page.locator('.platform-dialog-backdrop').click({position:{x:2,y:2}});assert.equal(await page.evaluate(()=>window.writes),0);
    await opener().click();await dialog.waitFor();const box=await dialog.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width+1);
    for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(n=>n.contains(document.activeElement)),true);}
    await page.locator('input[name=password]').fill('SyntheticDelete1!');await dialog.locator('input[type=checkbox]').check();
    await page.evaluate(()=>window.state.turnstileToken=null);await dialog.locator('form').dispatchEvent('submit');assert.equal(await page.evaluate(()=>window.writes),0);assert.equal(await dialog.count(),1);
    await page.evaluate(()=>window.state.turnstileToken='synthetic-verification');await dialog.getByRole('button',{name:'Delete Permanently',exact:true}).focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.writes===1);assert.equal(await page.getByRole('region',{name:'Archived Users',exact:true}).getByRole('button').count(),0);
    await page.getByRole('region',{name:'Pending Invitations'}).getByRole('button',{name:'Delete Permanently'}).click();await dialog.waitFor();await page.evaluate(()=>window.rerender());await page.keyboard.press('Escape');assert.equal(await page.locator('#platform-app').evaluate(n=>!n.inert),true);
    await page.getByRole('region',{name:'Pending Invitations'}).getByRole('button',{name:'Delete Permanently'}).click();await dialog.waitFor();await page.evaluate(()=>{window.revoked=true;window.dispatchEvent(new Event('focus'));});await dialog.waitFor({state:'detached'});await page.getByRole('heading',{name:'Sign in'}).waitFor();assert.equal(await page.evaluate(()=>window.writes),1);assert.equal(await page.evaluate(()=>window.state.data.platformUsers.length),0);assert.equal(await page.evaluate(()=>window.state.currentUser.role),null);assert.equal(await page.evaluate(()=>window.logoutScope),'local');
    console.log('PASS: actual Team/secure deletion dialog at '+width+'px '+theme+'; escaped identity, four states, cancellation, focus, CAPTCHA gate, one-shot confirmation, rerender and canonical focus revocation clearing private state.');
   }
   assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await context.close();console.log('PASS: six synthetic browser groups; no external traffic.');
  }
 }catch(error){console.error('FAIL: local browser — '+error.message);process.exitCode=1;}
 finally{await browser?.close();await new Promise(r=>server.close(r));}
}
