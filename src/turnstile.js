import { pState } from './state.js';
let widget = null, container = null, generation = 0, scriptPromise = null;
const unavailable = 'Verification service unavailable. Check your connection and try again.';
function update(message = '') {
  const button = document.querySelector('[data-captcha-submit]');
  if (button) button.disabled = !pState.turnstileToken || !navigator.onLine || pState.loginLoading || pState.resetLoading || pState.reauthLoading;
  const status = document.getElementById('verification-status');
  if (status) status.textContent = message;
}
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const timer = setTimeout(fail, 15000);
    function fail() { clearTimeout(timer); script.remove(); scriptPromise = null; reject(new Error(unavailable)); }
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); if (window.turnstile) resolve(); else fail(); };
    document.head.append(script);
  });
  return scriptPromise;
}
export function cleanupTurnstile() {
  generation++;
  pState.turnstileToken = null;
  if (widget !== null && container?.isConnected && window.turnstile) {
    try { window.turnstile.remove(widget); } catch { /* Already removed by provider. */ }
  }
  widget = null; container = null;
}
export async function mountTurnstile() {
  cleanupTurnstile();
  container = document.getElementById('verification-widget');
  if (!container) return;
  const current = generation, target = container;
  const valid = () => current === generation && target.isConnected;
  update(navigator.onLine ? 'Complete verification to continue.' : 'Internet connection required to sign in.');
  if (!navigator.onLine) return;
  const sitekey = import.meta.env.VITE_TURNSTILE_KEY;
  if (!sitekey) { update('Verification is not configured. Contact the Platform administrator.'); return; }
  try {
    await loadScript();
    if (!valid()) return;
    widget = window.turnstile.render(target, {
      sitekey, theme: pState.theme === 'light' ? 'light' : 'dark',
      callback: token => { if (valid()) { pState.turnstileToken = token; update(); } },
      'expired-callback': () => { if (valid()) resetTurnstile(); },
      'timeout-callback': () => { if (valid()) resetTurnstile(); },
      'error-callback': () => { if (valid()) { pState.turnstileToken = null; update(unavailable); } return true; },
    });
  } catch { if (valid()) update(unavailable); }
}
export function resetTurnstile() {
  pState.turnstileToken = null;
  update(navigator.onLine ? 'Please verify again.' : 'Internet connection required to sign in.');
  if (widget !== null && container?.isConnected && window.turnstile) {
    try { window.turnstile.reset(widget); return; } catch { /* Remount safely. */ }
  }
  void mountTurnstile();
}
export function captchaBusy() { update(); }
window.addEventListener('online', () => { if (document.getElementById('verification-widget')) void mountTurnstile(); });
window.addEventListener('offline', () => { cleanupTurnstile(); update('Internet connection required to sign in.'); });
