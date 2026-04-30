// Same-origin in production, Vite proxy to :8000 in dev.
const API = '';

async function req(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ detail: 'Connection error' }));
    throw new Error(e.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

// ── Chat ───────────────────────────────────────────────────────────────
export const askQuestion = (query, conversationHistory = []) =>
  req('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ query, history: conversationHistory }),
  });

export const getSamplePrompts = () => req('/api/chat/sample-prompts');

// ── CDM browser ────────────────────────────────────────────────────────
export const getCdmSummary = () => req('/api/cdm/summary');
export const listPersons = (limit = 50, offset = 0) =>
  req(`/api/cdm/persons?limit=${limit}&offset=${offset}`);
export const getPerson = (id) => req(`/api/cdm/persons/${id}`);
export const searchConcepts = (q, domain = '') => {
  const params = new URLSearchParams({ q });
  if (domain) params.set('domain', domain);
  return req(`/api/cdm/concepts/search?${params}`);
};
export const getConcept = (id) => req(`/api/cdm/concepts/${id}`);
export const runSql = (sql) =>
  req('/api/cdm/sql', { method: 'POST', body: JSON.stringify({ sql }) });

// ── Characterization (the dashboard) ───────────────────────────────────
export const getCdmCharacterization = () => req('/api/characterization/cdm');
export const characterizeCohort = (personIds = []) => {
  const params = new URLSearchParams();
  if (personIds.length) params.set('person_ids', personIds.join(','));
  return req(`/api/characterization/cohort?${params}`);
};

// ── Documents / RAG corpus ─────────────────────────────────────────────
export const getDocuments = () => req('/api/documents');
export const getDocumentRaw = (docId) =>
  fetch(`/api/documents/${docId}/raw`).then(r => r.text());
export const getChunk = (chunkId) =>
  req(`/api/documents/chunk/${encodeURIComponent(chunkId)}`);

// ── Cohort ─────────────────────────────────────────────────────────────
export const getLastCohort = () => req('/api/cohort/last');
export const downloadLastCirce = () => '/api/cohort/last/circe.json';
export const buildCohort = (spec) =>
  req('/api/cohort/build', { method: 'POST', body: JSON.stringify(spec) });

// ── Audit / query log ──────────────────────────────────────────────────
export const getQueryLog = () => req('/api/audit/queries');
export const clearQueryLog = () =>
  req('/api/audit/queries', { method: 'DELETE' });

export const getHealth = () => req('/api/health');
