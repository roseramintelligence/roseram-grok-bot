// Only explicit text-replacement requests qualify for focused source selection.
export function parseCopyRequest(prompt) {
  const text = String(prompt || '').trim();
  let match = text.match(/^(?:edit|change|replace)\s+(?:this\s+)?text\s*\(([\s\S]+?)\)\s*(?:to(?:\s+just)?\s+read\s+as|with|to)\s*:\s*([\s\S]+)$/i)
    || text.match(/^(?:edit|change|replace)\s+["“]([^"”]+)["”]\s+(?:with|to)\s+["“]([\s\S]+)["”]\s*$/i);
  let source = match?.[1], replacement = match?.[2];
  if (!match) {
    match = text.match(/^(?:edit|change|replace)\b[^\n]*?\b(?:to\s+)?(?:just\s+)?read\s+(?:as\s*:\s*|as\s+)?([^\n]+?)\s*:\s*\n?([\s\S]+)$/i);
    source = match?.[2]; replacement = match?.[1];
  }
  source = source?.replace(/\n\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*$/i, '').trim();
  replacement = replacement?.trim();
  return source && source.length >= 20 && replacement ? { source, replacement } : null;
}

export function copyRequestSource(prompt) { return parseCopyRequest(prompt)?.source || null; }

export function copyRequestFiles(prompt, files) {
  const source = copyRequestSource(prompt);
  if (!source) return [];
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const target = normalize(source);
  const sentences = target.split(/(?<=[.!?])\s+/).filter(part => part.length >= 20);
  return Object.keys(files).filter(path => typeof files[path] === 'string' && (normalize(files[path]).includes(target) || (sentences.length > 1 && sentences.every(part => normalize(files[path]).includes(part)))));
}
