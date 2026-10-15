// Actual application modules, synthetic Auth/REST/CAPTCHA and blocked external
// I/O. --baseline renders the exact starting source solely for before images.
import {createServer} from 'vite';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
const baseline=process.argv[2]==='--baseline',focused=process.argv[2]==='--delete-dialog-only',actionsOnly=process.argv[2]==='--actions-only';
assert.ok(process.argv.length===2 || process.argv.length===3 && (baseline || focused || actionsOnly),'Only local baseline/focused selectors are accepted');
const evidence=process.env.ORBITO_UI_EVIDENCE?resolve(process.env.ORBITO_UI_EVIDENCE):null;
if(evidence){assert.ok(relative(process.cwd(),evidence).startsWith('..'),'Evidence must be outside Git');mkdirSync(evidence,{recursive:true});}
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright'));}
catch{console.log('SKIP: existing Playwright unavailable; no installation attempted.');process.exitCode=2;}
if(chromium){
 const cache=new Map(),prior=path=>{if(!cache.has(path))cache.set(path,execFileSync('git',['show','71136819abbf36ef4fc36b69702c14a471582792:'+path],{encoding:'utf8'}));return cache.get(path);};
 const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},
  define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public-fixture'),'import.meta.env.VITE_PLATFORM_AUTH_EMAIL':JSON.stringify('master@example.test'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},
  plugins:[{name:'synthetic-platform-transport',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-supabase':null,
   load:id=>id==='\0fixture-supabase'?'export const createClient=(...args)=>window.fixtureClientFactory(...args);':null,
   transform:(_code,id)=>{const path=relative(process.cwd(),id.split('?')[0]).replaceAll('\\','/');return baseline && /^src\/.*\.(js|css)$/.test(path)?prior(path):null;},
   transformIndexHtml:html=>baseline?prior('index.html'):html}]});
 let browser;const errors=[],external=[],checks=[];
 try{
  await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  const context=await browser.newContext();await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():(external.push(route.request().url()),route.abort()));
  await context.addInitScript(installPlatformFixture);
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
  const state=fn=>page.evaluate(async fn=>{const {pState}=await import('/src/state.js');return (new Function('state','return ('+fn+')(state)'))(pState);},fn.toString());
  const setPage=async name=>page.evaluate(async name=>{const {pState}=await import('/src/state.js');(await import('/src/async-context.js')).selectClient();pState.modal=null;pState.page=name;pState.filter='';(await import('/src/render.js')).render();},name);
  const snapshot=async(label,width,theme)=>{if(evidence)await page.screenshot({path:resolve(evidence,(baseline?'before-':'after-')+label+'-'+width+'-'+theme+'.png'),fullPage:true});};
  const nav=async name=>{const link=page.locator('[data-p-page="'+name+'"]').first();if((await link.boundingBox()).x<0)await page.locator('#p-menu-btn').click();await link.click();};
  const noOverflow=async()=>{
   const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,path:location.pathname,nodes:[...document.querySelectorAll('#platform-app *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1 && getComputedStyle(n).position!=='fixed' && !n.closest('.table-wrap,.platform-sidebar')).slice(0,8).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width}))}));
   if(overflow.scroll>overflow.width+1 && evidence)await page.screenshot({path:resolve(evidence,'browser-overflow.png'),fullPage:true});
   assert.ok(overflow.scroll<=overflow.width+1,'No whole-page horizontal overflow: '+JSON.stringify(overflow));
  };
  const manage=async name=>page.getByRole('row').filter({has:page.getByText(name,{exact:true})}).getByRole('button',{name:'Manage',exact:true}).click();
  const panel=()=>page.locator('.employee-detail');
  for(const width of actionsOnly?[]:focused?[768]:[320,768,1440])for(const theme of focused?['dark']:['light','dark']){
   await page.setViewportSize({width,height:960});await page.goto(origin);await page.waitForFunction(async()=>{const s=(await import('/src/state.js')).pState;return s.authenticated && s.dataReady;});
   await page.evaluate(async theme=>{const {pState}=await import('/src/state.js');pState.theme=theme;localStorage.setItem('retailos-platform-theme',theme);(await import('/src/render.js')).render();},theme);
   for(const name of baseline?['overview','clients','billing','support','settings']:['overview','clients','billing','support','settings','team']){
    await setPage(name);if(!baseline)await noOverflow();await snapshot(name,width,theme);
    if(name==='clients'){
     await page.getByRole('button',{name:'Manage',exact:true}).first().click();await page.waitForFunction(async()=>{const s=(await import('/src/state.js')).pState;return s.page==='client-detail' && !s.clientData.loading;});
     if(!baseline)await noOverflow();await snapshot('client-detail',width,theme);
    }
   }
   if(baseline){
    await page.evaluate(async()=>{const {pState}=await import('/src/state.js');pState.authenticated=false;pState.page='login';(await import('/src/render.js')).render();});await snapshot('login',width,theme);
    checks.push({width,theme,baseline:true});continue;
   }
   assert.equal(await page.locator('.sidebar-role').textContent(),'Master Admin');
   assert.equal(await page.locator('.platform-sidebar').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(11, 18, 40)');
   assert.equal(await page.locator('.sidebar-brand img').getAttribute('src'),'/brand/logos/retrasell-horizontal-reversed.svg');
   await page.getByRole('tab',{name:/Active users/}).focus();await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:/Archived users/}).getAttribute('aria-selected'),'true');await page.keyboard.press('Home');
   await page.getByRole('tab',{name:/Pending invitations/}).click();await page.getByRole('searchbox',{name:'Search employees'}).fill('Failed');
   assert.equal(await page.getByRole('button',{name:'Manage',exact:true}).count(),1);await manage('Failed Invitation');await panel().waitFor();
   assert.equal(await panel().getByRole('button',{name:'Delete Permanently'}).count(),0);
   await panel().getByRole('button',{name:'View invitation status'}).click();await page.getByRole('heading',{name:'Invitation needs review',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Resend invitation',exact:true}).count(),0);await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   await page.getByRole('tab',{name:/Active users/}).click();await manage('Active Employee');
   for(let n=0;n<10;n++){await page.keyboard.press('Tab');assert.ok(await panel().evaluate(n=>n.contains(document.activeElement)));}
   const dialog=page.getByRole('alertdialog');
   const open=async()=>{await panel().getByRole('button',{name:'Delete Permanently',exact:true}).click();await dialog.waitFor();};
   await open();assert.equal(await page.locator('#platform-app').evaluate(n=>n.inert),true);
   await page.locator('input[name=password]').fill('SyntheticDelete1!');await page.locator('.platform-dialog-backdrop').click({position:{x:2,y:2}});
   assert.equal(await page.locator('input[name=password]').inputValue(),'SyntheticDelete1!');
   for(let n=0;n<12;n++){await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(n=>n.contains(document.activeElement)));}
   await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);await open();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
   await open();await page.locator('input[name=password]').fill('SyntheticDelete1!');await dialog.locator('input[type=checkbox]').check();
   await page.evaluate(async()=>{(await import('/src/state.js')).pState.turnstileToken=null;});await dialog.locator('form').dispatchEvent('submit');assert.equal(await state(s=>s.data.platformUsers.length),4);
   await page.evaluate(async()=>{(await import('/src/state.js')).pState.turnstileToken='synthetic-captcha';});
   await dialog.getByRole('button',{name:'Delete Permanently',exact:true}).focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');
   await page.getByText(/No deletion operation was recorded at the verified history check/).waitFor();
   assert.equal(await page.evaluate(()=>window.fixtureWrites.filter(w=>w.name==='delete-platform-user').length),1);
   if(!await panel().count())await manage('Active Employee');await open();await page.evaluate(()=>{window.fixtureRevoked=true;window.dispatchEvent(new Event('focus'));});
   await page.getByRole('heading',{name:'Sign in to your workspace',exact:true}).waitFor();
   assert.equal(await dialog.count(),0);assert.equal(await state(s=>s.data.platformUsers.length),0);assert.equal(await state(s=>s.currentUser.role),null);
   await snapshot('login',width,theme);await noOverflow();checks.push({width,theme,pass:true});console.log('PASS: Team/search, review/resend guard, modal focus, sticky deletion inputs, cancel/one-shot and canonical revocation; '+width+'px '+theme);
   await page.getByRole('button',{name:'Forgot password?'}).click();await snapshot('recovery',width,theme);await noOverflow();
   await page.evaluate(async()=>{const {pState}=await import('/src/state.js');pState.page='reset-password';pState.recoveryEmail='pending@example.test';(await import('/src/render.js')).render();});await snapshot('password-setup',width,theme);await noOverflow();
  }
  if(!baseline && !focused){
   await page.setViewportSize({width:1440,height:960});await page.goto(origin+'/team');await page.getByRole('heading',{name:'Team Management',exact:true}).waitFor();
   await page.getByRole('tab',{name:/Pending invitations/}).click();await manage('Failed Invitation');await panel().getByRole('button',{name:'Clear Failed Invitation'}).click();
   await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Clear Failed Invitation?',exact:true})}).getByRole('button',{name:'Clear Failed Invitation',exact:true}).click();
   await page.getByText(/Failed invitation cleared\. Audit history/).waitFor();assert.equal(await page.getByRole('row').filter({hasText:'Failed Invitation'}).count(),0);
   await manage('Pending Employee');await panel().getByRole('button',{name:'View invitation status'}).click();await page.getByRole('button',{name:'Resend invitation',exact:true}).click();
   await page.getByText(/Setup email requested/).waitFor();assert.equal(await page.evaluate(()=>window.fixtureWrites.filter(w=>w.name==='resend-platform-invitation').length),1);
   await page.keyboard.press('Escape');await page.getByRole('tab',{name:/Archived users/}).click();await page.getByRole('button',{name:'View history'}).click();assert.equal(await panel().getByRole('button').count(),2);await page.keyboard.press('Escape');
   await page.getByRole('tab',{name:/Active users/}).click();await manage('Active Employee');await panel().getByRole('button',{name:'Edit employee'}).click();
   await page.getByLabel('Role',{exact:true}).selectOption('portfolio_manager');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByText('Employee details and role updated.',{exact:true}).waitFor();
   assert.ok(await page.getByRole('row').filter({hasText:'Active Employee'}).getByText('Portfolio Manager',{exact:true}).isVisible());
   await manage('Active Employee');await panel().getByRole('button',{name:'Deactivate',exact:true}).click();await page.getByRole('alertdialog').filter({has:page.getByRole('heading',{name:'Deactivate employee?',exact:true})}).getByRole('button',{name:'Deactivate',exact:true}).click();
   await page.getByText(/Employee deactivated\. Platform access is suspended/).waitFor();await page.keyboard.press('Escape');await page.getByRole('tab',{name:/Inactive users/}).click();await manage('Active Employee');
   await panel().getByRole('button',{name:'Reactivate',exact:true}).click();await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Reactivate employee?',exact:true})}).getByRole('button',{name:'Reactivate',exact:true}).click();
   await page.getByText(/Employee reactivated with the existing identity/).waitFor();await page.keyboard.press('Escape');
   await nav('settings');assert.equal(await page.getByRole('heading',{name:'Team Members'}).count(),0);
   await page.getByRole('button',{name:'Check session continuity',exact:true}).click();await page.getByLabel('Current password',{exact:true}).fill('Synthetic1!');await page.getByRole('button',{name:'Run diagnostic',exact:true}).click();
   await page.getByText(/Diagnostic passed: the original Master session survived/).waitFor();assert.equal(await page.getByLabel('Current password',{exact:true}).inputValue(),'');assert.equal(await state(s=>s.currentUser.password_verification_safe),false);await page.keyboard.press('Escape');
   const openInvoice=()=>page.evaluate(async()=>{const {pState}=await import('/src/state.js');(await import('/src/billing.js')).showInvoiceConfirmModal(pState.data.invoices[0]);});
   await openInvoice();const invoice=page.locator('.invoice-preview');await invoice.waitFor();
   for(let n=0;n<8;n++){await page.keyboard.press('Tab');assert.ok(await invoice.evaluate(node=>node.contains(document.activeElement)));}
   await page.keyboard.press('Escape');assert.equal(await invoice.count(),0);await openInvoice();await page.evaluate(()=>{window.fixtureRevoked=true;window.dispatchEvent(new Event('focus'));});
   await page.getByRole('heading',{name:'Sign in to your workspace',exact:true}).waitFor();assert.equal(await invoice.count(),0);
   for(const role of ['portfolio_manager','billing_person']){
    await page.goto(origin+'/team?fixtureRole='+role);await page.getByText(/Access Restricted/).waitFor();assert.equal(await page.locator('[data-p-page=team]').count(),0);
    await nav('overview');await nav('settings');await page.evaluate(async()=>{const {pState}=await import('/src/state.js');pState.currentUser.role='master_admin';(await import('/src/render.js')).render();});
    await nav('team');assert.equal(await page.getByRole('heading',{name:'Team Management',exact:true}).count(),0);
   }
   await page.goto(origin+'/?fixtureRole=anonymous');await page.getByRole('heading',{name:'Sign in to your workspace'}).waitFor();await page.getByRole('button',{name:'Forgot password?'}).click();await page.getByLabel('Account email').fill('unknown@example.test');
   await page.evaluate(()=>window.fixtureRecoveryError={status:429});await page.getByRole('button',{name:'Send reset link',exact:true}).click();await page.getByText('Too many requests. Please wait before trying again.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Back to sign in',exact:false}).click();await page.getByLabel('Username or email').fill('master@example.test');await page.getByLabel('Password',{exact:true}).fill('Synthetic1!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Platform Overview',exact:true}).waitFor();
   await page.reload();await page.getByRole('heading',{name:'Platform Overview',exact:true}).waitFor();assert.equal(await page.locator('.sidebar-role').textContent(),'Master Admin');
   console.log('PASS: explicit clear, legitimate resend, read-only archive, separate Settings, direct/forged employee Team denial and recovery 429.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);if(evidence)writeFileSync(resolve(evidence,baseline?'browser-before.json':'browser-results.json'),JSON.stringify({checks,errors,external},null,2));
  console.log('PASS: '+checks.length+' actual-browser layout groups; '+(baseline?'historical before screenshots only':'synthetic transports, zero external traffic'));await context.close();
 }catch(error){console.error('FAIL: actual local browser — '+error.stack);process.exitCode=1;}
 finally{await browser?.close();await server.close();}
}
