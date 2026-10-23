// Download the upgrade workflow only when an operator asks to open it.
let workflow;
export const loadUpgradeUI=async()=>workflow||=await import('./backend-upgrade.js');
export function upgradePanel(client,master){
 if(!master)return '';
 return workflow?workflow.upgradePanel(client,master):'<section class="card"><h3>Controlled backend upgrade</h3><p>Review source evidence, pending operations and explicit approval before any upgrade.</p><button class="secondary-button" data-p-action="upgrade-open">Open upgrade review</button></section>';
}
