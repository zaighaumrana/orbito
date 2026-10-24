// Shared executable contract; kept byte-identical to Platform backend-plan.js.
export function installationPlan(release,mode){
 if(!['managed','byo'].includes(mode))throw Error('Explicit installer mode required');
 if(!release.requirements){
  // Historical immutable jobs retain their original package and installation set.
  return {migrations:release.migrations,coreFunctions:release.functions.filter(f=>f.name!=='support-tickets'),deferredFunctions:release.functions.filter(f=>f.name==='support-tickets')};
 }
 const r=release.requirements,p=r.installers?.[mode];
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const names=release.functions.map(f=>f.name).sort(),planned=[...p?.core_functions||[],...p?.deferred_functions||[]];
 if(r.contract!=='retrasell-backend-requirements-v1'||!p||!equal(p.migrations,release.migrations.map(m=>m.version))||!equal([...planned].sort(),names)||new Set(planned).size!==names.length||!equal([...p.requirements].sort(),r.requirements.map(x=>x.id).sort())||!equal([...p.configuration].sort(),['optional-support','pairing','runtime','turnstile']))throw Error('Incomplete approved installer requirements');
 return {migrations:release.migrations,coreFunctions:p.core_functions.map(n=>release.functions.find(f=>f.name===n)),deferredFunctions:p.deferred_functions.map(n=>release.functions.find(f=>f.name===n))};
}
