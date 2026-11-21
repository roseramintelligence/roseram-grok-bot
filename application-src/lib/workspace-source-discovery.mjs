// Resolve source imports before asking a model about a partially loaded repository.
export function sourceCandidates(prompt, paths, contents) {
  const sources = paths.filter(path => /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?|json|mdx?)$/i.test(path) && !/(^|\/)(?:node_modules|\.git|\.next|dist|build)\//.test(path) && !/(?:lock\.json|lock\.yaml|\.env|credentials|secrets)/i.test(path));
  const known = new Set(sources), imports = new Set();
  for (const [path, content] of Object.entries(contents)) {
    for (const match of String(content).matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)) {
      const value = match[1];
      let bases = [];
      if (value.startsWith('@/')) bases = [value.slice(2), `src/${value.slice(2)}`];
      else if (value.startsWith('.')) {
        const parts = path.split('/'); parts.pop();
        for (const part of value.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); }
        bases = [parts.join('/')];
      }
      for (const base of bases) for (const suffix of ['', '.jsx', '.tsx', '.js', '.ts', '.json', '/index.jsx', '/index.tsx', '/index.js']) if (known.has(base + suffix)) imports.add(base + suffix);
    }
  }
  const words = [...new Set(String(prompt).toLowerCase().match(/[a-z]{4,}/g) || [])];
  return sources.filter(path => !Object.hasOwn(contents, path)).map(path => ({path, score: (imports.has(path) ? 100 : 0) + words.filter(word => path.toLowerCase().includes(word)).length * 15 + (/components|content|copy|page|forum|home|hero/i.test(path) ? 5 : 0)})).sort((a,b) => b.score-a.score || a.path.localeCompare(b.path)).map(item => item.path);
}

export function contentMatchScore(prompt, content) {
  const normalize = text => String(text).toLowerCase().replace(/\s+/g, ' ').trim();
  const request = normalize(prompt), source = normalize(content).replace(/[^a-z0-9]+/g, ' ');
  // Quoted and pasted copy outranks coincidental path names.
  const words = request.match(/[a-z0-9]+/g) || [];
  let best = 0;
  for (let i = 0; i + 5 <= Math.min(words.length, 200); i++) {
    const phrase = words.slice(i, i + 5).join(' ');
    if (source.includes(phrase)) best += 20;
  }
  return Math.min(2000, best);
}
