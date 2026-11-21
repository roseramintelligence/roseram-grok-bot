'use strict';
const { dialog, ipcMain } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readProject, prepareWrites, commitWrites } = require('./project-files.cjs');
const apps = { code: 'codex', review: 'claude-code', chat: 'grok-bot', cursor: 'cursor' };
function developerApp() {
  const metadata = require('./package.json');
  const selected = metadata.roseramApp || process.env.ROSERAM_DEVELOPER_APP || 'code';
  return Object.hasOwn(apps, selected) ? { id: selected, slug: apps[selected] } : { id: 'code', slug: 'codex' };
}
function registerDeveloperNative({ window: getWindow, appOrigin, userData }) {
  let project = null, locked = false;
  function trusted(event) {
    const win = getWindow(); const frame = event.senderFrame;
    if (!win || event.sender !== win.webContents || frame !== win.webContents.mainFrame) throw Error('Untrusted native request.');
    const url = new URL(frame.url);
    if (url.origin !== appOrigin || !Object.values(apps).some(slug => url.pathname === '/downloads/' + slug) || url.searchParams.get('run') !== '1') throw Error('Native tools are only available in the app workspace.');
    return win;
  }
  ipcMain.handle('roseram:open-project', async event => {
    const win = trusted(event); if (locked) throw Error('Another native operation is in progress.'); locked = true;
    try {
      const choice = await dialog.showOpenDialog(win, { title: 'Open a project folder', properties: ['openDirectory'] });
      if (choice.canceled || !choice.filePaths[0]) return null;
      const result = await readProject(choice.filePaths[0]); project = result.root;
      return { name: result.name, files: result.files, skipped: result.skipped };
    } finally { locked = false; }
  });
  ipcMain.handle('roseram:save-project', async (event, input) => {
    const win = trusted(event); if (!project) throw Error('Open a folder first.'); if (locked) throw Error('Another native operation is in progress.'); locked = true;
    try {
      const prepared = await prepareWrites(project, input?.changes);
      const approval = await dialog.showMessageBox(win, { type: 'question', title: 'Save project changes', message: 'Write ' + prepared.length + ' files to ' + project + '?', detail: prepared.map(x => x.path).join('\n') + '\n\nPrevious contents will be backed up. Files that changed on disk are rejected.', buttons: ['Cancel', 'Save files'], defaultId: 0, cancelId: 0, noLink: true });
      if (approval.response !== 1) return null;
      return await commitWrites(project, input.changes, path.join(userData, 'project-backups'));
    } finally { locked = false; }
  });
  ipcMain.handle('roseram:run-project-command', async (event, input) => {
    const win = trusted(event); if (!project) throw Error('Open a folder first.'); if (locked) throw Error('Another native operation is in progress.');
    const command = input?.command;
    if (typeof command !== 'string' || !command.trim() || command.length > 2000 || /[\x00\r\n]/.test(command)) throw Error('Enter a single command under 2,000 characters.');
    locked = true;
    try {
      const approval = await dialog.showMessageBox(win, { type: 'warning', title: 'Run project command', message: command, detail: 'Working folder: ' + project + '\n\nThis command runs with your computer account and can change files or access the network. Approve only commands you understand. It stops after 60 seconds.', buttons: ['Cancel', 'Run command'], defaultId: 0, cancelId: 0, noLink: true });
      if (approval.response !== 1) return null;
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SystemRoot|WINDIR|ComSpec|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOME|LANG)$/i.test(key)));
      return await new Promise((resolve, reject) => {
        const child = process.platform === 'win32' ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { cwd: project, env, windowsHide: true }) : spawn('/bin/sh', ['-c', command], { cwd: project, env, windowsHide: true });
        let output = '', timedOut = false, truncated = false;
        function stop() { if (child.exitCode !== null) return; if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }); else child.kill('SIGTERM'); }
        const timer = setTimeout(() => { timedOut = true; stop(); }, 60000);
        function append(buffer) { if (output.length < 128000) output += buffer.toString().slice(0, 128000 - output.length); else if (!truncated) { truncated = true; stop(); } }
        child.stdout.on('data', append); child.stderr.on('data', append);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', code => { clearTimeout(timer); resolve({ code, output: output + (truncated ? '\nOutput limit reached.' : ''), timedOut }); });
      });
    } finally { locked = false; }
  });
}
module.exports = { developerApp, registerDeveloperNative };
