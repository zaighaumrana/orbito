// Browser transport only. Production rendering, state, forms, events and guards
// remain actual modules. Every address/account is synthetic; no external I/O.
export function installPlatformFixture() {
  const query=new URL(location.href).searchParams;
  window.fixtureRole=query.get('fixtureRole') || 'master_admin';
  let signedIn=window.fixtureRole!=='anonymous' || localStorage.getItem('synthetic-login')==='true';
  if(window.fixtureRole==='anonymous' && signedIn)window.fixtureRole='master_admin';
  const id=n=>'97000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const actor=id(1),session=id(9),listeners=[];
  const identity=()=>({auth_user_id:actor,email:'master@example.test',username:'Fixture Master',role:window.fixtureRole,session_id:session,password_verification_safe:false});
  const user=()=>({id:actor,email:'master@example.test',email_confirmed_at:'2026-10-01'});
  const authSession=()=>({user:user()});
  window.fixtureWrites=[];window.fixtureRevoked=false;window.fixtureRecoveryError=null;
  window.fixtureUsers=[['Active','Active Employee'],['Pending','Pending Employee'],['Inactive','Inactive Employee'],['Pending','Failed Invitation']].map(([status,name],n)=>({id:id(n+2),auth_user_id:n===3?null:id(n+22),name,email:status.toLowerCase()+n+'@example.test',role:n%2?'portfolio_manager':'billing_person',status,suspended_from:status==='Inactive'?'Active':null,created_at:'2026-10-01'}));
  window.fixtureArchive=[{id:id(88),auth_user_id:id(89),name:'Archived Employee',email:'retired@example.test',role:'billing_person',joined_at:'2026-09-01',deleted_at:'2026-10-01',deleted_by:actor,operation_id:id(87),final_status:'Auth absence verified',reason:'Synthetic retirement'}];
  window.fixtureOperations=[{request_id:id(5),target_id:id(5),action:'create',stage:'review_required',clear_after:'2026-10-01'}];
  const clients=[{id:1,name:'Northstar Repairs',industry:'Mobile Repair Shop',plan:'Basic',currency:'PKR',currency_symbol:'Rs.',status:'Active',lifecycle_state:'Active',infrastructure_state:'present',onboarding_version:2,pairing_mode:'managed',owner_name:'Synthetic Owner',owner_email:'owner@example.test',shop_url:'https://shop.example.test',supabase_url:'https://abcdefghijklmnopqrst.supabase.co',billing_policy:'usage-v1',event_rate:5,inventory_rate:3,inventory_billable:false},
    {id:2,name:'Harbor Retail',industry:'Retail',plan:'Pro',currency:'USD',currency_symbol:'$',status:'Suspended',lifecycle_state:'Suspended',infrastructure_state:'present',onboarding_version:2,pairing_mode:'managed',shop_url:'https://second.example.test',billing_policy:'usage-v1',event_rate:1,inventory_rate:1}];
  const support=[{id:1,client_id:1,client_name:clients[0].name,subject:'Configuration question',message:'Synthetic support content',status:'Open',created_at:'2026-10-10'}];
  const invoices=[{id:71,client_id:1,period_start:'2026-10-01',period_end:'2026-10-14',created_at:'2026-10-14',total_due:123,bill_charge:123,payment_status:'Unpaid',status:'Unpaid'}];
  const datasets=()=>({clients,support,usage:[],invoices,rateLog:[],payments:[],credits:[],platformUsers:window.fixtureUsers,account:[{...user(),auth_user_id:actor,name:'Fixture Employee',role:window.fixtureRole,status:'Active'}]});
  const tableRows=table=>({clients,support_tickets:support,usage_logs:[],billing_cycles:invoices,pricing_rate_log:[],payments:[],client_credit:[],platform_users:window.fixtureUsers,platform_team_archive:window.fixtureArchive})[table] || [];
  const db=table=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:tableRows(table)}),single:async()=>({data:{id:1,admin_username:'Fixture Master'}}),update(){throw Error('Unexpected direct write');}};return q;};
  const notifyAuth=event=>listeners.forEach(fn=>fn(event,signedIn?authSession():null));
  window.fixtureSDK={from:db,auth:{onAuthStateChange:fn=>listeners.push(fn),getSession:async()=>({data:{session:signedIn?authSession():null}}),getUser:async()=>signedIn?{data:{user:user()}}:{error:{status:401}},
    signOut:async()=>{signedIn=false;localStorage.removeItem('synthetic-login');notifyAuth('SIGNED_OUT');return{};},signInWithPassword:async()=>{signedIn=true;localStorage.setItem('synthetic-login','true');window.fixtureRole='master_admin';notifyAuth('SIGNED_IN');return {data:{session:authSession(),user:user()}};},
    resetPasswordForEmail:async()=>({error:window.fixtureRecoveryError}),refreshSession:async()=>({data:{session:authSession()}})},
    rpc:async(name,args={})=>{
      if(name==='platform_route_resource'){
       let pageClients=clients.filter(c=>(!args.p_client||c.id===args.p_client)&&(!args.p_search||c.name.toLowerCase().includes(args.p_search.toLowerCase())));
       const resource=args.p_resource;
       const data=resource==='team'?{platformUsers:window.fixtureUsers,teamArchive:window.fixtureArchive,teamOperations:window.fixtureOperations}:resource==='settings'?{}:{clients:pageClients,invoices:[],payments:[],usage:[],usageSummary:[],openTickets:1,overview:{clients:clients.length,active:clients.length,suspended:0,provisioning:0,historical:0}};
       return {data:{...identity(),data:{...data,offset:args.p_offset||0,has_more:false}}};
      }
      const data=name==='platform_operator_identity'?identity():name==='platform_session_status'?{authorized:!window.fixtureRevoked,...identity()}:name==='platform_team_setup_context'?{kind:'active',auth_user_id:actor,session_id:session}:
        name==='platform_account_access_notice'?{auth_user_id:actor,inactive:false}:name==='platform_team_history'?{operations:window.fixtureOperations}:name==='platform_usage_summary'?[]:name==='platform_dashboard_summary'?{open_tickets:1}:
        name==='platform_read_page'?{...identity(),rows:args.p_offset?[]:datasets()[args.p_dataset]}:name==='platform_client_operations'?{client:args.p_client,requests:[],supplies:[],thermal:{},projection:{payload:{outstanding_total:123}}}:{};
      return {data};
    },functions:{invoke:async(name,{body}={})=>{
      window.fixtureWrites.push({name,body:body?Object.fromEntries(Object.entries(body).filter(([k])=>!['password','captchaToken'].includes(k))):null});const row=window.fixtureUsers.find(u=>u.id===body?.id);
      if(name==='platform-config')return{data:{config:{...clients.find(c=>c.id===body.client_id)}}};
      if(name==='delete-platform-user')return{data:{code:'deletion_disabled',review_required:false,current_attempt_rejected:true,operation_state:'none'},error:{}};
      if(name==='clear-failed-platform-invitation'){window.fixtureUsers=window.fixtureUsers.filter(u=>u!==row);window.fixtureOperations=window.fixtureOperations.filter(o=>o.request_id!==body.request_id);}
      if(name==='deactivate-platform-user'){row.suspended_from=row.status;row.status='Inactive';}
      if(name==='reactivate-platform-user'){row.status=row.suspended_from;row.suspended_from=null;}
      if(name==='update-platform-user')Object.assign(row,{name:body.name,email:body.email,role:body.role});
      if(name==='create-platform-user')window.fixtureUsers.push({id:body.request_id,auth_user_id:id(77),name:body.name,email:body.email,role:body.role,status:'Pending',created_at:'2026-10-15'});
      return {data:{success:true,operation_id:body?.request_id}};
    }}
  };
  window.fixtureClientFactory=(_url,_key,options)=>options?.auth?.storageKey==='platform-continuity-diagnostic'?{
    auth:{signInWithPassword:async()=>({data:{session:{},user:user()}}),signOut:async()=>({})},rpc:async()=>({data:{...identity(),session_id:id(99)}})
  }:window.fixtureSDK;
  // Explicit synthetic CAPTCHA. The real provider is blocked by the browser route.
  window.turnstile={render:(_container,options)=>{queueMicrotask(()=>options.callback('synthetic-captcha'));return 1;},remove(){},reset(){}};
}
