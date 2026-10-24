import {esc} from './operations.js';

// Inline, original artwork. The complete escaped value stays on the control.
export const copyIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h1"/></svg>';
export function copyValue(value,label='value') {
 const name=/^copy\b/i.test(label)?label:`Copy ${label}`;
 return `<button type="button" class="copy-button" data-p-action="copy-setup" data-copy-value="${esc(value)}" aria-label="${esc(name)}" title="${esc(name)}">${copyIcon}<span class="sr-only" data-copy-feedback aria-live="polite"></span></button>`;
}
export function technicalRows(rows) {
 return `<dl class="metadata-grid">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd><code>${esc(value??'Not recorded')}</code>${value!=null?copyValue(value,label):''}</dd></div>`).join('')}</dl>`;
}
export function evidenceDetails(label,value) {
 return `<details class="evidence-details"><summary>${esc(label)}</summary><div class="evidence-actions">${copyValue(JSON.stringify(value,null,2),label)}</div><pre>${esc(JSON.stringify(value,null,2))}</pre></details>`;
}
export const releaseName=value=>String(value||'Not established').replace(/^support-v(\d+)$/,'Support v$1');
