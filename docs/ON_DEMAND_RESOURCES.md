# Route-owned Platform resources — 2026-10-23

Bootstrap verifies Auth/identity and minimal configuration, then loads the requested
route only. The compatibility name `loadPlatform` now performs one authorized
`platform_route_resource` call, replacing the eleven-dataset aggregate. Periodic,
focus and mutation authorization remain; permission decisions are never cached.

| Resource | Data loaded |
| --- | --- |
| Overview | Global counts/currency-separated balances; current client page and necessary usage/status summaries |
| Clients | 50 projected cards; server search and current/historical/all selection |
| Client detail | Exact authorized client then four existing status/operations RPCs; navigation and refresh are read-only |
| Client finance | Explicit 25-invoice history page and those invoices' payment sums |
| Billing | 50 clients, usage estimates/latest-invoice status, latest 25 invoice summaries and their payment sums |
| Invoice | Exact invoice, complete payments/receipt usage before preview, print or payment |
| Usage | Explicit per-client 100-entry page |
| Team | Master-only 100-row directory/archive pages, server search, bounded operation history |
| Support | Existing independent revision-aware page; resolution refreshes page/count only |
| Settings | Verified operator identity and minimal shared configuration |

Canonical roles/live sessions and existing safe projections govern every read.
Manager historical access and Billing client-detail/Support/Team remain denied.
Overview balances are authoritative global SQL aggregates; Billing counts/estimates
are explicitly page-scoped. Latest-per-client invoice status is separate from the
25 historical rows, so pagination cannot pretend another client's invoice is absent.

Responses capture authority generation, Auth user, session, role, view and selected
client generation. Route/history/usage counters reject out-of-order pages. Logout
and role edits clear sensitive state and invalidate pending reads. Resource errors
render a retry state while retaining verified login. Departed responses cannot
start follow-up client reads or provider writes. No financial/cross-session cache
was introduced; revisiting a route reads it again. Mutations refresh their affected
current resource instead of unrelated ledgers.

Controlled actual-loader comparison against Platform `a64582c7`: 13→1 requests,
400817→5947 response JSON bytes, 52.85→13.45ms with 8ms mocked upstream delay.
Fixture: 120 clients, 600 entries per ledger. This measures orchestration/unused
transfer, not hosted latency. Common Auth/config bootstrap is outside this route
comparison. Exact client refresh remains five requests; Support resolution three.

Remaining costs: global Overview aggregates/existing usage-summary computation,
four client status RPCs, offset pagination and periodic/focus session checks.
Explicit invoice receipt details can be large. No evidence justified new indexes,
materialized views or caches. Hosted Warp timeout-manager messages do not identify
a slow SQL statement; [upstream explains the misleading log](https://github.com/PostgREST/postgrest/issues/4799).
The new Platform migration must precede frontend use; this is not frontend-only rollout.
