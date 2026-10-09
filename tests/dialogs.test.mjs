// DOM boundary doubles exercise the real module. This is not browser/accessibility certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture() {
 const listeners=new Map(),timers=new Map();let nextTimer=0;const doc={activeElement:null};
 class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.handlers={};this.style={};this.inert=false;this.disabled=false;this.value='';}
  setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
  get isConnected(){return this===doc.body || Boolean(this.parent?.isConnected);}
  set textContent(v){this.text=String(v);this.children=[];}get textContent(){return (this.text || '')+this.children.map(n=>n.textContent).join('');}
  contains(node){return this===node || this.children.some(n=>n.contains(node));}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelectorAll(selector){return this.all().filter(n=>selector.split(',').includes(n.tagName));}
  closest(selector){return selector==='[inert]'?(this.inert?this:this.parent?.closest(selector)):null;}
  focus(){doc.activeElement=this;doc.dispatch('focusin',{target:this});}
  addEventListener(type,fn){(this.handlers[type] ||= []).push(fn);}checkValidity(){return !this.required || Boolean(this.value);}
  emit(type,event={}){event.target ||= this;event.preventDefault ||= ()=>event.prevented=true;event.stopPropagation ||= ()=>{};for(const fn of this.handlers[type] || [])fn(event);return event;}
 }
 doc.body=new Node('body');doc.body.style.overflow='auto';doc.createElement=tag=>new Node(tag);
 doc.getElementById=id=>doc.body.all().find(n=>n.id===id);
 doc.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
 doc.removeEventListener=(type,fn)=>listeners.set(type,listeners.get(type).filter(x=>x!==fn));
 doc.dispatch=(type,event={})=>{event.preventDefault ||= ()=>event.prevented=true;event.stopPropagation ||= ()=>{};for(const fn of [...(listeners.get(type) || [])])fn(event);return event;};
 const app=new Node('main');app.id='platform-app';const opener=new Node('button');app.append(opener);doc.body.append(app);opener.focus();
 const ctx={document:doc,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(ctx);vm.runInContext(read('src/dialogs.js').replace(/^export /gm,''),ctx);const api=vm.runInContext('({notify,confirmDialog,inputDialog,showMessage,cancelDialogs,safeMessage})',ctx);
 const panel=()=>doc.body.all().find(n=>n.getAttribute('aria-modal')==='true');
 return {doc,api,app,opener,timers,listeners,panel,buttons:()=>panel().querySelectorAll('button'),form:()=>panel().querySelectorAll('form')[0]};
}
test('blocking confirmation has accessible semantics, focus trap, scroll lock, Escape cancellation and restored focus',async()=>{
 const f=fixture();const promise=f.api.confirmDialog({title:'Remove?',message:'No mutation before confirmation',danger:true});
 const p=f.panel(),buttons=f.buttons();assert.equal(p.getAttribute('role'),'alertdialog');assert.equal(p.getAttribute('aria-modal'),'true');assert.ok(p.getAttribute('aria-labelledby'));assert.ok(p.getAttribute('aria-describedby'));assert.equal(f.app.inert,true);assert.equal(f.doc.body.style.overflow,'hidden');assert.equal(f.doc.activeElement,buttons[0]);
 buttons.at(-1).focus();assert.equal(f.doc.dispatch('keydown',{key:'Tab'}).prevented,true);assert.equal(f.doc.activeElement,buttons[0]);
 f.doc.dispatch('keydown',{key:'Tab',shiftKey:true});assert.equal(f.doc.activeElement,buttons.at(-1));f.opener.focus();assert.equal(f.doc.activeElement,buttons[0]);
 f.doc.dispatch('keydown',{key:'Escape'});assert.equal(await promise,false);assert.equal(f.app.inert,false);assert.equal(f.doc.body.style.overflow,'auto');assert.equal(f.doc.activeElement,f.opener);assert.equal(f.listeners.get('keydown').length,0);
});
test('Cancel, backdrop dismissal, queued logout cancellation and repeated Enter never authorize another operation',async()=>{
 const f=fixture();let result=f.api.confirmDialog({});f.buttons()[0].emit('click');assert.equal(await result,false);
 result=f.api.confirmDialog({});const backdrop=f.panel().parent;backdrop.emit('click');assert.equal(await result,false);
 const first=f.api.confirmDialog({}),queued=f.api.inputDialog({});const form=f.form();form.emit('submit');form.emit('submit');assert.equal(await first,true);
 f.api.cancelDialogs();assert.equal(await queued,null);assert.equal(f.panel(),undefined);assert.equal(f.app.inert,false);
 const active=f.api.confirmDialog({}),pending=f.api.confirmDialog({});f.api.cancelDialogs();assert.equal(await active,false);assert.equal(await pending,false);
});
test('input validation is labelled, text-only, cancel-safe and preserves password spaces',async()=>{
 const f=fixture();let result=f.api.inputDialog({label:'Reason',validate:value=>value.length<5?'Enter a longer reason.':''});
 let input=f.panel().querySelectorAll('input')[0];assert.ok(input.getAttribute('aria-describedby'));f.form().emit('submit');assert.match(f.panel().textContent,/Enter a value/);
 input.value='no';f.form().emit('submit');assert.match(f.panel().textContent,/longer reason/);input.value=' valid reason ';f.form().emit('submit');assert.equal(await result,'valid reason');
 result=f.api.inputDialog({inputType:'password'});input=f.panel().querySelectorAll('input')[0];assert.equal(input.autocomplete,'new-password');input.value=' spaces matter ';f.form().emit('submit');assert.equal(await result,' spaces matter ');
 result=f.api.inputDialog({});f.buttons()[0].emit('click');assert.equal(await result,null);
});
test('acknowledgment survives app rerender and restores existing inert state with disconnected opener',async()=>{
 const f=fixture();f.app.inert=true;const result=f.api.showMessage({title:'Unresolved',message:'Refresh recorded status.'});f.opener.remove();f.app.textContent='new screen';assert.ok(f.panel());
 f.form().emit('submit');assert.equal(await result,true);assert.equal(f.app.inert,true);assert.equal(f.doc.body.style.overflow,'auto');
});
test('toast variants, safe text, independent timers, persistent errors and manual dismissal clean up without stealing focus',()=>{
 const f=fixture();const markup='<img src=x onerror=bad()>';f.api.notify.success(markup);f.api.notify.info('Information');f.api.notify.warning('Uncertain');f.api.notify.error({message:'private provider data'});
 const region=f.doc.getElementById('platform-notifications');assert.equal(region.children.length,4);assert.equal(region.children[0].getAttribute('role'),'status');assert.equal(region.children[3].getAttribute('role'),'alert');assert.equal(f.doc.activeElement,f.opener);assert.equal(f.timers.size,2);
 assert.match(region.textContent,/<img/);assert.equal(region.children[0].querySelectorAll('img').length,0);assert.doesNotMatch(region.textContent,/private provider/);
 for(const [id,fn] of [...f.timers]){f.timers.delete(id);fn();}assert.equal(region.children.length,2);
 for(const node of [...region.children])node.querySelectorAll('button')[0].emit('click');assert.equal(f.doc.getElementById('platform-notifications'),undefined);assert.equal(f.timers.size,0);
 assert.doesNotMatch(f.api.safeMessage('Bearer secret-value password=secret sb_secret_abcdef'),/secret-value|password=secret|sb_secret_abcdef/);
});
test('styles use both theme variables, small-screen modal rules and reduced-motion override',()=>{
 const css=read('src/styles.css');assert.match(css,/\[data-theme="dark"\]/);assert.match(css,/\.platform-toast[\s\S]*background: var\(--surface\); color: var\(--text\)/);assert.match(css,/width: min\(390px, calc\(100vw - 32px\)\)/);assert.match(css,/prefers-reduced-motion: reduce/);assert.match(css,/\.modal-actions button \{ width: 100%/);
});
test('fresh Turnstile expiry/reset and busy state work in both themes without retaining old challenges',async()=>{
 for(const theme of ['dark','light']){
  const button={},status={},target={isConnected:true};let callbacks,resets=0,removes=0;
  const ctx={testEnv:{VITE_TURNSTILE_KEY:'synthetic-site-key'},pState:{theme,reauthLoading:true,turnstileToken:'old-challenge'},navigator:{onLine:true},document:{getElementById:id=>id==='verification-widget'?target:status,querySelector:()=>button},window:{addEventListener(){},turnstile:{render:(node,options)=>{callbacks=options;return 1;},reset:()=>resets++,remove:()=>removes++}}};
  vm.createContext(ctx);vm.runInContext(read('src/turnstile.js').replace(/^import .*$/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','testEnv'),ctx);
  await ctx.mountTurnstile();assert.equal(ctx.pState.turnstileToken,null);assert.equal(callbacks.theme,theme);callbacks.callback('fresh');assert.equal(button.disabled,true);
  ctx.pState.reauthLoading=false;ctx.captchaBusy();assert.equal(button.disabled,false);callbacks['expired-callback']();assert.equal(ctx.pState.turnstileToken,null);assert.equal(button.disabled,true);assert.equal(resets,1);
  ctx.cleanupTurnstile();callbacks.callback('stale');assert.equal(ctx.pState.turnstileToken,null);assert.equal(removes,1);
 }
});
