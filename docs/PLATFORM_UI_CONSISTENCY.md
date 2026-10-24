# Platform UI consistency — 2026-10-24

Use the supplied RetraSell assets, Inter weights and `retrasell-tokens.css` unchanged.
The navy sidebar, palette, light/dark surfaces, 8px controls and 16px cards remain
the design reference. `ui-consistency.css` adds scoped operational primitives,
loaded by the existing main entry after the base stylesheet.

- Use existing primary/secondary/danger button classes. Keep destructive actions
  separate from normal Manage actions; preserve their event and authorization gates.
- Wrap inputs/selects/textareas in `.field`, related controls in `.form-grid`,
  full-width fields in `.field-wide`, and checkboxes in `.check-field`.
- Use `.action-group`, `.pagination`, `.section-heading` and `.summary-grid` for
  dynamic screens. Keep genuine wide tables in `.table-wrap`; do not hide page
  overflow to conceal broken layouts.
- `ui-primitives.js` owns the original inline copy SVG, accessible compact control,
  complete escaped underlying value, responsive metadata rows and expandable JSON.
  Copy feedback retains the icon, uses the Clipboard API and handles denial.
- Put hashes, original request IDs, binding/source identities, raw checkpoints and
  provider observations in explicit Advanced Details. Never abbreviate an approval
  confirmation or copy only the displayed summary.

`upgrade-view.js` is presentation only. It reads the original job and release catalog;
rendering makes no network call. The workflow remains lazy-loaded. Current release,
historical candidate, customer report, provider metadata, runtime readiness and
full installed-source verification are separate statements. Unknown is not failure;
paused and uncertain are distinct. Execution still requires the existing server
authorization, exact typed approval, conditions and checkpoints.

`upgrade-assessment.js` adds frontend feedback for incomplete/malformed/wrong-target,
unsupported/conflicting and stale reports before an Edge invocation. Existing v1
customer assessments contain no collection timestamp: explicit customer freshness
confirmation is required, and is not independent attestation. Optional timestamps
older than one day or expired evidence are refused. The server still recomputes the
plan and enforces source provenance and approval; browser validation grants nothing.

The handler now retains a separate in-memory pending request identity after an
uncertain response. It does not fabricate a server job before JSON parsing. Load
status before creating a review; retry or complete an incomplete review with its
original identity. Never automatically cancel, execute, clear recovery or replace
an existing job. Drafts survive ordinary theme/online rendering within the same
authorized client view and clear with the existing client/session guards.

An incomplete server review can legitimately remain if server reservation succeeds
and subsequent evidence collection fails. This frontend labels it Assessment
required and offers no approval/install/clearance without a valid plan. No backend
validation or authorization code changed in this milestone. Any future server
reservation-order improvement needs a separately reviewed implementation/rollout.

Verification is deliberately focused: three assessment tests, selected existing
UI/approval/loading/Support/financial cases, one isolated browser consistency script
and the existing small Support browser script. External evidence contains the
route matrix, before/after captures, exact unchanged live Managed review projection,
BYO findings and owner-only rollout instructions. No Shop source, immutable release,
migration, Edge Function, hosted job or production deployment is changed here.
