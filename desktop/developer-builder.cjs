const { build, Platform } = require('electron-builder');
const path = require('node:path');
const targets = { code: ['codex', 'Roseram Codex'], review: ['claude-code', 'Roseram Claude Code'], chat: ['grok-bot', 'Roseram Grok Bot'], cursor: ['cursor', 'Roseram Cursor'] };
const selected = process.argv[2] || 'all';
if (selected !== 'all' && !Object.hasOwn(targets, selected)) throw Error('Choose code, review, chat, cursor or all.');
(async () => {
 for (const [id, [slug, name]] of Object.entries(targets)) {
  if (selected !== 'all' && selected !== id) continue;
  await build({ targets: Platform.WINDOWS.createTarget(process.argv.includes('--dir') ? 'dir' : 'nsis'), publish: 'never', config: {
   appId: 'com.roseram.' + slug, productName: name, executableName: 'roseram-' + slug,
   extraMetadata: { roseramApp: id }, directories: { output: path.join('dist', 'developer-' + slug) },
   artifactName: 'Roseram-' + slug + '-${version}-windows-${arch}.${ext}',
  } });
 }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
