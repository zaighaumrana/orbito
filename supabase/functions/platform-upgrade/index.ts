import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import {upgradeHandler} from './handler.ts';
Deno.serve(upgradeHandler((key:string)=>Deno.env.get(key),(authorization:string,fetcher:typeof fetch)=>({
 caller:createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false},global:{fetch:fetcher,headers:{Authorization:authorization}}}),
 admin:createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false},global:{fetch:fetcher}})
})));
