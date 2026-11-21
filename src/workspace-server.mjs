import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { validateWorkspaceFiles } from './workspace-core.mjs';
const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web/application');
const BASE_URL='https://roseram.com/api/v1/chat/completions';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
if(import.meta.url===pathToFileURL(process.argv[1]||'').href && process.argv.includes('--help')){console.log('Run npm start and open the printed loopback URL. Edit files locally without signing in; connect a Roseram developer key for model requests.');process.exit(0);}
export function createWorkspaceServer({root=defaultRoot,fetchImpl=globalThis.fetch,apiKey=process.env.ROSERAM_API_KEY}={}) {
const server=createServer(async(req,res)=>{
 const origin='http://127.0.0.1:'+server.address().port;
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return;}
 if(req.method==='GET'){
  const files={'/':'index.html','/workspace.js':'workspace.js','/workspace.css':'workspace.css','/app-icons/roseram-192.png':'icon.png'};
  const file=files[req.url];if(!file){res.writeHead(404).end();return;}
  try{res.writeHead(200,{'Content-Type':types[path.extname(file)],'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src about: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}).end(await readFile(path.join(root,file)));}catch{res.writeHead(500).end('Build the application assets before starting.');}return;
 }
 if(req.method!=='POST'||req.url!=='/api/generate'){res.writeHead(404).end();return;}
 if(req.headers.origin!==origin||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return;}
 res.setHeader('Content-Type','application/json');const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
 try{
  let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>200000)throw Object.assign(Error('Shorten the request or selected project context.'),{status:413});chunks.push(chunk);}
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));const key=apiKey||input.token;
  if(!/^rr_live_[A-Za-z0-9_-]+$/.test(key||''))throw Object.assign(Error('Connect a valid Roseram developer key.'),{status:401});
  if(typeof input.userPrompt!=='string'||!input.userPrompt.trim()||input.userPrompt.length>14000)throw Error('Enter a request under 8,000 characters.');
  const files=validateWorkspaceFiles(input.fileContents||{});const build=input.interactionMode==='build';
  const system=build?'Implement the requested change using the supplied files. Return ONLY JSON with this shape: {"response":"explanation and verification steps","files":[{"path":"relative/path","content":"complete updated file contents"}]}. Never claim to execute tests. Do not delete files.':'Answer the request using the supplied context. Never claim to execute commands or access tools that are not available.';
  const history=Array.isArray(input.conversationHistory)?input.conversationHistory.slice(-8).filter(m=>['user','assistant'].includes(m?.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,4000)})):[];
  const body=JSON.stringify({model:'roseram',messages:[{role:'system',content:system},...history,{role:'user',content:input.userPrompt+'\n\nProject source:\n'+Object.entries(files).map(([p,c])=>'FILE '+p+'\n'+c).join('\n\n')}],max_tokens:build?8192:4096});
  if(Buffer.byteLength(body)>96000)throw Error('The request context is too large. Use fewer or smaller files.');
  const response=await fetchImpl(BASE_URL,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(180000)]),redirect:'error'});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error?.message||'Roseram API returned HTTP '+response.status),{status:response.status});
  const text=data.choices?.[0]?.message?.content;if(typeof text!=='string'||!text.trim())throw Error('Roseram returned no response.');
  let generation={response:text,files:[]};if(build){try{generation=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw Error('The model did not return a valid file proposal. No files were changed.');}if(typeof generation.response!=='string'||!Array.isArray(generation.files))throw Error('The file proposal was incomplete. No files were changed.');}
  res.end(JSON.stringify({generation,metadata:{usage:data.usage||{}}}));
 }catch(error){if(!res.destroyed){res.statusCode=Number.isInteger(error.status)&&error.status>=400&&error.status<600?error.status:400;res.end(JSON.stringify({error:error.message||'The request failed.'}));}}
});
return server;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const server=createWorkspaceServer();server.listen(0,'127.0.0.1',()=>console.log('Roseram workspace: http://127.0.0.1:'+server.address().port));}
