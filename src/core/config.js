import 'dotenv/config';

function num(name, def) {
  const v = process.env[name];
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function bool(name, def) {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === '1' || String(v).toLowerCase() === 'true';
}

function str(name, def = '') {
  const v = process.env[name];
  return v === undefined ? def : String(v);
}

export const config = {
  llm: {
    baseUrl: str('LLM_BASE_URL', ''),
    apiKey: str('LLM_API_KEY', ''),
    model: str('LLM_MODEL', ''),
    temperature: num('LLM_TEMPERATURE', 0.2),
    maxRetries: num('LLM_MAX_RETRIES', 3),
    retryBaseMs: num('LLM_RETRY_BASE_MS', 500),
    retryMaxMs: num('LLM_RETRY_MAX_MS', 10000),
  },

  retrieval: {
    topK: num('TOP_K', 3),
    maxContextChars: num('MAX_CONTEXT_CHARS', 3500),
    fileDiversity: num('FILE_DIVERSITY', 1), // same file max hits (future use)
    debug: bool('DEBUG_RAG', false),
  },

  embed: {
    provider: str('EMBED_PROVIDER', 'ollama').toLowerCase(),
    baseUrl: str('EMBED_BASE_URL', ''),
    apiKey: str('EMBED_API_KEY', ''),
    model: str('EMBED_MODEL', ''),
  },

  ingest: {
    chunkSize: num('CHUNK_SIZE', 900),
    chunkOverlap: num('CHUNK_OVERLAP', 180),
  },

  query: {
    enrichment: str('QUERY_ENRICHMENT', '').trim(),
    enrichmentEnabled: bool('QUERY_ENRICHMENT_ENABLED', Boolean(str('QUERY_ENRICHMENT', '').trim())),
  },

  eval: {
    mode: bool('EVAL_MODE', false),
    queryEnrichment: str('EVAL_QUERY_ENRICHMENT', '').trim(),
    temperature: num('EVAL_TEMPERATURE', 0.2),
    sleepMs: num('EVAL_SLEEP_MS', 0),
    maxCases: num('EVAL_MAX_CASES', 0),
  },
};

function requireLLMConfig() {
  const { baseUrl, apiKey, model } = config.llm;
  if (!baseUrl || !apiKey || !model) {
    throw new Error('Missing LLM config: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL');
  }
}

requireLLMConfig();