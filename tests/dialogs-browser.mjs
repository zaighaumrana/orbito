// Optional real Chromium harness using existing tools. No hosted SDK or writes.
// Set PLAYWRIGHT_MODULE_PATH and CHROMIUM_EXECUTABLE_PATH if not installed locally.
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
let chromium;
try { ({chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright')); }
catch { console.log('SKIP: existing Playwright unavailable; no installation attempted.');process.exitCode=2; }
if(chromium){
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const html='<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main id="platform-app"><button id="open">Open dialog</button><button id="logout" data-p-action="logout">Logout</button></main><script type="module" src="/fixture.js"></script></body></html>';
 const fixture=`import {confirmDialog,inputDialog,cancelDialogs,notify} from '/dialogs.js';
 const pState={authenticated:true,currentUser:{role:'master_admin',username:'Synthetic'},data:{}};
 const pb={auth:{signOut:async()=>{window.signouts++;}}};
 const render=()=>{document.getElementById('platform-app').innerHTML='<button id="open">New opener</button><button id="logout" data-p-action="logout">Logout</button>';};
 const validateSession=async()=>{};
 window.results=[];window.signouts=0;window.ui={confirmDialog,inputDialog,cancelDialogs,render,pState};
 window.openDecision=()=>{document.getElementById('open').focus();confirmDialog({title:'Synthetic confirmation',message:'No remote operation.',danger:true}).then(value=>window.results.push(value));};
 `+read('src/events.js').replace(/^import[\s\S]*?;\s*/gm,'')+'\ninitEvents(); window.ready=true;';
 const resources={'/':{type:'text/html',body:html},'/fixture.js':{type:'text/javascript',body:fixture},'/dialogs.js':{type:'text/javascript',body:read('src/dialogs.js')},'/styles.css':{type:'text/css',body:read('src/styles.css')}};
 const server=createServer((req,res)=>{const resource=resources[req.url];res.writeHead(resource?200:404,{'Content-Type':resource?.type || 'text/plain'});res.end(resource?.body || 'Not found');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let browser,passed=0;const external=[],errors=[];
 try {
  try {browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}: {})});}
  catch(error){console.log('SKIP: local Chromium could not launch ('+(error.code || error.name)+'); no repair attempted.');process.exitCode=2;}
  if(browser){
   const context=await browser.newContext();await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
   const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
   for(const width of [320,768,1440])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:900});await page.goto(origin);await page.waitForFunction(()=>window.ready);await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const open=()=>page.evaluate(()=>window.openDecision());const dialog=page.getByRole('alertdialog');const cancel=page.getByRole('button',{name:'Cancel',exact:true});const confirm=page.getByRole('button',{name:'Confirm',exact:true});
    await open();await cancel.waitFor();assert.equal(await cancel.evaluate(n=>n===document.activeElement),true);assert.equal(await page.locator('#platform-app').evaluate(n=>n.inert),true);
    await page.keyboard.press('Shift+Tab');assert.equal(await confirm.evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await cancel.evaluate(n=>n===document.activeElement),true);
    const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=900);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>window.results.length===1);assert.equal(await page.evaluate(()=>window.results[0]),false);assert.equal(await page.locator('#open').evaluate(n=>n===document.activeElement),true);
    await open();await cancel.click();await open();await page.locator('.platform-dialog-backdrop').click({position:{x:2,y:2}});await page.waitForFunction(()=>window.results.length===3);assert.deepEqual(await page.evaluate(()=>window.results),[false,false,false]);
    await open();await page.keyboard.press('Tab');assert.equal(await confirm.evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.results.length===4);assert.deepEqual(await page.evaluate(()=>window.results),[false,false,false,true]);
    await open();await page.evaluate(()=>window.ui.render());await dialog.waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#platform-app').evaluate(n=>n===document.activeElement&&!n.inert),true);
    await open();await page.evaluate(()=>document.getElementById('logout').click());await page.waitForFunction(()=>window.signouts===1&&window.results.length===6);assert.equal(await page.evaluate(()=>window.results.at(-1)),false);assert.equal(await page.evaluate(()=>window.ui.pState.authenticated),false);assert.equal(await page.locator('.platform-dialog-backdrop').count(),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    console.log('PASS: real Chromium '+width+'px '+theme+' — focus/keyboard, Escape/Cancel/backdrop, one-shot confirm, rerender, mocked logout handler, viewport bounds.');passed++;
   }
   assert.deepEqual(external,[]);assert.deepEqual(errors,[]);console.log('PASS: '+passed+' browser groups; zero external requests or page errors.');await context.close();
  }
 } catch(error){console.error('FAIL: browser regression — '+error.message);process.exitCode=1;}
 finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
