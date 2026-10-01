# Canonical plans and addons

`public.platform_plan_entitlements(plan, inventory, breaks)` is the authoritative mapping. The Platform client trigger stores its result as `desired_entitlements`; bootstrap uses that snapshot. Plan/Inventory changes use the same RPC and existing config jobs. Shop screens render stored managed values, not their own plan conditionals.

| Capability | Basic | Pro | Pro Plus |
| --- | --- | --- | --- |
| POS / Repair tickets | Included | Included | Included |
| Technician / Workshop | Off | On | On |
| Live Tracking | Off | On | On |
| Employee Management (EMS) | Off | Off | On |
| Inventory | Independent addon | Independent addon | Independent addon |
| Break Tracking | Off | Off | Separate selection, off by default |
| Printing & Thermal Tracking | Included | Included | Included |
| Paper Resupply | Independent option | Independent option | Independent option |

Canonical field names are `repair_module_enabled`, `inventory_module_enabled`, `technician_module_enabled`, `live_tracking_enabled`, `ems_enabled`, `ems_track_breaks`, and `paper_resupply_enabled`.

`technician_module_enabled` is canonical. `workshop_enabled` is legacy migration/backward-compatibility data and is not used for new entitlement decisions. Break tracking cannot remain enabled when EMS is disabled; Pro Plus does not automatically enable it.

Paper Resupply is the managed commercial option. Printing is not disabled by Paper Resupply. Thermal metering is not disabled by Paper Resupply. Printing has no new disabling entitlement, and THERMAL usage does not become a charge.

Inventory module selection is initially derived from the Inventory addon/billable choice. BILL, INVENTORY, repair invoice and payment/Udhar semantics remain unchanged. Existing Platform module controls remain available as explicit operator overrides; changing a plan reapplies the canonical mapping. The Shop owner has a read-only managed features panel and wizard summary.

Paper Resupply is authoritative in Platform billing projections. Shop configuration carries its bootstrap value before the first projection; `get_app_config` prefers the latest applied billing projection afterward. No Shop-owner settings endpoint permits entitlement changes.
