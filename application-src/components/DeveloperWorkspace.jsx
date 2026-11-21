'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { FloatingAuthModal } from './FloatingAuthModal';
import { requestWorkspaceGeneration, readPendingGeneration } from '@/lib/workspace-generation-client.mjs';
import { selectWorkspaceContext } from '@/lib/workspace-context.mjs';
import { newWorkspace, restoreWorkspaces, workspaceStorageKey, workspacePath, validateWorkspaceFiles, prepareWorkspaceChanges } from '@/lib/developer-workspace.mjs';
import styles from './DeveloperWorkspace.module.css';

const directions = {
  code: 'You are Roseram Codex. Implement the requested change using complete file contents. Ground changes in the supplied project. Explain verification steps. Never claim to run commands or tests.',
  review: 'You are Roseram Claude Code. Review supplied source for concrete defects. Cite file paths and line numbers, severity, impact and a proposed fix. When editing is requested return complete corrected files. Never invent test execution.',
  chat: 'You are Roseram Grok Bot. Answer clearly and accurately. Continue the conversation. Do not claim to browse or use tools that have not been supplied.',
  cursor: 'You are Roseram Cursor. Help edit the supplied project. Preserve unrelated changes and return complete file contents when an edit is requested. Explain how to verify it. Never claim to run commands or tests.',
};
function AppMark({ kind }) {
  const paths = {
    code: 'M9 6 3 12l6 6M15 6l6 6-6 6M14 4l-4 16',
    review: 'M12 2v20M2 12h20M5 5l14 14M5 19 19 5M8 3l8 18M3 8l18 8M3 16l18-8M8 21l8-18',
    chat: 'M6 18 18 6M7 6h11v11M4 10a9 9 0 0 0 10 10M10 4a9 9 0 0 1 10 10',
    cursor: 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m8-4.5L12 12l-8-4.5M12 12v9',
  };
  return <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={kind === 'review' ? '1.25' : '1.5'} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind] || paths.code}/></svg>;
}
const saveDownload = (name, content, type = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function DeveloperWorkspace({ app, embedded = false }) {
  const { session, loading } = useAuth();
  const owner = session?.user?.id || 'guest'; const identity = useRef(owner); identity.current = owner;
  const [projects, setProjects] = useState([]), [selected, setSelected] = useState(''), [ready, setReady] = useState(false), [loadedKey, setLoadedKey] = useState('');
  const [authMode, setAuthMode] = useState(null), [mode, setMode] = useState('chat'), [busy, setBusy] = useState(false), [phase, setPhase] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [search, setSearch] = useState(''), [panel, setPanel] = useState('editor');
  const [proposal, setProposal] = useState(null), [native, setNative] = useState(null), [nativeProject, setNativeProject] = useState(null), [terminal, setTerminal] = useState(''), [command, setCommand] = useState(''), [terminalBusy, setTerminalBusy] = useState(false);
  const [showEditor, setShowEditor] = useState(false), [sidebarOpen, setSidebarOpen] = useState(false);
  const [fileName, setFileName] = useState(''), [pending, setPending] = useState(null);
  const controller = useRef(null), running = useRef(false), fileInput = useRef(null), folderInput = useRef(null), importInput = useRef(null), editor = useRef(null), current = useRef(null), storageOwner = useRef(null);
  const project = projects.find(p => p.id === selected) || projects[0]; current.current = project;
  const key = workspaceStorageKey(app.id, owner); const isChat = app.id === 'chat';
  const projectId = project?.id;
  const paths = Object.keys(project?.files || {}).sort(); const active = project?.active && Object.hasOwn(project.files, project.active) ? project.active : paths[0] || '';
  const update = patch => setProjects(list => list.map(p => p.id === current.current?.id ? { ...p, ...patch, updatedAt: Date.now() } : p));
  useEffect(() => {
    controller.current?.abort(); controller.current = null; running.current = false; setBusy(false); setProposal(null); setPending(null); setNativeProject(null); setError(''); setNotice(''); setReady(false);
    let saved = []; try { saved = restoreWorkspaces(localStorage.getItem(key)); } catch { setNotice('Browser storage is unavailable. Export your project to keep a copy.'); }
    const guestDraft = storageOwner.current === 'guest' && owner !== 'guest' && current.current && (current.current.draft || current.current.messages.length || Object.keys(current.current.files).length) ? { ...current.current, id: crypto.randomUUID() } : null;
    if (guestDraft) saved = [guestDraft, ...saved].slice(0, 20);
    if (!saved.length) saved = [newWorkspace(isChat ? 'New conversation' : 'New project')];
    storageOwner.current = owner; setProjects(saved); setSelected(saved[0].id); setLoadedKey(key); setReady(true);
  }, [key, owner, isChat]);
  useEffect(() => {
    if (!ready || loadedKey !== key || storageOwner.current !== owner) return;
    const timer = setTimeout(() => { try { localStorage.setItem(key, JSON.stringify(projects)); } catch { setNotice('Your latest edits could not be saved in this browser. Export a copy.'); } }, 300);
    return () => clearTimeout(timer);
  }, [projects, key, owner, ready, loadedKey]);
  useEffect(() => { setNative(window.roseramDesktop?.openProject ? window.roseramDesktop : null); return () => controller.current?.abort(); }, []);
  useEffect(() => { if (!session?.user?.id || !projectId) return; setPending(readPendingGeneration(owner, 'developer-' + app.id + '-' + projectId)); }, [owner, app.id, projectId, session?.user?.id]);
  useEffect(() => { if (busy) document.getElementById('developer-messages')?.lastElementChild?.scrollIntoView({ block: 'nearest' }); }, [busy, project?.messages?.length]);
  function changeProject(id) { if (running.current || terminalBusy) return; setSelected(id); setSidebarOpen(false); setProjects(list => [...list.filter(p => p.id === id), ...list.filter(p => p.id !== id)]); setProposal(null); setNativeProject(null); setError(''); setPending(null); }
  function addProject() { if (running.current || terminalBusy) return; if (projects.length >= 20) { setError('Export a project before opening more than 20 workspaces.'); return; } const p = newWorkspace(isChat ? 'New conversation' : 'New project'); setProjects(list => [p, ...list]); setSelected(p.id); setProposal(null); setNativeProject(null); }
  async function importFiles(list, folder = false) {
    if (!project || running.current) return;
    const importOwner = owner, importId = project.id, originalFiles = { ...project.files };
    try {
      const files = {}; let skipped = 0;
      for (const file of Array.from(list)) {
        const raw = folder ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name;
        if (!workspacePath(raw) || file.size > 500000) { skipped++; continue; }
        const content = await file.text(); if (content.includes('\0')) { skipped++; continue; }
        files[raw] = content;
      }
      if (identity.current !== importOwner || current.current?.id !== importId) return;
      const checked = validateWorkspaceFiles({ ...originalFiles, ...files }); update({ files: checked, active: Object.keys(files)[0] || active }); setProposal(null); setShowEditor(true); setNotice(Object.keys(files).length + ' files opened.' + (skipped ? ' ' + skipped + ' binary, private or oversized files skipped.' : ''));
    } catch (e) { setError(e.message); }
  }
  async function openNative() {
    try { const result = await native.openProject(); if (!result) return; const p = newWorkspace(result.name); p.files = validateWorkspaceFiles(result.files); p.active = Object.keys(p.files)[0] || ''; setProjects(list => [p, ...list].slice(0, 20)); setSelected(p.id); setNativeProject({ id: p.id, baseline: { ...p.files } }); setProposal(null); setNotice(result.skipped ? result.skipped + ' private, binary or oversized files skipped.' : 'Folder opened. Writes require your approval.'); } catch (e) { setError(e.message); }
  }
  function addFile(event) { event.preventDefault(); const name = workspacePath(fileName.trim()); if (!name) { setError('Enter a relative text-file path, such as src/app.js.'); return; } if (Object.hasOwn(project.files, name)) { update({ active: name }); setFileName(''); return; } try { update({ files: validateWorkspaceFiles({ ...project.files, [name]: '' }), active: name }); setFileName(''); setError(''); } catch (e) { setError(e.message); } }
  async function run(resume = null) {
    const p = current.current; const prompt = p?.draft.trim(); if (!p || running.current || (!prompt && !resume)) return;
    if (!session?.access_token) { setAuthMode('login'); return; }
    if (pending && !resume) { setError('Check the tracked request before starting another request in this project.'); return; }
    const requestOwner = owner, id = p.id; const snapshot = { ...(resume && p.requestBaseline ? p.requestBaseline : p.files) }; const abort = new AbortController(); controller.current = abort; running.current = true; setBusy(true); setError(''); setNotice(''); setProposal(null);
    const messages = resume ? p.messages : [...p.messages, { role: 'user', text: prompt }].slice(-100);
    if (!resume) update({ messages, requestBaseline: snapshot });
    const safeUpdate = patch => { if (identity.current === requestOwner && !abort.signal.aborted) setProjects(list => list.map(item => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item)); };
    try {
      let result, requested = [], seen = new Set();
      for (let round = 0; round < 4; round++) {
        const context = selectWorkspaceContext(prompt || resume.prompt, paths, snapshot, { activeFilePath: active, requiredPaths: requested });
        result = await requestWorkspaceGeneration({ userPrompt: [directions[app.id] || directions.code, p.instructions, 'Current request:\n' + (prompt || resume.prompt)].filter(Boolean).join('\n\n'), fileList: context.fileList, fileContents: context.fileContents, activeFilePath: active, projectTarget: paths.length ? 'current' : 'new', interactionMode: isChat ? 'chat' : (resume?.interactionMode || mode), conversationHistory: p.messages.slice(-12).map(m => ({ role: m.role, content: m.text.slice(0, 12000) })), projectName: p.name }, { token: session.access_token, ownerId: owner, contextKey: 'developer-' + app.id + '-' + id, signal: abort.signal, resume: round === 0 ? resume : null, onProgress: job => { if (identity.current === requestOwner) setPhase(job.phase || job.status || 'working'); } });
        if (result.generation?.type !== 'context') break;
        requested = result.generation.contextRequest?.paths || [];
        if (!requested.length || requested.length > 6 || requested.some(path => !Object.hasOwn(snapshot, path) || seen.has(path)) || round === 3) throw Error('The requested source could not be loaded. Narrow the request or open the required files.');
        requested.forEach(path => seen.add(path));
      }
      abort.signal.throwIfAborted(); if (identity.current !== requestOwner) return;
      const generation = result.generation; if (!generation) throw Error('No response was returned.');
      if (generation.type === 'clarification') throw Error(generation.response || 'Add more detail to your request and try again.');
      const text = generation.response || (generation.files?.length ? 'Review the proposed file changes before applying them.' : 'No response text was returned.');
      safeUpdate({ messages: [...messages, { role: 'assistant', text }].slice(-100), draft: '', requestBaseline: null }); setPending(null);
      if (!isChat && (resume?.interactionMode || mode) === 'build' && generation.files?.length) {
        if (resume && !p.requestBaseline) throw Error('The response was recovered, but the original file baseline is unavailable. Request a new proposal before editing files.');
        const prepared = prepareWorkspaceChanges(generation, snapshot, current.current.files); setProposal({ ...prepared, baseline: snapshot, generation, projectId: id }); setPanel('changes'); setShowEditor(true);
      }
      window.dispatchEvent(new CustomEvent('roseram:usage-updated', { detail: result.metadata?.usage || {} }));
    } catch (e) { if (identity.current === requestOwner) { if (abort.signal.aborted) setNotice('Request stopped. Your draft and files are preserved.'); else { setError(e.message || 'The request failed.'); if (e.status === 402) setNotice('Open your account to review available usage.'); } setPending(readPendingGeneration(owner, 'developer-' + app.id + '-' + id)); } }
    finally { if (controller.current === abort) { controller.current = null; running.current = false; setBusy(false); setPhase(''); } }
  }
  async function applyProposal() {
    try { if (!proposal || proposal.projectId !== project.id) return; const prepared = prepareWorkspaceChanges(proposal.generation, proposal.baseline, project.files); update({ files: prepared.files, active: prepared.changes[0]?.path || active }); setProposal(null); setPanel('editor'); setNotice('Changes applied to your working copy. ' + (nativeProject ? 'Save to folder to write them to disk.' : 'Export the project to keep a separate copy.')); } catch (e) { setError(e.message); }
  }
  async function saveNative() {
    try { if (!nativeProject || nativeProject.id !== project.id) return; const changes = Object.entries(project.files).filter(([path, content]) => nativeProject.baseline[path] !== content).map(([path, content]) => ({ path, content, before: Object.hasOwn(nativeProject.baseline, path) ? nativeProject.baseline[path] : null })); if (!changes.length) { setNotice('No unsaved file changes.'); return; } const result = await native.saveProject({ changes }); if (result?.saved) { setNativeProject({ id: project.id, baseline: { ...project.files } }); setNotice(result.saved + ' files saved to your folder.'); } } catch (e) { setError(e.message); }
  }
  async function runCommand(event) { event.preventDefault(); if (!command.trim() || terminalBusy || !nativeProject) return; setTerminalBusy(true); setTerminal('Waiting for your command approval…'); try { const r = await native.runCommand({ command }); setTerminal(r ? r.output + '\nExit code: ' + r.code + (r.timedOut ? ' (time limit reached)' : '') : 'Command canceled.'); } catch (e) { setTerminal(e.message); } finally { setTerminalBusy(false); } }
  function exportProject() { saveDownload((project.name.replace(/[^a-z0-9_-]/gi, '-') || 'project') + '.roseram.json', JSON.stringify({ schemaVersion: 1, app: app.id, project }, null, 2), 'application/json'); }
  async function importProject(file) { if (!file || file.size > 20_000_000) { setError('Choose a Roseram project under 20 MB.'); return; } try { const data = JSON.parse(await file.text()); const restored = restoreWorkspaces(JSON.stringify([data.project])); if (!restored.length) throw Error('The project file is not valid.'); const p = { ...restored[0], id: crypto.randomUUID() }; setProjects(list => [p, ...list].slice(0, 20)); setSelected(p.id); setNativeProject(null); setProposal(null); } catch (e) { setError(e.message); } }
  if (!ready || loadedKey !== key || !project) return <div className={styles.workspace} role="status">Opening {app.name}…</div>;
  return <section className={styles.workspace} data-app={app.id} data-embedded={embedded || undefined} data-sidebar={sidebarOpen || undefined} aria-label={app.name + ' workspace'}>
    <div className={styles.body}>
      <aside className={styles.sidebar} aria-label={isChat ? 'Conversations' : 'Projects'}>
        <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true"><AppMark kind={app.id}/></span>{app.name}<button type="button" className={styles.closeSidebar} aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>×</button></div>
        <button className={styles.newButton} type="button" onClick={() => { addProject(); setSidebarOpen(false); setShowEditor(false); }} disabled={busy || terminalBusy}><span aria-hidden="true">＋</span>{isChat ? 'New conversation' : 'New task'}</button>
        <div className={styles.historyLabel}>Recents</div><div className={styles.projects}>{projects.map(p => <button type="button" key={p.id} aria-pressed={project.id === p.id} onClick={() => changeProject(p.id)} disabled={busy || terminalBusy}><span aria-hidden="true">◇</span>{p.name}</button>)}</div>
        <div className={styles.sidebarFooter}><details><summary>Project options <span aria-hidden="true">···</span></summary><div><button type="button" onClick={exportProject}>Export {isChat ? 'conversation' : 'project'}</button><button type="button" onClick={() => importInput.current.click()} disabled={busy}>Import project</button></div></details><div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{session?.user?.email?.[0]?.toUpperCase() || 'R'}</span>{loading ? <span>Connecting…</span> : session ? <Link href="/account" target="_blank" rel="noopener noreferrer">My account</Link> : <button type="button" onClick={() => setAuthMode('login')}>Sign in</button>}</div><span className={styles.localNote}>Stored on this device</span></div>
      </aside>
      <main className={styles.main} id="workspace"><div className={styles.toolbar}><div className={styles.projectTitle}><button type="button" className={styles.sidebarToggle} aria-label="Open sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button><input aria-label={isChat ? 'Conversation name' : 'Project name'} value={project.name} onChange={e => update({ name: e.target.value.slice(0, 80) })} /></div><div>{!isChat && <button type="button" aria-pressed={showEditor} onClick={() => setShowEditor(!showEditor)}>{showEditor ? 'Hide editor' : 'Editor'}</button>}<button type="button" disabled={busy} onClick={() => { if (native && !isChat) { openNative(); setShowEditor(true); } else if (isChat) fileInput.current.click(); else folderInput.current.click(); }}>{isChat ? 'Attach files' : 'Open project'}<span aria-hidden="true"> ↗</span></button>{nativeProject && <button type="button" disabled={busy} onClick={saveNative}>Save</button>}</div></div>
      {error && <div role="alert" className={styles.error}>{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}{notice && <div role="status" className={styles.notice}>{notice}</div>}
      {pending && !busy && <div className={styles.notice}>An earlier request is tracked.<button type="button" onClick={() => run(pending)}>Check saved request</button></div>}
      <div className={styles.panes} data-chat={isChat || !showEditor || undefined}>
      {!isChat && showEditor && <section className={styles.source} aria-label="Project editor"><div className={styles.editorToolbar}><button type="button" disabled={busy} onClick={() => fileInput.current.click()}>Open files</button><button type="button" aria-pressed={panel === 'editor'} onClick={() => setPanel('editor')}>Files ({paths.length})</button><button type="button" aria-pressed={panel === 'changes'} onClick={() => setPanel('changes')}>Changes{proposal ? ' (' + proposal.changes.length + ')' : ''}</button><button type="button" onClick={() => setPanel('preview')}>Preview</button>{nativeProject && <button type="button" onClick={() => setPanel('terminal')}>Terminal</button>}</div>
        {panel === 'editor' && <div className={styles.editorGrid}><div className={styles.files}><input aria-label="Search project" placeholder="Find a file or text" value={search} onChange={e => setSearch(e.target.value)} /><nav aria-label="Project files">{paths.filter(path => !search || (path + '\n' + project.files[path]).toLowerCase().includes(search.toLowerCase())).map(path => <button key={path} type="button" aria-current={active === path ? 'true' : undefined} onClick={() => update({ active: path })}>{path}</button>)}</nav><form onSubmit={addFile}><input aria-label="New file path" value={fileName} placeholder="src/new-file.js" onChange={e => setFileName(e.target.value)} /><button type="submit">Add file</button></form></div><div className={styles.editor}>{active ? <><div className={styles.fileHeading}><span>{active}</span><button type="button" onClick={() => saveDownload(active.split('/').pop(), project.files[active])}>Download file</button></div><textarea ref={editor} spellCheck={false} aria-label={'Edit ' + active} value={project.files[active]} onChange={e => { if (e.target.value.length > 500000) { setError('Files must remain under 500 KB.'); return; } update({ files: { ...project.files, [active]: e.target.value } }); }} onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); const el = e.currentTarget, start = el.selectionStart; const value = el.value.slice(0, start) + '  ' + el.value.slice(el.selectionEnd); update({ files: { ...project.files, [active]: value } }); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; }); } if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); nativeProject ? saveNative() : saveDownload(active.split('/').pop(), project.files[active]); } }} /><div className={styles.editorStatus}>{project.files[active].split('\n').length} lines · {new TextEncoder().encode(project.files[active]).length.toLocaleString()} bytes · Working copy</div></> : <div className={styles.empty}><h2>Open a project</h2><p>Open text files or a folder, or create your first file.</p><p>Private keys, environment files and build folders are excluded.</p></div>}</div></div>}
        {panel === 'changes' && <div className={styles.changeList}>{proposal ? <><h2>Review proposed changes</h2><p>Your files stay unchanged until you apply this proposal.</p>{proposal.changes.map(change => <details key={change.path} open={proposal.changes.length === 1}><summary>{change.path} · {change.before === null ? 'New file' : 'Modified'}</summary><div className={styles.diff}><section><h3>Current</h3><pre>{change.before ?? '(new file)'}</pre></section><section><h3>Proposed</h3><pre>{change.content}</pre></section></div></details>)}<div className={styles.changeActions}><button type="button" onClick={applyProposal}>Apply to working copy</button><button type="button" onClick={() => { setProposal(null); setPanel('editor'); }}>Discard proposal</button></div></> : <p>No pending changes. Choose Edit and describe a change to your project.</p>}</div>}
        {panel === 'preview' && <div className={styles.preview}>{/\.html?$/i.test(active) ? <iframe title="Isolated HTML preview" sandbox="allow-scripts" srcDoc={'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; form-action \'none\'">' + project.files[active]} /> : <p>Select an HTML file for an isolated preview. For a framework project, use its development command in the desktop Terminal.</p>}</div>}
        {panel === 'terminal' && <section className={styles.terminal}><h2>Project terminal</h2><p>Commands run in the opened folder after your approval. Output is capped and commands stop after 60 seconds.</p><form onSubmit={runCommand}><label htmlFor="native-command">Command</label><input id="native-command" value={command} onChange={e => setCommand(e.target.value)} placeholder="npm test" /><button disabled={terminalBusy} type="submit">{terminalBusy ? 'Running…' : 'Review and run'}</button></form><pre role="log">{terminal || 'No commands have run.'}</pre></section>}
      </section>}
      <section className={styles.chat} data-empty={!project.messages.length || undefined} aria-label={isChat ? 'Conversation' : 'Assistant'}><div className={styles.chatHeading}><span className={styles.heroMark} aria-hidden="true"><AppMark kind={app.id}/></span><h1>{isChat ? 'What’s on your mind?' : app.id === 'review' ? 'Let’s make something good.' : app.id === 'cursor' ? 'Where should we begin?' : 'What should we build?'}</h1><p className={styles.subtitle}>{isChat ? 'A little curiosity goes a long way.' : app.id === 'review' ? 'Think it through. Find the details. Ship with confidence.' : app.id === 'cursor' ? 'Your code. A fresh perspective.' : 'From a first idea to your next commit.'}</p>{isChat && paths.length > 0 && <details><summary>Attached files ({paths.length})</summary>{paths.map(path => <div key={path}>{path} <button type="button" aria-label={'Remove attachment ' + path} disabled={busy} onClick={() => update({ files: Object.fromEntries(Object.entries(project.files).filter(([name]) => name !== path)) })}>Remove</button></div>)}</details>}{isChat && <details><summary>Bot instructions</summary><textarea aria-label="Bot instructions" value={project.instructions} placeholder="Optional tone, role or preferences" onChange={e => update({ instructions: e.target.value.slice(0, 2000) })} /></details>}</div><div id="developer-messages" className={styles.messages} role="log" aria-label="Conversation messages">{project.messages.map((m, i) => <article key={i} data-role={m.role}><div><strong>{m.role === 'user' ? 'You' : app.name}</strong><button type="button" onClick={() => { navigator.clipboard?.writeText(m.text).then(() => setNotice('Copied response.')).catch(() => setError('Copy is unavailable. Select the response text to copy it.')); }}>Copy</button></div><pre>{m.text}</pre></article>)}</div>
        <form className={styles.composer} onSubmit={e => { e.preventDefault(); run(); }}>{!isChat && <div className={styles.modes} role="group" aria-label="Assistant mode">{[['chat', app.id === 'review' ? 'Review' : 'Ask'], ['build', 'Edit'], ['plan', 'Plan']].map(([id, label]) => <button key={id} type="button" disabled={busy} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}<span>{paths.length} files available</span></div>}<label className={styles.visuallyHidden} htmlFor={'prompt-' + app.id}>Message {app.name}</label><textarea id={'prompt-' + app.id} aria-label={'Message ' + app.name} placeholder={isChat ? 'Ask anything…' : app.id === 'review' ? 'How can I help with your code?' : 'Describe a task, ask a question, or open a project…'} value={project.draft} maxLength={8000} onChange={e => update({ draft: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); run(); } }} /><div className={styles.sendRow}><span>{busy ? phase.replaceAll('_', ' ') + '…' : session ? 'Enter to send · Shift + Enter for a new line' : 'Your draft stays here until you’re ready'}</span>{busy ? <button key="stop" aria-label="Stop request" type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); controller.current?.abort(); }}>Stop</button> : <button key="send" type="submit" disabled={!project.draft.trim() || loading}><span aria-hidden="true">↑</span><span className={styles.visuallyHidden}>{session ? 'Send' : 'Sign in to send'}</span></button>}</div></form>
      {!project.messages.length && <div className={styles.suggestions}>{(isChat ? ['Explore an idea', 'Help me write', 'Explain something'] : app.id === 'review' ? ['Review code', 'Find a bug', 'Plan a change'] : ['Build something', 'Understand code', 'Fix an issue']).map(label => <button type="button" key={label} onClick={() => { update({ draft: label === 'Review code' ? 'Review the open files for bugs, with file and line references and steps to verify each finding.' : label === 'Build something' ? 'Help me build ' : label + ': ' }); document.getElementById('prompt-' + app.id)?.focus(); }}>{label}<span aria-hidden="true"> ↗</span></button>)}</div>}
      </section></div></main></div>
    <input ref={fileInput} type="file" multiple hidden onChange={e => { importFiles(e.target.files); e.target.value = ''; }} /><input ref={folderInput} type="file" multiple webkitdirectory="" directory="" hidden onChange={e => { importFiles(e.target.files, true); e.target.value = ''; }} /><input ref={importInput} type="file" accept=".json" hidden onChange={e => { importProject(e.target.files[0]); e.target.value = ''; }} />
    <FloatingAuthModal isOpen={Boolean(authMode)} initialMode={authMode || 'login'} onClose={() => setAuthMode(null)} returnTo={'/downloads/' + (app.slug || app.id) + '?run=1#workspace'} emailOnly showCheckout={false} showMarketingOptIn={false} />
  </section>;
}
