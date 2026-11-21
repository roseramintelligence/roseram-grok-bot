import test from 'node:test';
import assert from 'node:assert/strict';
import { workspacePath, validateWorkspaceFiles, restoreWorkspaces, newWorkspace, prepareWorkspaceChanges, workspaceStorageKey } from './workspace-core.mjs';
test('project paths exclude secrets, traversal, Windows aliases and case collisions', () => {
 for (const path of ['../a','/a','a\\b','a/../b','.env','.env.local','src/key.pem','node_modules/x.js','C:/x','src/CON.txt','src/a.','src/x:stream']) assert.equal(workspacePath(path),null,path);
 assert.equal(workspacePath('src/app.test.js'),'src/app.test.js');
 assert.throws(()=>validateWorkspaceFiles({'a.js':'x','A.js':'y'}),/unique/);
 assert.throws(()=>validateWorkspaceFiles({'a.js':'x\0y'}),/text/);
 assert.throws(()=>validateWorkspaceFiles({'a.js':'x'.repeat(500001)}),/500 KB/);
});
test('proposal application is atomic and refuses stale source, deletions and failed preflight', () => {
 const before={'src/a.js':'old'},generation={files:[{path:'src/a.js',content:'new'},{path:'src/b.js',content:'created'}]};
 assert.deepEqual(prepareWorkspaceChanges(generation,before,before).files,{'src/a.js':'new','src/b.js':'created'});
 assert.throws(()=>prepareWorkspaceChanges(generation,before,{'src/a.js':'manual edit'}),/changed after/);
 assert.deepEqual(before,{'src/a.js':'old'});
 assert.throws(()=>prepareWorkspaceChanges({files:[{path:'src/a.js',action:'delete',content:''}]},before,before),/deletion/);
 assert.throws(()=>prepareWorkspaceChanges({...generation,preflight:{passed:false}},before,before),/failed validation/);
 assert.throws(()=>prepareWorkspaceChanges({files:[{path:'../escape',content:'no'}]},before,before),/unsupported/);
});
test('project exports round-trip drafts and messages; owner scopes remain separate', () => {
 const p={...newWorkspace('A'),files:{'index.html':'<h1>Hello</h1>'},draft:'keep this draft',messages:[{role:'assistant',text:'response'}]};
 const [restored]=restoreWorkspaces(JSON.stringify([p]));assert.equal(restored.draft,p.draft);assert.deepEqual(restored.messages,p.messages);assert.equal(restored.files['index.html'],p.files['index.html']);
 assert.notEqual(workspaceStorageKey('code','owner-a'),workspaceStorageKey('code','owner-b'));assert.notEqual(workspaceStorageKey('code','guest'),workspaceStorageKey('chat','guest'));
 assert.deepEqual(restoreWorkspaces('{bad'),[]);assert.deepEqual(restoreWorkspaces(JSON.stringify([{files:{'../escape':'x'}}])),[]);
});
