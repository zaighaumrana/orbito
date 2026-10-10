import { notify } from './dialogs.js';
// Development-only, read-only preview of production renderers. Not part of index.html/build.
import './styles.css';
import { pState } from './state.js';
import { pageClients, pageClientDetail } from './pages/clients.js';
import { pageBilling } from './pages/billing.js';
import { pageOverview } from './pages/overview.js';
const clients = [
 {id:1,name:'Demo Shop · Karachi',industry:'Retail / repairs',plan:'Pro',status:'Active',currency:'PKR',currency_symbol:'PKR',event_rate:8,inventory_rate:0.54,inventory_billable:true},
 {id:2,name:'Demo Shop · International',industry:'Retail / repairs',plan:'Pro',status:'Active',currency:'USD',currency_symbol:'USD',event_rate:0.15,inventory_rate:0.03,inventory_billable:true},
].map(c=>({...c,billing_policy:'usage-v1',repair_module_enabled:true,inventory_module_enabled:true,technician_module_enabled:true,live_tracking_enabled:true,ems_enabled:false,paper_resupply_enabled:false,config_synced_at:new Date().toISOString()}));
pState.currentUser={role:'master_admin',username:'Preview'};
Object.assign(pState.data,{clients,support:[],usage:[],rateLog:[],credits:[],platformUsers:[],
 usageSummary:clients.map(c=>({client_id:c.id,billCount:24,billTotal:24*c.event_rate,inventoryCount:4,inventoryTotal:4*c.inventory_rate,todayTotal:2*c.event_rate,grandTotal:24*c.event_rate+4*c.inventory_rate})),
 invoices:clients.map(c=>({id:c.id,client_id:c.id,period_start:'2026-09-01',period_end:'2026-09-25',bill_count:50,inventory_count:10,event_rate:c.event_rate,inventory_rate:c.inventory_rate,total_due:50*c.event_rate+10*c.inventory_rate,payment_status:'Partial',status:'Partial'})),
 payments:clients.map(c=>({id:c.id,invoice_id:c.id,client_id:c.id,amount:20*c.event_rate}))});
function selectClient(id){
 const c=clients.find(c=>c.id===id); pState.selectedClient=c;
 const inv=pState.data.invoices.find(i=>i.client_id===id);
 pState.clientData={config:c,operations:{
  source:{source_id:'demo-source',enabled:true,last_received_at:new Date().toISOString(),usage_from_sequence:100},
  projection:{sync_version:18,updated_at:new Date().toISOString(),payload:{currency:c.currency,outstanding_total:inv.total_due-20*c.event_rate,estimate_through:183,billed_through:150,settled_through:99}},
  thermal:{estimated_mm:12600,reprint_mm:1600,events:46,unavailable:2},supplied_mm:120000,
  thermal_periods:[{month:'2026-09-01',document_type:'retail_receipt',paper_width_mm:80,events:36,estimated_mm:9800,reprint_mm:1300,unavailable:1},{month:'2026-09-01',document_type:'repair_invoice',paper_width_mm:80,events:10,estimated_mm:2800,reprint_mm:300,unavailable:1}],
  requests:[{request_id:'demo-request-1',requested_at:'2026-09-25',status:'requested',sync_version:1}],
  supplies:[{reference:'DEMO-DELIVERY-01',roll_count:4,usable_length_mm:30000,paper_width_mm:80,delivered_at:'2026-09-01'}],failures:[],config_jobs:[]}};
}
let page='detail'; selectClient(1);
function show(){
 const content=page==='clients'?pageClients():page==='billing'?pageBilling():page==='overview'?pageOverview():pageClientDetail();
 document.getElementById('preview-root').innerHTML=`<div style="max-width:1400px;margin:auto;padding:24px"><div class="card" style="border:2px solid var(--primary);margin-bottom:20px"><strong>Local preview · sample data · read only</strong><p>This uses the actual Platform screens. Financial/database operations were tested locally; hosted integration requires deployment. No remote writes occur here.</p><nav style="display:flex;gap:8px"><button data-preview="overview">Overview</button><button data-preview="clients">Clients</button><button data-preview="billing">Billing</button><button data-preview="detail">Client Detail</button></nav></div>${content}</div>`;
 document.querySelectorAll('form input,form select,form button').forEach(el=>el.disabled=true);
}
document.addEventListener('click',e=>{
 const button=e.target.closest('button,a'); if(!button)return;
 if(button.dataset.preview){page=button.dataset.preview;show();return;}
 if(button.dataset.pAction==='open-client'){selectClient(Number(button.dataset.pId));page='detail';show();return;}
 if(button.dataset.pPage==='clients'){page='clients';show();return;}
 e.preventDefault();notify.info('Read-only sample preview. This action becomes available against the deployed Platform backend.');
});
show();
