const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../frontend/app.js'),'utf8');
test('signed-out boot skips auth/me; token boot sends bearer auth',async()=>{
 for(const token of [null,'synthetic-test-token']){
  const calls=[];let boot;
  const app={appendChild(){}};
  const context={window:{addEventListener:(event,fn)=>{boot=fn;}},location:{hash:''},localStorage:{getItem:()=>token},document:{getElementById:()=>app,createElement:()=>({style:{}})},fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({user:{role:'employee'},redirect:'/app/chat'})};},console,AbortController,setTimeout,clearTimeout};
  vm.runInNewContext(source,context);await boot();assert.equal(calls.length,token?1:0);if(token)assert.equal(calls[0].opts.headers.Authorization,'Bearer '+token);
 }
});
