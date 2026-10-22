# Managed setup execution window — 2026-10-23

## Confirmed cause and current boundary

Read-only development logs independently show one platform-provision response with
HTTP 546 and execution_time_ms=150840. Current stage records show project-access at
20:26:36Z, migrations passed at 20:28:31Z and six functions passed at 20:28:53Z
(2026-10-22). The first invocation had almost exhausted its wall-clock budget before
owner setup. Later same-request recovery completed bridge-owner and preflight at
20:46:39Z/20:46:41Z. These are checkpoint timestamps, not per-query database timings.

`managed-setup.ts` sequentially performs every missing migration, server/Turnstile
setup, function deployments, bridge-owner and preflight in one request. Each
management request has its own 30-second timeout, but there is no total invocation
deadline. Parent checkpoints do not yield execution. Owner bootstrap includes
additional bridge calls/projection/status reads. Shortening individual timeouts or
parallelizing migrations would not safely bound this chain.

[Supabase's wall-clock guidance](https://supabase.com/docs/guides/troubleshooting/edge-function-wall-clock-time-limit-reached-Nk38bW)
confirms the 150-second Free-plan limit and the 546 symptom. Existing setup pins
the exact release/request, checks migration provenance and retains passed stages.
`platform_provision_begin` rejects competing running work. Interrupted recovery
waits ten minutes; it must not be shortened to race an active provisioner.

## Bounded continuation implementation plan

This frontend correction deliberately leaves the orchestrator unchanged. A proper
change crosses trusted SQL job ownership, Edge execution and the continuation UI:

1. Add a forward Platform migration with an explicit paused state/operation and
   invocation ownership token. Only the active invocation may finish or pause its
   job atomically. The existing failure operation is unsuitable for a normal pause:
   it records failure and clears verified connection health. Never mark a pause
   complete or release ownership while a provider write is outstanding.
2. Set an absolute invocation deadline with headroom below 150 seconds. Bound all
   provider requests, response bodies and internal RPCs by remaining time. Execute
   a bounded number of migration/function work units and yield only after a durable
   passed checkpoint and no in-flight write. Owner-bootstrap and preflight need
   their own independently bounded invocations; they cannot simply be appended
   after a nearly exhausted installation call.
3. Return a structured pending response with the original immutable request ID.
   The UI issues one serial continuation after verified paused status, rechecking
   current operator/view ownership. Never create another UUID or run overlapping
   continuations. Keep manual same-request recovery for a disconnected operator.
4. Preserve original release pins, exact SQL hashes, owner reservation, Vault values
   and uncertain-write fences. A timeout after SQL commit requires ledger read-back;
   a provider function/secret outcome needs authoritative reconciliation before
   replay. No self-invocation loop or unowned background promise.
5. Test deadline-boundary yields, interrupted acknowledgments, simultaneous resume,
   stale ownership tokens, no repeated passed stages, unknown remote outcomes and
   owner/preflight completion using a small focused fixture. Separately authorize
   the forward SQL and platform-provision rollout before a fresh hosted acceptance.

All this can preserve Shop support-v4 and its fingerprint: the changes belong to
the Platform orchestrator, not its immutable Shop package. The current timeout risk
remains open; successful manual recovery is not proof the risk is fixed.
