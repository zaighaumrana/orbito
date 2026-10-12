import { pState } from "../state.js";
import { tit } from "../helpers.js";
import { esc } from '../operations.js';

export function pageSupport() {
  const tickets = pState.data.support.filter(s =>
    s.subject?.toLowerCase().includes(pState.filter.toLowerCase()) ||
    s.client_name?.toLowerCase().includes(pState.filter.toLowerCase())
  );

  return `
    ${tit("Support Tickets", "Problem reports submitted by clients.", "")}
    <div class="toolbar">
      <input class="search" data-p-filter placeholder="Search tickets…"
        value="${esc(pState.filter)}" style="min-width:260px">
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
                  ${esc(t.client_name || "Unknown client")}
                  ${client ? `· ${esc(client.plan)}${shopLink}` : ""}
                  · ${new Date(t.created_at).toLocaleString()}
                </div>
              </div>
              <span class="badge ${t.status === "Open" ? "warn" : "good"}">${esc(t.status)}</span>
            </div>
            <div style="background:var(--surface-2);padding:12px;border-radius:8px;
                        font-size:14px;line-height:1.6;white-space:pre-wrap">
              ${esc(t.message || "—")}
            </div>
            ${t.status === "Open" ? `
              <div style="display:flex;justify-content:flex-end">
                <button class="primary-button" data-p-action="resolve-ticket" data-p-id="${esc(t.id)}">
                  Mark Resolved
                </button>
              </div>` : ""}
          </div>`;
      }).join("") : `<div class="empty">No support tickets.</div>`}
    </div>`;
}
