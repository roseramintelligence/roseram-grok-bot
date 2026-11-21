const BASE_URL = 'https://roseram.com/api/v1';
const ROSERAM_MODEL = 'roseram';

export function createRoseramClient({ apiKey, fetcher = globalThis.fetch } = {}) {
  if (!/^rr_live_[A-Za-z0-9_-]+$/.test(apiKey || '')) {
    throw new Error('Provide a Roseram developer key from https://roseram.com/developers.');
  }

  async function request(path, body) {
    const data = body === undefined ? undefined : JSON.stringify(body);
    if (data && data.length > 96000) throw new Error('Shorten the request or selection and try again.');
    const response = await fetcher(BASE_URL + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      body: data,
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw Object.assign(new Error(result?.error?.message || 'Roseram API returned HTTP ' + response.status), { status: response.status });
    }
    if (!result) throw new Error('Roseram returned an invalid response.');
    return result;
  }

  return Object.freeze({
    models: () => request('/models'),
    complete: (messages, maxTokens = 4096) => request('/chat/completions', { model: ROSERAM_MODEL, messages, max_tokens: maxTokens }),
  });
}
