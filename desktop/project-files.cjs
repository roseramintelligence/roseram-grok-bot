'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const excluded = /(^|\/)(?:\.git|node_modules|\.next|dist|build|\.roseram)(\/|$)|(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\.json)?|id_(?:rsa|ed25519)|.*\.(?:pem|key|p12|pfx|keystore))$/i;
function relativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || /[\x00-\x1f<>:"|?*\\]/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p)) || excluded.test(value)) throw Error('Unsupported project file path.');
  return value;
}
async function confined(root, relative) {
  relativePath(relative);
  const destination = path.resolve(root, relative);
  if (!destination.startsWith(root + path.sep)) throw Error('File is outside the opened folder.');
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    try { const info = await fs.lstat(cursor); if (info.isSymbolicLink()) throw Error('Symbolic links cannot be edited.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return destination;
}
async function readProject(folder) {
  const root = await fs.realpath(folder); const files = Object.create(null); let bytes = 0, skipped = 0;
  async function scan(directory, prefix = '') {
    for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const relative = prefix + item.name;
      if (item.isSymbolicLink() || excluded.test(relative)) { skipped++; continue; }
      if (item.isDirectory()) { if (relative.split('/').length < 15) await scan(path.join(directory, item.name), relative + '/'); continue; }
      if (!item.isFile()) continue;
      try {
        relativePath(relative); const absolute = await confined(root, relative); const stat = await fs.stat(absolute);
        if (Object.keys(files).length >= 200 || stat.size > 500000 || bytes + stat.size > 2000000) { skipped++; continue; }
        const buffer = await fs.readFile(absolute); if (buffer.includes(0)) { skipped++; continue; }
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); files[relative] = text; bytes += buffer.length;
      } catch { skipped++; }
    }
  }
  await scan(root); return { root, name: path.basename(root), files, skipped };
}
async function prepareWrites(root, changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 40) throw Error('Save between 1 and 40 changed files at a time.');
  const seen = new Set(); let bytes = 0; const prepared = [];
  for (const change of changes) {
    const relative = relativePath(change?.path); const lower = relative.toLowerCase(); if (seen.has(lower)) throw Error('Duplicate file path.'); seen.add(lower);
    if (typeof change.content !== 'string' || change.content.includes('\0') || Buffer.byteLength(change.content) > 500000 || (change.before !== null && typeof change.before !== 'string')) throw Error('Invalid file contents or baseline.');
    bytes += Buffer.byteLength(change.content); if (bytes > 2000000) throw Error('Save at most 2 MB at a time.');
    const absolute = await confined(root, relative); let before = null;
    try { before = await fs.readFile(absolute, 'utf8'); } catch(e) { if (e.code !== 'ENOENT') throw e; }
    if (before !== change.before) throw Error(relative + ' changed on disk. Reopen the folder and review those changes before saving.');
    prepared.push({ path: relative, absolute, before, content: change.content });
  }
  return prepared;
}
async function commitWrites(root, changes, backupDirectory) {
  const prepared = await prepareWrites(root, changes); const backup = path.join(backupDirectory, randomUUID());
  await fs.mkdir(backup, { recursive: true });
  await fs.writeFile(path.join(backup, 'changes.json'), JSON.stringify(prepared.map(({path,before}) => ({path,before})), null, 2), { mode: 0o600 });
  const written = [];
  try {
    for (const change of prepared) {
      await confined(root, change.path);
      let latest = null; try { latest = await fs.readFile(change.absolute, 'utf8'); } catch(e) { if (e.code !== 'ENOENT') throw e; }
      if (latest !== change.before) throw Error(change.path + ' changed during save. No further files were written.');
      await fs.mkdir(path.dirname(change.absolute), { recursive: true });
      const temporary = change.absolute + '.roseram-' + randomUUID() + '.tmp';
      try { await fs.writeFile(temporary, change.content, { flag: 'wx' }); await fs.rename(temporary, change.absolute); written.push(change); }
      finally { await fs.rm(temporary, { force: true }); }
    }
  } catch(e) {
    for (const change of written.reverse()) { if (change.before === null) await fs.rm(change.absolute, { force: true }); else await fs.writeFile(change.absolute, change.before); }
    throw e;
  }
  return { saved: written.length };
}
module.exports = { relativePath, confined, readProject, prepareWrites, commitWrites };
