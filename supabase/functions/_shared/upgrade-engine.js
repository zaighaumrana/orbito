// Serial bounded executor. Shared verbatim with customer-controlled Shop tooling.
export async function executeUpgrade(job,release,adapter,{now=Date.now,budget=65000,maxSteps=2}={}){
 const started=now();let units=0;
 await adapter.command('check');
 await adapter.inspect();
 for(const step of job.plan.steps){
  if(job.steps?.[step.name]?.state==='passed')continue;
  if(units>=maxSteps||now()-started>budget-25000)return adapter.command('pause');
  // Persist dispatch BEFORE any provider write. An exception never clears this fence.
  await adapter.command('dispatch',{step:step.name});
  try{
   await adapter.inspect();
   const item=step.type==='migration'?release.migrations.find(m=>'migration:'+m.version===step.name):release.functions.find(f=>'function:'+f.name===step.name);
   if(!item||item.sha256!==step.sha256)throw Error('Approved immutable step missing.');
   const receipt=step.type==='migration'?await adapter.migrate(item):await adapter.deploy(item);
   const saved=await adapter.command('passed',{step:step.name,sha256:step.sha256,reference:receipt?.reference||'provider-acknowledged'});
   if(saved?.steps)job.steps=saved.steps;
   units++;
  }catch{
   try{await adapter.command('uncertain');}catch{}
   throw Error('Upgrade outcome uncertain. Retain the original request; authoritative reconciliation is required before another write.');
  }
 }
 return adapter.command('finish',{verification:await adapter.verify()});
}
