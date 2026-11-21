export const WORKSPACE_LIMITS = Object.freeze({ files: 200, fileBytes: 500_000, totalBytes: 2_000_000, messages: 100 });
const forbidden = /(^|\/)(?:\.git|node_modules|\.next|dist|build|\.roseram)(\/|$)|(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\.json)?|id_(?:rsa|ed25519)|.*\.(?:pem|key|p12|pfx|keystore))$/i;
export function workspacePath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || /[\x00-\x1f<>:"|?*\\]/.test(value) || value.startsWith('/') || value.split('/').some(x => !x || x === '.' || x === '..' || /[. ]$/.test(x) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(x)) || forbidden.test(value)) return null;
  return value;
}
export function validateWorkspaceFiles(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Choose a project containing text files.');
  const entries = Object.entries(input); let bytes = 0; const result = Object.create(null); const paths = new Set();
  if (entries.length > WORKSPACE_LIMITS.files) throw Error('Open up to 200 text files at a time.');
  for (const [path, content] of entries) {
    if (!workspacePath(path) || ['__proto__', 'constructor', 'prototype'].includes(path)) throw Error('Unsupported project path: ' + path);
    if (paths.has(path.toLowerCase())) throw Error('Project paths must be unique, including letter case.');
    paths.add(path.toLowerCase());
    if (typeof content !== 'string' || content.includes('\0') || new TextEncoder().encode(content).length > WORKSPACE_LIMITS.fileBytes) throw Error('Choose text files under 500 KB: ' + path);
    bytes += new TextEncoder().encode(content).length; result[path] = content;
  }
  if (bytes > WORKSPACE_LIMITS.totalBytes) throw Error('Open a project under 2 MB of text.');
  return result;
}
export function newWorkspace(name = 'Untitled project') {
  return { id: globalThis.crypto.randomUUID(), name, files: {}, messages: [], draft: '', active: '', instructions: '', updatedAt: Date.now() };
}
export function restoreWorkspaces(raw) {
  try {
    const data = JSON.parse(raw); if (!Array.isArray(data)) return [];
    return data.slice(0, 20).map(p => ({ ...newWorkspace(), id: typeof p.id === 'string' && /^[a-f0-9-]{36}$/.test(p.id) ? p.id : globalThis.crypto.randomUUID(), name: String(p.name || 'Untitled project').slice(0, 80), files: validateWorkspaceFiles(p.files), messages: Array.isArray(p.messages) ? p.messages.filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.text === 'string').slice(-100).map(m => ({ role: m.role, text: m.text.slice(0, 100000) })) : [], draft: String(p.draft || '').slice(0, 8000), active: workspacePath(p.active) || '', instructions: String(p.instructions || '').slice(0, 2000), requestBaseline: p.requestBaseline ? validateWorkspaceFiles(p.requestBaseline) : null }));
  } catch { return []; }
}
export function prepareWorkspaceChanges(generation, baseline, current) {
  if (generation?.preflight?.passed === false) throw Error('The proposed changes failed validation. Ask for a corrected change.');
  if (!Array.isArray(generation?.files) || !generation.files.length || generation.files.length > 40) throw Error('No valid file changes were returned.');
  const next = { ...current }, seen = new Set(); const changes = [];
  for (const file of generation.files) {
    const path = workspacePath(file?.path);
    if (!path || seen.has(path.toLowerCase())) throw Error('The proposal includes an unsupported or repeated path.');
    seen.add(path.toLowerCase());
    const before = Object.hasOwn(baseline, path) ? baseline[path] : null;
    if ((Object.hasOwn(current, path) ? current[path] : null) !== before) throw Error(path + ' changed after this request. Review a new proposal before applying.');
    if (['delete', 'remove'].includes(file.action) || file.deleted === true) throw Error('File deletion is not applied automatically. Remove the file yourself after reviewing the proposal.');
    if (typeof file.content !== 'string') throw Error('The proposal must include complete text for ' + path);
    if (file.content === before) continue;
    next[path] = file.content; changes.push({ path, before, content: file.content });
  }
  validateWorkspaceFiles(next);
  return { files: next, changes };
}
export function workspaceStorageKey(appId, owner) { return 'roseram:developer-workspace:v1:' + appId + ':' + (owner || 'guest'); }
