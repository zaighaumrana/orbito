// Actual Vite/billing code and native font/image loading. Only Auth/data transport
// and the final OS print dialog are substituted; all data is synthetic/loopback.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {writeFileSync,readFileSync} from 'node:fs';
import {createServer as createProxy,request as forward} from 'node:http';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {installPlatformFixture} from './helpers/platform-browser-fixture.mjs';
assert.equal(process.argv.length,2,'No hosted target or extra arguments accepted');
const evidence=process.env.ORBITO_UI_EVIDENCE?resolve(process.env.ORBITO_UI_EVIDENCE):null;
if(evidence)assert.ok(relative(process.cwd(),evidence).startsWith('..'),'Evidence must be outside Git');
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright'));}
catch{console.log('SKIP: existing Playwright unavailable; no installation attempted.');process.exitCode=2;}
if(chromium){
 const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0,hmr:false},
  define:{'import.meta.env.VITE_PLATFORM_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_PLATFORM_ANON':JSON.stringify('synthetic-public-fixture'),'import.meta.env.VITE_PLATFORM_AUTH_EMAIL':JSON.stringify('master@example.test'),'import.meta.env.VITE_TURNSTILE_KEY':JSON.stringify('synthetic-site')},
  plugins:[{name:'synthetic-print-transport',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-print-supabase':null,
   load:id=>id==='\0fixture-print-supabase'?'export const createClient=(...args)=>window.fixtureClientFactory(...args);':null}]});
 let browser,proxy,activeCase;const results=[],blockedExternal=[],appExternal=[],forwarded=new Set();
 try{
  await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
  // CDP routing stalls native about:blank document.write asset requests in this
  // installed Edge. A deny-by-default loopback proxy controls real network I/O.
  proxy=createProxy((req,res)=>{
   const url=new URL(req.url,origin);
   if(url.origin!==origin){blockedExternal.push(url.origin);res.writeHead(403);res.end();return;}
   const font=/^\/brand\/fonts\/Inter-(400|500|600|700)\.woff2$/.test(url.pathname),logo=url.pathname==='/brand/logos/retrasell-horizontal-primary.svg';
   if(activeCase && (font || logo)){
    const {mode,assets,held}=activeCase;assets.push({path:url.pathname});
    const send=()=>{if(res.destroyed)return;const data=readFileSync(resolve('public'+url.pathname));res.writeHead(200,{'Content-Type':font?'font/woff2':'image/svg+xml','Cache-Control':mode==='warm-repeat'?'public, max-age=3600':'no-store'});res.end(data);};
    if(mode==='image-missing' && logo || mode==='font-failure' && font){res.writeHead(404);res.end();return;}
    if(['image-first','font-timeout','closed','revoked'].includes(mode) && font || ['fonts-first','image-timeout'].includes(mode) && logo){held.push({send,abort:()=>res.destroy()});return;}
    send();return;
   }
   forwarded.add(url.origin);
   const upstream=forward(url,{method:req.method,headers:{...req.headers,host:url.host}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
  });
  proxy.on('connect',(req,socket)=>{if(!req.url.startsWith('127.0.0.1:'))blockedExternal.push(req.url);socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');});
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:'+proxy.address().port,bypass:'<-loopback>'},...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  for(const mode of ['fonts-first','image-first','warm-repeat','image-missing','decode-failure','font-failure','font-timeout','image-timeout','closed','revoked']){
   const context=await browser.newContext(),held=[],errors=[],assets=[],consoleErrors=[];let page;
   try{
    context.on('request',request=>{if(!request.url().startsWith(origin+'/'))appExternal.push(new URL(request.url()).origin);});
    context.on('page',child=>child.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text().replace(/token=[^\s'"&]+/g,'token=[local-dev-token]'));}));
    await context.addInitScript(installPlatformFixture);
    page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(async()=>{const {pState}=await import('/src/state.js');return pState.authenticated && pState.dataReady;});
    await page.evaluate(()=>Promise.all([400,500,600,700].map(weight=>document.fonts.load(`${weight} 12px Inter`))));
    activeCase={mode,assets,held};
    await page.evaluate(async mode=>{
     const {printClientInvoices}=await import('/src/billing.js'),{pState}=await import('/src/state.js');
     window.fixturePrints=[];const open=window.open.bind(window);
     window.open=(...args)=>{
      window.fixturePrintActivation=navigator.userActivation.isActive;
      const popup=open(...args);window.fixturePrintPopup=popup;
      if(mode==='decode-failure'){const decode=popup.HTMLImageElement.prototype.decode;popup.HTMLImageElement.prototype.decode=function(){return decode.call(this).then(()=>{throw Error('Injected decode rejection');});};}
      popup.print=()=>window.fixturePrints.push({faces:[...popup.document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})),images:[...popup.document.images].map(i=>({width:i.naturalWidth,complete:i.complete})),text:popup.document.body.textContent,style:popup.document.querySelector('style').textContent,base:popup.document.baseURI});
      return popup;
     };
     const button=document.createElement('button');button.textContent='Print synthetic invoice';button.onclick=()=>printClientInvoices(pState.data.clients[0],pState.data.invoices);document.body.append(button);
    },mode);
    await page.getByRole('button',{name:'Print synthetic invoice',exact:true}).click();
    const popup=context.pages().find(child=>child!==page);
    if(popup&&!popup.isClosed())await popup.bringToFront().catch(error=>{if(!popup.isClosed())throw error});
    assert.equal(await page.evaluate(()=>window.fixturePrintActivation),true,'Popup remains inside the real user gesture');
    if(['fonts-first','image-first'].includes(mode)){
     await page.waitForFunction(mode=>mode==='fonts-first'?[...window.fixturePrintPopup.document.fonts].length===4 && [...window.fixturePrintPopup.document.fonts].every(f=>f.status==='loaded'):[...window.fixturePrintPopup.document.images].every(i=>i.complete && i.naturalWidth>0),mode);
     assert.equal(await page.evaluate(()=>window.fixturePrints.length),0,'One ready asset group cannot print');
     assert.equal(held.length,mode==='fonts-first'?1:4);
     for(const request of held.splice(0))request.send();
    }else if(mode.endsWith('timeout') || ['closed','revoked'].includes(mode)){
     await page.waitForFunction(()=>window.fixturePrintPopup && !window.fixturePrintPopup.closed);
     if(mode==='closed')await page.evaluate(()=>window.fixturePrintPopup.close());
     if(mode==='revoked')await page.evaluate(async()=>{(await import('/src/state.js')).clearSensitiveState();});
    }
    await page.waitForFunction(()=>window.fixturePrintPopup.closed,null,{timeout:mode.endsWith('timeout')?18000:8000});
    const successful=['fonts-first','image-first','warm-repeat'].includes(mode);
    if(mode==='warm-repeat'){
     const firstRequests=assets.length;
     await page.getByRole('button',{name:'Print synthetic invoice',exact:true}).click();await page.waitForFunction(()=>window.fixturePrintPopup.closed && window.fixturePrints.length===2);
     assert.equal(assets.length,firstRequests,'Warm second print reuses cached native assets');
    }
    const records=await page.evaluate(()=>window.fixturePrints);
    assert.equal(records.length,successful?(mode==='warm-repeat'?2:1):0,mode);
    for(const record of records){
     assert.deepEqual(record.faces.map(f=>f.weight).sort(),['400','500','600','700']);assert.ok(record.faces.every(f=>f.status==='loaded' && f.family==='Inter'));
     assert.ok(record.images.every(i=>i.width>0 && i.complete));assert.match(record.text,/Invoice #INV-71/);assert.match(record.text,/Rs\. 123/);assert.match(record.text,/Northstar Repairs/);
     assert.equal(record.base,origin+'/');for(const weight of [400,500,600,700])assert.ok(record.style.includes(origin+'/brand/fonts/Inter-'+weight+'.woff2'));
    }
    const notices=await page.locator('.platform-toast-error').count();assert.equal(notices,successful || ['closed','revoked'].includes(mode)?0:1,mode);
    await page.evaluate(()=>{const doc=window.fixturePrintPopup.document;doc.fonts.dispatchEvent(new Event('loadingdone'));for(const image of doc.images)image.dispatchEvent(new Event('load'));});
    assert.equal(await page.evaluate(()=>window.fixturePrints.length),records.length,'Repeated readiness events cannot duplicate printing');
    assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);assert.deepEqual(errors,[]);
    results.push({mode,result:'PASS',print_count:records.length});console.log('PASS: actual invoice print '+mode);
   }catch(error){
    console.error(JSON.stringify({mode,assets,errors,consoleErrors,pages:context.pages().map(p=>p.url()),state:await page?.evaluate(()=>({closed:window.fixturePrintPopup?.closed,prints:window.fixturePrints?.length,base:window.fixturePrintPopup?.document.baseURI,images:window.fixturePrintPopup && [...window.fixturePrintPopup.document.images].map(i=>({src:i.src,complete:i.complete,width:i.naturalWidth})),faces:window.fixturePrintPopup && [...window.fixturePrintPopup.document.fonts].map(f=>({weight:f.weight,status:f.status})),notices:[...document.querySelectorAll('.platform-toast-error p')].map(n=>n.textContent)})).catch(()=>null)}));throw error;
   }finally{
    activeCase=null;for(const request of held.splice(0))request.abort();await context.close();
   }
  }
  assert.deepEqual(appExternal,[]);assert.deepEqual([...forwarded],[origin]);
  console.log('PASS: 10 focused Edge Chromium scenarios; native local Inter/images, zero external forwarding or data writes; OS print dialog intercepted.');
  console.log('PASS: deny-by-default proxy; '+blockedExternal.length+' Edge background CONNECT attempts blocked; zero external application requests.');
 }catch(error){console.error('FAIL: invoice print browser — '+error.stack);process.exitCode=1;}
 finally{if(evidence)writeFileSync(resolve(evidence,'invoice-browser-results.json'),JSON.stringify({results,blockedExternal,appExternal,forwarded:[...forwarded]},null,2));await browser?.close();proxy?.closeAllConnections();await new Promise(resolve=>proxy?proxy.close(resolve):resolve());await server.close();}
}
