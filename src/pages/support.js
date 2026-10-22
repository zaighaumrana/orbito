import { pState } from "../state.js";
import { tit } from "../helpers.js";
import { esc } from '../operations.js';

export function pageSupport() {
  const view=pState.supportView, busy=!view?.ready||view.loading||view.resolving;
  const tickets = (view?.rows || []).filter(s =>
    s.subject?.toLowerCase().includes(pState.filter.toLowerCase()) ||
    s.client_name?.toLowerCase().includes(pState.filter.toLowerCase())
  );

  return `
    ${tit("Support Tickets", "Problem reports submitted by clients.", "")}
    ${view?.error?`<div class="card" role="alert">${esc(view.error)}</div>`:''}
    ${view?.loading?'<p role="status">Loading verified Support tickets…</p>':''}
    <div class="toolbar">
      <label class="field"><span>Search this page</span><input class="search" data-p-filter placeholder="Subject or client"
        value="${esc(pState.filter)}"></label>
      <button type="button" class="secondary-button" data-p-action="support-page" data-offset="${esc(view?.offset||0)}" ${view?.loading||view?.resolving?'disabled':''}>Refresh Support tickets</button>
    </div>
    <div class="support-tickets">
      ${tickets.length ? tickets.map(t => {
        const client = pState.data.clients.find(c => c.id === t.client_id);
        let shopLink='';
        try {const url=new URL(client?.shop_url);if(['https:','http:'].includes(url.protocol) && !url.username && !url.password)shopLink=` · <a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary)">${esc(client.shop_url)}</a>`;} catch {/* Invalid/non-web links remain plain text. */}
        return `
          <article class="card support-ticket">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
              <div>
                <strong style="font-size:16px">${esc(t.subject || "No subject")}</strong>
                <div class="muted" style="font-size:13px;margin-top:2px">
                  ${esc(t.client_name || "Unknown client")} · <span class="badge ${t.verified?'good':'warn'}">${t.verified ? "Verified Shop session" : "Legacy / Identity Not Verified"}</span>
                  ${client ? `· ${esc(client.plan)}${shopLink}` : ""}
                  · ${new Date(t.created_at).toLocaleString()}
                </div>
              </div>
              <span class="badge ${t.status === "Open" ? "warn" : "good"}">${esc(t.status)}</span>
            </div>
            <div class="muted">Category: ${esc(t.category||'Unspecified')}${t.verified ? ' · '+esc(t.project_ref)+' · '+esc(t.requester_role) : ''}</div>
            <div class="support-message">
              ${esc(t.message || "—")}
            </div>
            ${t.resolution ? '<div style="white-space:pre-wrap">Resolution: '+esc(t.resolution)+'</div>' : ''}
            ${(t.history||[]).map(e=>'<div class="muted">'+esc(e.action)+' · '+esc(new Date(e.created_at).toLocaleString())+'</div>').join('')}
            ${t.status === "Open" ? `
              <label class="field"><span>Customer-visible resolution (optional)</span><textarea id="support-resolution-${esc(t.id)}" maxlength="4000" rows="3" ${busy?'disabled':''}>${esc(view?.drafts?.[t.id]||'')}</textarea></label>
              <div style="display:flex;justify-content:flex-end">
                <button class="primary-button" data-p-action="resolve-ticket" data-p-id="${esc(t.id)}" data-p-revision="${esc(t.revision)}" ${busy||!Number.isSafeInteger(t.revision)?'disabled':''}>
                  ${view?.resolving?'Resolving…':'Mark Resolved'}
                </button>
              </div>` : ""}
          </article>`;
      }).join("") : `<div class="empty">${view?.ready?'No support tickets.':'Load verified Support tickets using Refresh.'}</div>`}
    </div>
    <nav class="toolbar support-pagination" aria-label="Support ticket pages">
      <button type="button" class="secondary-button" data-p-action="support-page" data-offset="${Math.max(0,(pState.supportView?.offset||0)-50)}" ${busy||!view?.offset?'disabled':''}>Previous</button>
      <span aria-live="polite">Page ${Math.floor((pState.supportView?.offset||0)/50)+1}</span>
      <button type="button" class="secondary-button" data-p-action="support-page" data-offset="${(pState.supportView?.offset||0)+50}" ${busy||!view?.has_more||view.offset>=5000?'disabled':''}>Next</button>
    </nav>`;
}
