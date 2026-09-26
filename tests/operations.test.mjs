import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../src/operations.js', import.meta.url),'utf8')).replace("import { pb } from './supabase.js';",'const pb = {};');
const {retryOperation} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const storage = new Map();
globalThis.localStorage = { getItem:k=>storage.get(k) || null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) };
test('lost response retains identity; concurrent retry runs once; successful retry clears identity',async()=>{
 let id, calls=0;
 const send = async request=>{calls++;id=request;throw new Error('Network timeout');};
 const first=retryOperation('payment:1',{amount:10},send);
 const second=retryOperation('payment:1',{amount:10},send);
 assert.equal(first,second); await assert.rejects(first); assert.equal(calls,1);
 await assert.rejects(retryOperation('payment:1',{amount:11},()=>assert.fail()),/original values/);
 await retryOperation('payment:1',{amount:10},request=>{assert.equal(request,id);return 'accepted';});
 assert.equal(storage.size,0);
});
test('confirmed database rejection permits corrected input',async()=>{
 await assert.rejects(retryOperation('payment:2',{amount:100},()=>{throw Object.assign(new Error('exceeds outstanding'),{definiteFailure:true});}));
 assert.equal(storage.size,0);
 await retryOperation('payment:2',{amount:10},()=>true);
});
