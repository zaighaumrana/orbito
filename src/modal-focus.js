// App modals share keyboard behavior; the independent confirmation layer owns
// focus while it is present. Existing edit-form DOM retention stays in render.
let panel=null,returnFocus=null,returnTarget=null,closeModal;
export function resetModalFocus(){panel=null;returnFocus=null;returnTarget=null;closeModal=null;}
export function syncModalFocus(app,onClose,opener=document.activeElement) {
  const next=app.querySelector('.modal-backdrop .modal');closeModal=onClose;
  if(!next){
    if(panel && returnFocus?.isConnected)returnFocus.focus();
    else if(panel && returnTarget){const button=[...app.querySelectorAll('button')].find(n=>n.dataset.pAction===returnTarget.pAction && n.dataset.pId===returnTarget.pId && n.dataset.pModal===returnTarget.pModal);button?.focus();}
    panel=null;returnFocus=null;returnTarget=null;return;
  }
  if(next===panel)return;
  if(!panel){returnFocus=opener;returnTarget={pAction:returnFocus?.dataset?.pAction,pId:returnFocus?.dataset?.pId,pModal:returnFocus?.dataset?.pModal};}
  panel=next;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.tabIndex=-1;
  const title=panel.querySelector('h2');if(title){title.id ||= 'platform-modal-title';panel.setAttribute('aria-labelledby',title.id);}
  for(const button of panel.querySelectorAll('[data-p-close]'))if(['×','✕'].includes(button.textContent.trim()))button.setAttribute('aria-label','Close dialog');
  (panel.querySelector('input:not([type=hidden]):not([readonly]),button') || panel).focus();
}
document.addEventListener('keydown',event=>{
  if(!panel?.isConnected || document.querySelector('.platform-dialog-backdrop,.invoice-preview'))return;
  if(event.key==='Escape'){event.preventDefault();closeModal?.();return;}
  if(event.key!=='Tab')return;
  const nodes=[...panel.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex="0"]')].filter(n=>!n.disabled && !n.hidden && n.getClientRects().length);
  const first=nodes[0],last=nodes.at(-1);
  if(!nodes.length){event.preventDefault();panel.focus();}
  else if(event.shiftKey && (document.activeElement===first || !panel.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey && (document.activeElement===last || !panel.contains(document.activeElement))){event.preventDefault();first.focus();}
});
