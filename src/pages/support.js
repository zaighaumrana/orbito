import { pState } from "../state.js";
import { tit } from "../helpers.js";
import { esc } from '../operations.js';

export function pageSupport() {
  const tickets = (pState.supportView?.rows || pState.data.support).filter(s =>
    s.subject?.toLowerCase().includes(pState.filter.toLowerCase()) ||
    s.client_name?.toLowerCase().includes(pState.filter.toLowerCase())
  );

  return `
    ${tit("Support Tickets", "Problem reports submitted by clients.", "")}
    <div class="toolbar">
      <label class="field"><span>Search this page</span><input class="search" data-p-filter placeholder="Subject or client"
        value="${esc(pState.filter)}" style="min-width:260px"></label>
    </div>
    <div style="display:grid;gap:12px">
      ${tickets.length ? tickets.map(t => {
        const client = pState.data.clients.find(c => c.id === t.client_id);
        let shopLink='';
        try {const url=new URL(client?.shop_url);if(['https:','http:'].includes(url.protocol) && !url.username && !url.password)shopLink=` · <a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary)">${esc(client.shop_url)}</a>`;} catch {/* Invalid/non-web links remain plain text. */}
        return `
          <div class="card" style="display:grid;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
              <div>
                <strong style="font-size:16px">${esc(t.subject || "No subject")}</strong>
                <div class="muted" style="font-size:13px;margin-top:2px">
                  ${esc(t.client_name || "Unknown client")} · ${t.verified ? "Verified Shop session" : "Legacy / Identity Not Verified"}
                  ${client ? `· ${esc(client.plan)}${shopLink}` : ""}
                  · ${new Date(t.created_at).toLocaleString()}
                </div>
              </div>
              <span class="badge ${t.status === "Open" ? "warn" : "good"}">${esc(t.status)}</span>
            </div>
            <div class="muted">Category: ${esc(t.category||'Unspecified')}${t.verified ? ' · '+esc(t.project_ref)+' · '+esc(t.requester_role) : ''}</div>
            <div style="background:var(--surface-2);padding:12px;border-radius:8px;
                        font-size:14px;line-height:1.6;white-space:pre-wrap">
              ${esc(t.message || "—")}
            </div>
            ${t.resolution ? '<div style="white-space:pre-wrap">Resolution: '+esc(t.resolution)+'</div>' : ''}
            ${(t.history||[]).map(e=>'<div class="muted">'+esc(e.action)+' · '+esc(new Date(e.created_at).toLocaleString())+'</div>').join('')}
            ${t.status === "Open" ? `
              <label class="field"><span>Customer-visible resolution (optional)</span><textarea id="support-resolution-${esc(t.id)}" maxlength="4000" rows="3"></textarea></label>
              <div style="display:flex;justify-content:flex-end">
                <button class="primary-button" data-p-action="resolve-ticket" data-p-id="${esc(t.id)}">
                  Mark Resolved
                </button>
              </div>` : ""}
          </div>`;
      }).join("") : `<div class="empty">No support tickets.</div>`}
    </div>
    <div class="toolbar" style="margin-top:16px">
      <button data-p-action="support-page" data-offset="${Math.max(0,(pState.supportView?.offset||0)-50)}" ${!(pState.supportView?.offset)?'disabled':''}>Previous</button>
      <span>Page ${Math.floor((pState.supportView?.offset||0)/50)+1}</span>
      <button data-p-action="support-page" data-offset="${(pState.supportView?.offset||0)+50}" ${!pState.supportView?.has_more||(pState.supportView?.offset||0)>=5000?'disabled':''}>Next</button>
      <button data-p-action="support-page" data-offset="${pState.supportView?.offset||0}">Refresh</button>
    </div>`;
}
