import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { createWorkspaceServer } from './workspace-server.mjs';
async function fixture(fetchImpl) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'roseram-web-test-'));await fs.writeFile(path.join(root,'index.html'),'<h1>Real workspace</h1>');
 const server=createWorkspaceServer({root,fetchImpl,apiKey:''});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 return {server,origin,close:async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}};
}
const input={token:'rr_live_test_only',userPrompt:'Fix the supplied function.',interactionMode:'build',fileContents:{'src/app.js':'original'},conversationHistory:[]};
test('standalone server enforces loopback host, origin, keys and private-file boundaries before inference',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;throw Error('Inference must not run.');});
 try {
  const page=await fetch(f.origin);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const cross=await fetch(f.origin+'/api/generate',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(cross.status,403);
  const missing=await fetch(f.origin+'/api/generate',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify({...input,token:''})});assert.equal(missing.status,401);
  const secret=await fetch(f.origin+'/api/generate',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify({...input,fileContents:{'.env':'never send'}})});assert.equal(secret.status,400);assert.equal(calls,0);
  const status=await new Promise((resolve,reject)=>{const r=http.get(f.origin,{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);});assert.equal(status,403);
 }finally{await f.close();}
});
test('real local HTTP model route forwards bounded context once and returns reviewable complete-file proposals',async()=>{
 let calls=0;const f=await fixture(async(url,options)=>{calls++;assert.equal(url,'https://roseram.com/api/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer rr_live_test_only');const request=JSON.parse(options.body);assert.equal(request.model,'roseram');assert.match(request.messages.at(-1).content,/FILE src\/app.js\noriginal/);return Response.json({choices:[{message:{content:JSON.stringify({response:'Prepared a fix; run npm test.',files:[{path:'src/app.js',content:'fixed'}]})}}],usage:{total_tokens:10}});});
 try{const response=await fetch(f.origin+'/api/generate',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(response.status,200);const data=await response.json();assert.equal(data.generation.files[0].content,'fixed');assert.equal(calls,1);}finally{await f.close();}
});
test('standalone route reports provider failures and malformed edit responses without replaying inference',async()=>{
 for(const result of [Response.json({error:{message:'Insufficient credits'}},{status:402}),Response.json({choices:[{message:{content:'I changed it already'}}]})]){
  let calls=0;const f=await fixture(async()=>{calls++;return result;});
  try{const response=await fetch(f.origin+'/api/generate',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify(input)});assert(response.status>=400);assert.match((await response.json()).error,/credits|valid file proposal/);assert.equal(calls,1);}finally{await f.close();}
 }
});
