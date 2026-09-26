// Run only against a disposable database initialized from the two Platform migrations.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const db = process.env.PLATFORM_TEST_DB;
if (!db?.endsWith('_check')) throw new Error('PLATFORM_TEST_DB must name a disposable *_check database');
const executable = process.env.PSQL || 'psql';
function sql(query, onData) {
  return new Promise((resolve,reject) => {
    const p = spawn(executable, ['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-d',db]);
    let output='', error='';
    p.stdout.on('data', b=>{ output+=b; onData?.(String(b)); });
    p.stderr.on('data', b=>error+=b); p.on('error',reject);
    p.on('close',code=>code===0?resolve(output.trim()):reject(new Error(error)));
    p.stdin.end(query);
  });
}
await sql(`insert into auth.users values ('00000000-0000-4000-8000-000000009101','platformadmin@retailos.internal');
insert into public.clients(id,name,supabase_url,supabase_anon,currency,billing_policy,event_rate) values(9101,'Concurrency fixture','https://example.invalid','public','PKR','usage-v1',5);
insert into public.bridge_sources(source_id,client_id,client_binding,enabled,usage_from_sequence,cutover_note) values('10000000-0000-4000-8000-000000009101',9101,'race',true,1,'test');
insert into platform_private.source_credentials values('10000000-0000-4000-8000-000000009101',repeat('c',64));`);
const envelope = seq => JSON.stringify({schema_version:1,source_id:'10000000-0000-4000-8000-000000009101',client_binding:'race',events:[{
  schema_version:1,source_id:'10000000-0000-4000-8000-000000009101',event_id:`20000000-0000-4000-8000-00000000910${seq}`,
  source_sequence:seq,kind:'usage',operation:'create_retail_sale',operation_id:`30000000-0000-4000-8000-00000000910${seq}`,
  occurred_at:'2026-09-25T00:00:00Z',body:{metric:'BILL',quantity:1,unit:'event'}
}]});
await sql(`select public.platform_ingest(repeat('c',64),'${envelope(1)}');`);
let signal; const locked = new Promise(resolve=>signal=resolve);
const first = sql(`begin;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009101',true);
set local role authenticated;
select (public.platform_generate_invoice(9101,'40000000-0000-4000-8000-000000009101')).id;
\n\\echo INVOICE_FROZEN
select pg_sleep(1); commit;`, chunk=>{ if(chunk.includes('INVOICE_FROZEN')) signal(); });
await Promise.race([locked,first.then(()=>{throw new Error('Missing lock checkpoint');})]);
const second = sql(`select public.platform_ingest(repeat('c',64),'${envelope(2)}');`);
await Promise.all([first,second]);
const outcome = await sql(`select jsonb_build_object('total',i.total_due,'members',(select count(*) from usage_logs where billing_cycle_id=i.id),
'unbilled',(select count(*) from usage_logs where client_id=9101 and not is_invoiced)) from billing_cycles i where client_id=9101;`);
assert.deepEqual(JSON.parse(outcome),{total:5,members:1,unbilled:1});
console.log('PASS: usage arriving during invoice commit stays uninvoiced; exact membership retained.');
