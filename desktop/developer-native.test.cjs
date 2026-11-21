const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');const {createRequire}=require('node:module');
async function fixture(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'roseram-native-ipc-'));const project=path.join(temp,'project');await fs.mkdir(project);await fs.writeFile(path.join(project,'hello.js'),"console.log('native command verified');");
 const handlers=new Map();let selection={canceled:false,filePaths:[project]},response=0,approvals=0;
 const electron={ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},dialog:{showOpenDialog:async()=>selection,showMessageBox:async()=>{approvals++;return {response};}}};
 const filename=path.join(__dirname,'developer-native.cjs'),req=createRequire(filename),module={exports:{}};
 vm.runInNewContext('(function(require,module,exports,__dirname){'+await fs.readFile(filename,'utf8')+'\n})',{process,Buffer,URL,setTimeout,clearTimeout})(name=>name==='electron'?electron:req(name),module,module.exports,__dirname);
 const frame={url:'https://roseram.com/downloads/codex?run=1'},webContents={mainFrame:frame},window={webContents};
 module.exports.registerDeveloperNative({window:()=>window,appOrigin:'https://roseram.com',userData:temp});const event={sender:webContents,senderFrame:frame};
 return {temp,project,event,handlers,setResponse:value=>{response=value;},setSelection:value=>{selection=value;},approvals:()=>approvals,close:()=>fs.rm(temp,{recursive:true,force:true})};
}
test('native IPC rejects other frames, other origins and non-workspace pages',async()=>{
 const f=await fixture();try{
  const open=f.handlers.get('roseram:open-project');
  await assert.rejects(open({...f.event,senderFrame:{url:f.event.senderFrame.url}}),/Untrusted/);
  f.event.senderFrame.url='https://evil.invalid/downloads/codex?run=1';await assert.rejects(open(f.event),/only available/);
  f.event.senderFrame.url='https://roseram.com/account';await assert.rejects(open(f.event),/only available/);assert.equal(f.approvals(),0);
 }finally{await f.close();}
});
test('native save requires folder selection, explicit approval and matching on-disk content',async()=>{
 const f=await fixture();try{
  const save=f.handlers.get('roseram:save-project'),open=f.handlers.get('roseram:open-project');
  const before=await fs.readFile(path.join(f.project,'hello.js'),'utf8'),changes=[{path:'hello.js',before,content:'updated'}];
  await assert.rejects(save(f.event,{changes}),/Open a folder/);
  const selected=await open(f.event);assert.equal(selected.name,'project');assert.equal(selected.root,undefined);
  assert.equal(await save(f.event,{changes}),null);assert.equal(await fs.readFile(path.join(f.project,'hello.js'),'utf8'),before);
  f.setResponse(1);assert.equal((await save(f.event,{changes})).saved,1);assert.equal(await fs.readFile(path.join(f.project,'hello.js'),'utf8'),'updated');
  await assert.rejects(save(f.event,{changes}),/changed on disk/);assert.equal(f.approvals(),2);
 }finally{await f.close();}
});
test('native command cancellation does not execute; approved command returns real process output and exit status',async()=>{
 const f=await fixture();try{
  await f.handlers.get('roseram:open-project')(f.event);const run=f.handlers.get('roseram:run-project-command');
  const command='node hello.js';assert.equal(await run(f.event,{command}),null);
  f.setResponse(1);const result=await run(f.event,{command});assert.equal(result.code,0);assert.match(result.output,/native command verified/);assert.equal(result.timedOut,false);assert.equal(f.approvals(),2);
  await assert.rejects(run(f.event,{command:'node hello.js\nwhoami'}),/single command/);
 }finally{await f.close();}
});
