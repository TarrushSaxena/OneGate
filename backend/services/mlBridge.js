// ============================================================
// ML BRIDGE SERVICE
// Connects Node.js orchestrator to local Python FastAPI ML microservice
// Primary: DistilBERT Department & Multi-Intent Classifier
// Enforces timeout, clean error handling, and never crashes Node
// ============================================================

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
const DEFAULT_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || '4000', 10);

/**
 * Call Python ML service /predict endpoint
 * @param {string} query
 * @param {number} timeoutMs
 * @returns {Promise<Object>}
 */
async function predictML(query, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Query string is required');
  }

  const url = `${ML_SERVICE_URL.replace(/\/+$/, '')}/predict`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim() }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ML service returned HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`ML service timed out after ${timeoutMs}ms`);
    }
    throw new Error(`ML service unavailable: ${err.message}`);
  }
}

/**
 * Check Python ML service health
 * @returns {Promise<Object|null>}
 */
async function checkHealth(timeoutMs = 2000) {
  const url = `${ML_SERVICE_URL.replace(/\/+$/, '')}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) return await res.json();
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

module.exports = {
  predictML,
  checkHealth,
  ML_SERVICE_URL,
};
