// A separate DOM layer survives Platform rerenders. Messages are text, never HTML.
let sequence = 0, active = null;
const pending = [];
export function safeMessage(value) {
  const text = typeof value === 'string' ? value : value?.userMessage || 'The operation could not be completed. Refresh its status before retrying.';
  return text.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:Bearer\s+\S+|sb_secret_[\w-]+|ghp_[\w]+)\b/gi, '[redacted]')
    .replace(/\b(password|token|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').slice(0, 800);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = safeMessage(text);
  return node;
}
function toast(tone, message, options = {}) {
  let region = document.getElementById('platform-notifications');
  if (!region) { region = element('section', 'platform-notifications'); region.id = 'platform-notifications'; region.setAttribute('aria-label', 'Notifications'); document.body.append(region); }
  const node = element('div', 'platform-toast platform-toast-' + tone);
  node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  node.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
  node.append(element('strong', '', {success:'Success',error:'Error',warning:'Attention',info:'Information'}[tone]), element('p', '', message));
  const close = element('button', 'icon-button', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Dismiss notification');
  let timer;
  const dismiss = () => { clearTimeout(timer); node.remove(); if (!region.children.length) region.remove(); };
  close.addEventListener('click', dismiss); node.append(close); region.append(node);
  const duration = options.duration ?? (['error','warning'].includes(tone) ? 0 : tone === 'success' ? 4500 : 6500);
  if (duration > 0) timer = setTimeout(dismiss, duration);
  return dismiss;
}
export const notify = Object.fromEntries(['success','error','warning','info'].map(tone => [tone, (message, options) => toast(tone, message, options)]));
function request(kind, options) {
  return new Promise(resolve => { pending.push({kind,options,resolve,focus:document.activeElement}); next(); });
}
export const confirmDialog = options => request('confirm', options);
export const inputDialog = options => request('input', options);
export const showMessage = options => request('message', options);
export function cancelDialogs() {
  const queued = pending.splice(0); for (const item of queued) item.resolve(item.kind === 'input' ? null : false);
  active?.cancel();
}
function next() {
  if (active || !pending.length) return;
  const item = pending.shift(), {options,kind} = item;
  const id = 'platform-dialog-' + (++sequence);
  const backdrop = element('div', 'modal-backdrop platform-dialog-backdrop');
  const panel = element('section', 'modal platform-dialog'); panel.tabIndex = -1;
  panel.setAttribute('role', options.danger ? 'alertdialog' : 'dialog'); panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-labelledby',id+'-title'); panel.setAttribute('aria-describedby',id+'-message');
  const title = element('h2','',options.title || 'Please review'); title.id=id+'-title';
  const message = element('p','',options.message || ''); message.id=id+'-message';
  panel.append(title,message);
  const form = element('form'); let input, error;
  if (kind === 'input') {
    const label=element('label','field'), name=element('span','',options.label || 'Value'); input=element('input');
    input.name='value'; input.type=['text','email','number','password'].includes(options.inputType)?options.inputType:'text';
    input.value=options.value || ''; input.required=options.required !== false; input.maxLength=options.maxLength || 500;
    input.autocomplete=input.type==='password'?'new-password':'off';
    error=element('p','dialog-validation');error.id=id+'-error';error.setAttribute('role','alert');input.setAttribute('aria-describedby',error.id);
    label.append(name,input);form.append(label,error);
  }
  const actions=element('div','modal-actions');
  const cancel=element('button','secondary-button','Cancel');cancel.type='button';
  const accept=element('button',options.danger?'danger-button':'primary-button',options.confirmLabel || (kind==='message'?'OK':'Confirm'));accept.type='submit';
  if(kind!=='message')actions.append(cancel);actions.append(accept);form.append(actions);panel.append(form);backdrop.append(panel);
  const background=[...document.body.children].filter(node=>node.id!=='platform-notifications');
  const inert=background.map(node=>[node,node.inert]); const overflow=document.body.style.overflow;
  inert.forEach(([node])=>node.inert=true);document.body.style.overflow='hidden';document.body.append(backdrop);
  let done=false;
  const finish=value=>{
    if(done)return;done=true;accept.disabled=true;cancel.disabled=true;
    document.removeEventListener('keydown',keyboard,true);document.removeEventListener('focusin',focusGuard,true);
    backdrop.remove();inert.forEach(([node,previous])=>node.inert=previous);document.body.style.overflow=overflow;active=null;
    if(item.focus?.isConnected&&!item.focus.closest('[inert]'))item.focus.focus();
    else {const app=document.getElementById('platform-app');if(app){app.tabIndex=-1;app.focus();}}
    item.resolve(value);next();
  };
  const cancelValue=()=>kind==='input'?null:false;
  const focusable=()=>[...panel.querySelectorAll('button,input')].filter(node=>!node.disabled);
  function focusGuard(event){if(!panel.contains(event.target))(input || (kind==='message'?accept:cancel)).focus();}
  function keyboard(event){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(cancelValue());}
    else if(event.key==='Tab'){
      const nodes=focusable(),first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel)){event.preventDefault();first?.focus();}
    }
  }
  cancel.addEventListener('click',()=>finish(cancelValue()));
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)finish(cancelValue());});
  form.addEventListener('submit',event=>{
    event.preventDefault();event.stopPropagation();if(done)return;
    if(kind==='input'){
      const value=input.type==='password'?input.value:input.value.trim();let invalid=input.required&&!value?'Enter a value.':input.checkValidity()?'':'Check this value.';
      try{invalid ||= options.validate?.(value) || '';}catch{invalid='Check this value.';}
      if(invalid){error.textContent=safeMessage(invalid);input.focus();return;}
      finish(value);
    }else finish(true);
  });
  active={cancel:()=>finish(cancelValue())};
  document.addEventListener('keydown',keyboard,true);document.addEventListener('focusin',focusGuard,true);
  (input || (kind==='message'?accept:cancel)).focus();
}
