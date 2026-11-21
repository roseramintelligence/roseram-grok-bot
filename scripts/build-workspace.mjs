import {build} from 'esbuild';
import path from 'node:path';
const root=path.resolve('application-src'),entry=path.join(root,'clients/developer/workspace-standalone.jsx');
const plugin={name:'workspace-adapters',setup(b){
b.onResolve({filter:/^(next\/link|next\/image)$/},a=>({path:a.path,namespace:'adapter'}));
b.onLoad({filter:/.*/,namespace:'adapter'},a=>({contents:'export { '+(a.path==='next/link'?'Link':'Image')+' as default } from '+JSON.stringify(entry)+';',loader:'js',resolveDir:root}));
b.onResolve({filter:/^(\.\/AuthProvider|\.\/BillingProvider|\.\/FloatingAuthModal|@\/lib\/workspace-generation-client\.mjs)$/},()=>({path:entry}));
b.onResolve({filter:/^@\/lib\/workspace-context\.mjs$/},()=>({path:'context',namespace:'context'}));
b.onLoad({filter:/.*/,namespace:'context'},()=>({contents:'import {selectWorkspaceContext as select} from '+JSON.stringify(path.join(root,'lib/workspace-context.mjs'))+';export const selectWorkspaceContext=(p,l,c,o)=>select(p,l,c,{...o,maxFiles:12,maxCharacters:48000});',loader:'js',resolveDir:root}));
b.onResolve({filter:/^@\//},a=>({path:path.join(root,a.path.slice(2))}));
}};
await build({entryPoints:[entry],outfile:'web/application/workspace.js',bundle:true,format:'iife',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},plugins:[plugin]});
console.log('Built the application from its public React source.');
