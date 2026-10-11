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
export const deleteUserDialog = options => request('delete-user', {...options,danger:true});
export const showMessage = options => request('message', options);
export function cancelDialogs() {
  const queued = pending.splice(0); for (const item of queued) item.resolve(['input','delete-user'].includes(item.kind) ? null : false);
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
  const form = element('form');form.method='post'; let input, error, acknowledgment, reason;
  if (kind === 'delete-user') {
    const accountLabel=element('label','field'),account=element('input');accountLabel.append(element('span','','Administrator account'));
    account.type='email';account.name='username';account.autocomplete='username';account.readOnly=true;account.value=options.accountEmail || '';accountLabel.append(account);form.append(accountLabel);
    const label=element('label','field');label.append(element('span','','Current Master Admin password'));
    input=element('input');input.name='password';input.type='password';input.required=true;input.maxLength=256;input.autocomplete='current-password';label.append(input);form.append(label);
    const reasonLabel=element('label','field');reasonLabel.append(element('span','','Deletion reason (optional)'));reason=element('input');reason.name='reason';reason.maxLength=500;reasonLabel.append(reason);form.append(reasonLabel);
    const acknowledgeLabel=element('label','field');acknowledgment=element('input');acknowledgment.type='checkbox';acknowledgment.required=true;acknowledgeLabel.append(acknowledgment,element('span','','I understand this permanently deletes the account and cannot be undone.'));form.append(acknowledgeLabel);
    const captcha=element('div','verification-widget');captcha.id='team-delete-verification';const status=element('p','muted','Complete fresh verification.');status.id='team-delete-verification-status';status.setAttribute('role','status');form.append(captcha,status);
    const retry=element('button','secondary-button','Retry verification');retry.type='button';retry.addEventListener('click',()=>options.afterMount?.(panel));form.append(retry);
    error=element('p','dialog-validation');error.setAttribute('role','alert');form.append(error);
  }
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
  if(kind==='delete-user'){accept.disabled=true;accept.dataset.captchaSubmit='';}
  if(kind!=='message')actions.append(cancel);actions.append(accept);form.append(actions);panel.append(form);backdrop.append(panel);
  const background=[...document.body.children].filter(node=>node.id!=='platform-notifications');
  const inert=background.map(node=>[node,node.inert]); const overflow=document.body.style.overflow;
  inert.forEach(([node])=>node.inert=true);document.body.style.overflow='hidden';document.body.append(backdrop);
  let done=false;
  const finish=value=>{
    if(done)return;done=true;accept.disabled=true;cancel.disabled=true;
    if(input?.type==='password')input.value='';
    options.onClose?.();
    document.removeEventListener('keydown',keyboard,true);document.removeEventListener('focusin',focusGuard,true);
    backdrop.remove();inert.forEach(([node,previous])=>node.inert=previous);document.body.style.overflow=overflow;active=null;
    if(item.focus?.isConnected&&!item.focus.closest('[inert]'))item.focus.focus();
    else {const app=document.getElementById('platform-app');if(app){app.tabIndex=-1;app.focus();}}
    item.resolve(value);next();
  };
  const cancelValue=()=>['input','delete-user'].includes(kind)?null:false;
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
    if(kind==='delete-user'){
      const captchaToken=options.captchaToken?.();
      if(!input.value || !acknowledgment.checked || !captchaToken){error.textContent='Password, acknowledgment and fresh verification are required.';return;}
      finish({password:input.value,acknowledged:true,captchaToken,reason:reason.value.trim()});
    }else if(kind==='input'){
      const value=input.type==='password'?input.value:input.value.trim();let invalid=input.required&&!value?'Enter a value.':input.checkValidity()?'':'Check this value.';
      try{invalid ||= options.validate?.(value) || '';}catch{invalid='Check this value.';}
      if(invalid){error.textContent=safeMessage(invalid);input.focus();return;}
      finish(value);
    }else finish(true);
  });
  active={cancel:()=>finish(cancelValue())};
  document.addEventListener('keydown',keyboard,true);document.addEventListener('focusin',focusGuard,true);
  options.afterMount?.(panel);
  (input || (kind==='message'?accept:cancel)).focus();
}
