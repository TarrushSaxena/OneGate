// ============================================================
// ZENMUX LLM CLIENT
// Wraps the zenmux.ai OpenAI-compatible API
// Primary Model: z-ai/glm-4.7-flash-free (as requested by user)
// Fallback Models: z-ai/glm-4.6v-flash-free, dots-studio/dots3-note-prev
// ============================================================

const https = require('https');
const { URL } = require('url');

const LLM_CONFIG = {
  apiKey: process.env.ZENMUX_API_KEY || 'sk-ai-v1-31d6836f1af3bf13907e6923c7cdab7195e961e64b3e7b6b1a54e4f202aa7bf1',
  baseUrl: process.env.ZENMUX_BASE_URL || 'https://zenmux.ai/api/v1',
  primaryModel: process.env.ZENMUX_PRIMARY_MODEL || 'dots-studio/dots3-note-prev',
  fallbackModels: ['z-ai/glm-4.7-flash-free', 'z-ai/glm-4.6v-flash-free'],
  timeoutMs: process.env.NODE_ENV === 'test' ? 1200 : 8000,
};

/**
 * Execute a single HTTP call to the zenmux chat completion endpoint.
 */
function makeCompletionCall(model, messages, opts = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 800,
    });

    const url = new URL(`${LLM_CONFIG.baseUrl}/chat/completions`);
    const reqOpts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    let settled = false;
    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.error.message || `API error (${res.statusCode})`));
          }
          const choice = parsed.choices?.[0]?.message;
          const text = (choice?.content || '').trim();
          if (!text && choice?.reasoning) {
            // Some reasoning models return thinking in reasoning field
            return resolve(choice.reasoning.trim());
          }
          resolve(text);
        } catch (e) {
          reject(new Error(`LLM parse error: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    req.setTimeout(LLM_CONFIG.timeoutMs, () => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(new Error(`Model ${model} timed out after ${LLM_CONFIG.timeoutMs}ms`));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Call the LLM with automatic fallback chain:
 * 1. Primary model (z-ai/glm-4.7-flash-free)
 * 2. Fallbacks (z-ai/glm-4.6v-flash-free, etc.)
 */
async function callLLM(messages, opts = {}) {
  const modelsToTry = [LLM_CONFIG.primaryModel, ...LLM_CONFIG.fallbackModels];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const text = await makeCompletionCall(model, messages, opts);
      if (text && text.length > 0) {
        return text;
      }
    } catch (err) {
      lastError = err;
      console.warn(`[LLM] Model ${model} failed: ${err.message}. Trying next model...`);
    }
  }

  throw lastError || new Error('All LLM models failed to produce an answer.');
}

module.exports = { callLLM, LLM_CONFIG };
