import { contentMatchScore } from './workspace-source-discovery.mjs';
import { copyRequestFiles } from './workspace-copy-request.mjs';
const DEFAULT_MAX_FILES = 24;
const DEFAULT_MAX_CHARACTERS = 400_000;
const DEFAULT_MAX_PATHS = 1500;

function safeToSend(filePath) {
  const path = String(filePath || '').replaceAll('\\', '/');
  const name = path.split('/').at(-1) || '';
  return path && !path.startsWith('/') && !/^[a-z]:\//i.test(path) && !path.split('/').some((part) => part === '..' || part.includes(':')) &&
    !/(^|\/)(?:\.git|node_modules|\.next)(\/|$)/.test(path) &&
    !/^\.env(?:\..+)?$/i.test(name) &&
    !/^(?:\.npmrc|\.netrc|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519)|credentials(?:\.json)?)$/i.test(name) &&
    !/\.(?:pem|p12|pfx|key|keystore|jks)$/i.test(name) &&
    (!/(^|[-_.])(secret|secrets|credentials?)([-_.]|$)/i.test(name) || /\.example$/i.test(name));
}

/** Bound what the browser uploads; the server still checks every path and size. */
export function selectWorkspaceContext(prompt, paths, contents, { activeFilePath = '', requiredPaths = [], maxFiles = DEFAULT_MAX_FILES, maxCharacters = DEFAULT_MAX_CHARACTERS } = {}) {
  const safePaths = paths.map((path) => String(path).replaceAll('\\', '/')).filter(safeToSend);
  const available = safePaths.filter((path) => typeof contents[path] === 'string');
  const required = requiredPaths.filter(path => safeToSend(path) && available.includes(path)).slice(0, 6);
  const requestPaths = [...new Set([...required, activeFilePath, ...available, ...safePaths].filter(safeToSend))].slice(0, DEFAULT_MAX_PATHS);
  const totalCharacters = available.reduce((sum, path) => sum + contents[path].length, 0);
  const foundCopy = copyRequestFiles(prompt, Object.fromEntries(available.map(path => [path, contents[path]])));
  const copyMatches = foundCopy.length ? [...new Set([...required, ...foundCopy])] : [];
  if (copyMatches.length && copyMatches.length <= maxFiles && copyMatches.reduce((sum, path) => sum + contents[path].length, 0) <= maxCharacters) {
    const selectedCharacters = copyMatches.reduce((sum, path) => sum + contents[path].length, 0);
    return { fileList: copyMatches, fileContents: Object.fromEntries(copyMatches.map(path => [path, contents[path]])), selectedCount: copyMatches.length, totalLoaded: available.length, selectedCharacters, totalCharacters, trimmed: copyMatches.length < available.length };
  }
  if (available.length <= maxFiles && totalCharacters <= maxCharacters) {
    return { fileList: requestPaths, fileContents: Object.fromEntries(available.map((path) => [path, contents[path]])), selectedCount: available.length, totalLoaded: available.length, selectedCharacters: totalCharacters, totalCharacters, trimmed: false };
  }

  const keywords = [...new Set(String(prompt || '').toLowerCase().match(/[a-z0-9_-]{3,}/g) || [])].slice(0, 30);
  const ranked = available.map((path, index) => {
    const lowerPath = path.toLowerCase();
    const baseName = lowerPath.split('/').at(-1) || '';
    const excerpt = contents[path].slice(0, 12_000).toLowerCase();
    let score = (required.includes(path) ? 100000 : 0) + (path === activeFilePath ? 100 : 0) + contentMatchScore(prompt, contents[path]);
    for (const keyword of keywords) {
      if (baseName.includes(keyword)) score += 18;
      else if (lowerPath.includes(keyword)) score += 10;
      if (excerpt.includes(keyword)) score += 2;
    }
    if (/^(package\.json|next\.config\.|tsconfig\.json)/.test(baseName)) score += 1;
    return { path, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = {};
  let characters = 0;
  for (const item of ranked) {
    if (Object.keys(selected).length >= maxFiles) break;
    const content = contents[item.path];
    if (characters + content.length > maxCharacters) continue;
    selected[item.path] = content;
    characters += content.length;
  }
  return { fileList: requestPaths, fileContents: selected, selectedCount: Object.keys(selected).length, totalLoaded: available.length, selectedCharacters: characters, totalCharacters, trimmed: true };
}
