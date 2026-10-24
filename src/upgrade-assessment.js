const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function hasUpgradePlan(job) {
 const p=job?.plan;
 return !!(p&&p.contract==='retrasell-controlled-upgrade-v1'&&hash(job.plan_sha256)&&hash(job.source_sha256)&&hash(job.target_sha256)&&job.source_sha256!==job.target_sha256&&
  p.project_ref===job.project_ref&&p.client_id===job.client_id&&p.source_sha256===job.source_sha256&&p.target_sha256===job.target_sha256&&p.source_id===job.source_id&&p.client_binding===job.client_binding&&p.compatibility==='additive-protocol-1'&&Array.isArray(p.steps)&&p.steps.every(s=>s&&['migration','function'].includes(s.type)&&typeof s.name==='string'&&hash(s.sha256)));
}
// Shared presentation/dispatch gates. Server authorization is still decisive.
export function upgradeActionAllowed(action,job,mode) {
 const state=job?.state,valid=hasUpgradePlan(job);
 if(action==='upgrade-status')return true;
 if(action==='upgrade-review')return !valid&&(!job||['review','complete','completed_reviewed','cancelled'].includes(state));
 if(action==='upgrade-approve')return valid&&['review','paused'].includes(state)&&!job.unknown_step;
 if(action==='upgrade-execute'||action==='upgrade-download')return valid&&['approved','paused'].includes(state)&&!job.unknown_step&&job.mode===mode&&mode===(action==='upgrade-execute'?'managed':'byo');
 if(action==='upgrade-reconcile')return ['running','uncertain'].includes(state);
 if(action==='upgrade-close')return ['review','approved','verification_required'].includes(state);
 return false;
}
// UX validation only. The existing Edge/SQL gates remain authoritative.
export function validateAssessment(text,{client,catalog,source,job,binding,fresh,now=Date.now()}) {
 if(!text?.trim())throw Error('Ask the customer for their read-only assessment, then paste its JSON report. The assessment is empty.');
 if(new TextEncoder().encode(text).length>90000)throw Error('This assessment is too large. Import only the projected read-only report, without logs or credentials.');
 let r;try{r=JSON.parse(text);}catch{throw Error('The assessment is not valid JSON. Paste the complete report from its opening brace to its closing brace.');}
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Import a customer assessment object, not a list or text value.');
 if(r.contract!=='retrasell-byo-upgrade-assessment-v1')throw Error('Unsupported assessment version. Ask the customer to use the approved Shop upgrade tool.');
 const o=r.observation,p=r.plan,project=/^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(client.supabase_url||'')?.[1];
 if(!o?.shop||!Array.isArray(o.migrations)||!o.migrations.length||!Array.isArray(o.functions)||!o.functions.length||!p||!r.source_id||!r.client_binding)throw Error('The assessment is missing its Shop identity, migration history, functions or compatibility plan. Request the complete report.');
 if(o.migrations.some(m=>!m||typeof m.version!=='string'||typeof m.name!=='string'||!hash(m.sha256))||o.functions.some(f=>!f||typeof f.name!=='string'||typeof f.present!=='boolean'||typeof f.verify_jwt!=='boolean'))throw Error('The assessment contains incomplete migration or function evidence. Request the complete report.');
 if(r.client_id!==client.id||r.project_ref!==project||o.shop.client_id!==client.id||p.project_ref!==project||p.client_id!==client.id)throw Error('This assessment belongs to a different customer or Supabase project. Request a report for this client.');
 if(!binding?.source_id||!binding?.client_binding)throw Error('Load this client’s current pairing details before importing an assessment.');
 if(r.source_id!==binding.source_id||r.client_binding!==binding.client_binding||o.shop.source_id!==r.source_id||o.shop.client_binding!==r.client_binding||p.source_id!==r.source_id||p.client_binding!==r.client_binding)throw Error('The assessment uses an outdated or different pairing. Request a fresh report for the current client binding.');
 if(!catalog.some(c=>c.supported&&c.sha256===source)||r.source_sha256!==source||p.source_sha256!==source)throw Error('The historical source does not match this assessment. Select its supported source; a selection alone does not verify installation.');
 const target=catalog.find(c=>c.approved_for_new&&c.supported);
 if(!target||r.target_sha256!==target.sha256||p.target_sha256!==target.sha256||source===target.sha256)throw Error('The report has no supported distinct upgrade target. Obtain an assessment for the current approved target.');
 if(job&&!['complete','completed_reviewed','cancelled'].includes(job.state)&&((job.source_sha256&&job.source_sha256!==source)||(job.target_sha256&&job.target_sha256!==r.target_sha256)||(job.project_ref&&job.project_ref!==project)))throw Error('This assessment conflicts with the original upgrade review. Keep its request ID and reconcile the original source and target.');
 const stamp=r.generated_at||r.checked_at;
 if(stamp&&(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp))||Date.parse(stamp)>now+300000||now-Date.parse(stamp)>86400000))throw Error('This assessment is stale or has an invalid time. Ask the customer for a fresh read-only assessment.');
 if(r.expires_at&&(typeof r.expires_at!=='string'||!Number.isFinite(Date.parse(r.expires_at))||Date.parse(r.expires_at)<=now))throw Error('This assessment has expired. Ask the customer for a fresh read-only assessment.');
 if(!stamp&&!fresh)throw Error('This assessment format has no collection timestamp. Confirm with the customer that it was freshly generated for the unchanged Shop before continuing.');
 if(p.contract!=='retrasell-controlled-upgrade-v1'||p.compatibility!=='additive-protocol-1'||!Array.isArray(p.steps)||p.steps.some(s=>!s||!['migration','function'].includes(s.type)||typeof s.name!=='string'||!hash(s.sha256)))throw Error('The assessment lacks a supported compatible upgrade plan. Ask the customer to resolve the reported compatibility blockers.');
 if(o.shop.owner_ready!==true||o.shop.owner_busy!==false||Number(o.shop.invalid_config_receipts)!==0)throw Error('Customer owner setup or pending configuration needs reconciliation before an upgrade review.');
 // Forward only the existing projected contract, never arbitrary input fields.
 return {shop:Object.fromEntries(['client_id','source_id','client_binding','owner_ready','owner_busy','invalid_config_receipts'].map(k=>[k,o.shop[k]])),migrations:o.migrations.map(m=>({version:m.version,name:m.name,sha256:m.sha256})),functions:o.functions.map(f=>({name:f.name,present:f.present,verify_jwt:f.verify_jwt})),runtime_ready:o.runtime_ready};
}
