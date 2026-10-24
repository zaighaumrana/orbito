export class ManagedPause extends Error {needsSecret:boolean;constructor(needsSecret=false){super('Managed provisioning paused safely.');this.needsSecret=needsSecret;}}
export class InvocationBudget {
 readonly deadline:number; units=0;
 readonly now:()=>number;
 constructor(start=Date.now(),now=()=>Date.now()){this.deadline=start+85000;this.now=now;}
 beforeWork(name:string){
  if(this.deadline-this.now()<30000||this.units>=5||(['bridge-owner','preflight'].includes(name)&&this.units>0))throw new ManagedPause();
  this.units++;
 }
 async fetch(input:string|URL|Request,init:RequestInit={}){
  const remaining=this.deadline-this.now()-8000;
  if(remaining<=0)throw Error('Invocation budget exhausted; reconcile original operation.');
  return fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(Math.min(20000,remaining))])});
 }
}
export function ownedManagedClient(admin:any,request:string,token:string){
 const command=(kind:string,args:any={})=>admin.rpc('platform_managed_command',{p_request:request,p_token:token,p_kind:kind,p_args:args});
 const names:Record<string,string>={platform_managed_stage:'stage',platform_onboarding_step:'onboarding',platform_provision_step:'provision',platform_managed_release_pin:'pin'};
 return {from:(...args:any[])=>admin.from(...args),command,
  rpc:async(name:string,args:any={})=>{
   if(names[name])return command(names[name],args);
   const check=await command('check');if(check.error)return check;
   return admin.rpc(name,args);
  }};
}
