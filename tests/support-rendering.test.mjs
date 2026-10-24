import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('support text/attributes are escaped and external links allow only safe web URLs',()=>{
 const ctx={URL,pState:{filter:'',data:{clients:[{id:1,plan:'<img src=x onerror=alert(1)>',shop_url:'javascript:alert(1)'}],support:[{id:1,client_id:1,status:'Open',subject:'<img src=x onerror=alert(1)>',client_name:'<script>bad()</script>',message:'<svg onload=alert(1)>',created_at:'2026-10-12'}]}},tit:()=>''};
 ctx.pState.supportView={rows:ctx.pState.data.support,ready:true,offset:0};
 vm.createContext(ctx);vm.runInContext(read('src/operations.js').split('\n').find(line=>line.startsWith('export const esc')).replace('export ',''),ctx);
 vm.runInContext(read('src/pages/support.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);
 let html=ctx.pageSupport();assert.doesNotMatch(html,/<img|<svg|<script|href="javascript:/);assert.match(html,/&lt;img/);assert.match(html,/data-p-action="resolve-ticket"/);
 ctx.pState.filter='" autofocus onfocus="bad()';ctx.pState.data.support[0].subject=ctx.pState.filter;html=ctx.pageSupport();assert.doesNotMatch(html,/value="" autofocus/);assert.match(html,/&quot;/);
 ctx.pState.filter='';ctx.pState.data.clients[0].shop_url='https://synthetic.invalid/?q="<';html=ctx.pageSupport();assert.match(html,/rel="noopener noreferrer"/);assert.doesNotMatch(html,/<img|href="[^"\n]*"</);
});
