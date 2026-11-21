const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {readProject,prepareWrites,commitWrites,confined}=require('./project-files.cjs');
test('native folder reads exclude secrets, binary files and links; writes reject stale baselines',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'roseram-project-test-'));const root=path.join(temp,'project');await fs.mkdir(root);const backups=path.join(temp,'backups');
 try{
  await fs.writeFile(path.join(root,'a.js'),'original');await fs.writeFile(path.join(root,'.env'),'PRIVATE=not-for-import');await fs.writeFile(path.join(root,'binary.bin'),Buffer.from([0,1,2]));
  const project=await readProject(root);assert.deepEqual(Object.keys(project.files),['a.js']);assert.equal(project.skipped,2);
  const outside=path.join(temp,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'hidden.js'),'outside');
  await fs.symlink(outside,path.join(root,'linked'),'junction');
  const linked=await readProject(root);assert(!Object.keys(linked.files).some(p=>p.startsWith('linked/')));await assert.rejects(confined(root,'linked/hidden.js'),/Symbolic links/);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('native writes are reviewed batches with backups, path confinement and no stale overwrites',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'roseram-write-test-'));const root=path.join(temp,'project');await fs.mkdir(root);const backups=path.join(temp,'backups');
 try{
  await fs.writeFile(path.join(root,'a.js'),'original');
  await assert.rejects(prepareWrites(root,[{path:'a.js',before:'stale',content:'new'}]),/changed on disk/);
  await assert.rejects(confined(root,'../outside'),/Unsupported/);
  await assert.rejects(prepareWrites(root,[{path:'.env',before:null,content:'x'}]),/Unsupported/);
  const result=await commitWrites(root,[{path:'a.js',before:'original',content:'edited'},{path:'src/new.js',before:null,content:'created'}],backups);
  assert.equal(result.saved,2);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'edited');assert.equal(await fs.readFile(path.join(root,'src/new.js'),'utf8'),'created');
  const [backup]=await fs.readdir(backups);const changes=JSON.parse(await fs.readFile(path.join(backups,backup,'changes.json'),'utf8'));assert.equal(changes[0].before,'original');
  await fs.writeFile(path.join(root,'a.js'),'external edit');
  await assert.rejects(commitWrites(root,[{path:'src/new.js',before:'created',content:'should not write'},{path:'a.js',before:'edited',content:'overwrite'}],backups),/changed on disk/);
  assert.equal(await fs.readFile(path.join(root,'src/new.js'),'utf8'),'created');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
