import { emailHookHandler } from "../supabase/functions/_shared/platform-team-v2.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

// Actual pinned signature verifier; provider/database transports are synthetic.
const key=btoa("synthetic-hook-key-32-bytes-long!!");
for(const [name,value] of Object.entries({SUPABASE_URL:"https://fixture.invalid",SUPABASE_ANON_KEY:"fixture-public",SUPABASE_SERVICE_ROLE_KEY:"fixture-service",PLATFORM_TEAM_SITE_URL:"https://platform.example.test",PLATFORM_AUTH_HOOK_SECRET:`v1,whsec_${key}`,PLATFORM_AUTH_EMAIL_FROM:"Fixture <mail@example.test>",PLATFORM_AUTH_RESEND_API_KEY:"fixture-mail"}))Deno.env.set(name,value);
const user={id:"96000000-0000-4000-8000-000000000001",email:"employee@example.test"};
function assert(value: unknown,message: string){if(!value)throw new Error(message);}
Deno.test("real signed hook permits Active recovery, suppresses Inactive/Archived, and rejects tampering/expired signature",async()=>{
 for(const [kind,valid,timestamp,expected] of [["active",true,new Date(),200],["inactive",true,new Date(),403],["archived",true,new Date(),403],["active",false,new Date(),403],["active",true,new Date(0),403]] as const){
  let sent=0;
  const factory:any=()=>({rpc:async()=>({data:{kind,auth_user_id:user.id,email:user.email}})});
  const transport:any=async()=>{sent++;return new Response("{}");};
  const body=JSON.stringify({user,email_data:{email_action_type:"recovery",token_hash:"synthetic-proof"}});
  const headers={"webhook-id":"synthetic-event","webhook-timestamp":String(Math.floor(timestamp.getTime()/1000)),"webhook-signature":new Webhook(key).sign("synthetic-event",timestamp,body)};
  const response=await emailHookHandler(factory,transport)(new Request("https://fixture.invalid/hook",{method:"POST",headers,body:valid?body:body+" "}));
  assert(response.status===expected,`${kind}: wrong hook response`);assert(sent===(expected===200?1:0),"Denied hook must not dispatch email");
  assert(!((await response.text()).includes("synthetic-proof")),"Hook response must not disclose recovery proof");
 }
});
Deno.test("secure email-change hashes map to current and new recipient; archived destination blocks all delivery",async()=>{
 for(const archived of [false,true]){
  let n=0;const deliveries:any[]=[];
  const factory:any=()=>({rpc:async()=>({data:{kind:++n===2 && archived?"archived":"active",auth_user_id:user.id,email:user.email}})});
  const transport:any=async(_url:string,options:any)=>{deliveries.push(JSON.parse(options.body));return new Response("{}");};
  const body=JSON.stringify({user:{...user,new_email:"new@example.test"},email_data:{email_action_type:"email_change",token_hash:"new-address-proof",token_hash_new:"old-address-proof"}});
  const time=new Date();const headers={"webhook-id":"synthetic-change","webhook-timestamp":String(Math.floor(time.getTime()/1000)),"webhook-signature":new Webhook(key).sign("synthetic-change",time,body)};
  const response=await emailHookHandler(factory,transport)(new Request("https://fixture.invalid/hook",{method:"POST",headers,body}));
  assert(response.status===(archived?403:200),"Wrong email-change decision");
  if(archived)assert(deliveries.length===0,"Archived address must not receive email");
  else {assert(deliveries[0].to[0]===user.email && deliveries[0].text.includes("old-address-proof"),"Current recipient mapping");assert(deliveries[1].to[0]==="new@example.test" && deliveries[1].text.includes("new-address-proof"),"New recipient mapping");}
 }
});
