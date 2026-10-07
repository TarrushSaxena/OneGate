// ============================================================
// TF-IDF + COSINE SIMILARITY ENGINE
// Powers knowledge base semantic search
// No external embeddings — pure math from scratch
// ============================================================

class TFIDFEngine {
  constructor() {
    this.documents = [];       // { id, department, title, content, tokens, tfidf }
    this.vocabulary = {};      // word -> index
    this.idf = {};             // word -> idf score
    this.vocabSize = 0;
  }

  // ─── Tokenize & normalize ─────────────────────────────────
  _tokenize(text) {
    const stopwords = new Set([
      'the','a','an','and','or','but','in','on','at','to','for','of','with',
      'by','from','is','are','was','were','be','been','being','have','has',
      'had','do','does','did','will','would','could','should','may','might',
      'can','this','that','these','those','it','its','they','them','their',
      'we','our','you','your','he','she','his','her','not','no','if','as',
      'so','than','then','when','which','who','what','how','where','all',
      'any','each','both','few','more','most','other','some','such','into',
      'through','during','before','after','above','below','between',
    ]);

    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
  }

  // ─── Term Frequency ──────────────────────────────────────
  _computeTF(tokens) {
    const tf = {};
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(tf), 1);
    for (const t in tf) {
      tf[t] = tf[t] / maxFreq; // normalized TF
    }
    return tf;
  }

  // ─── Inverse Document Frequency ─────────────────────────
  _computeIDF() {
    const N = this.documents.length;
    const docFreq = {};

    for (const doc of this.documents) {
      const uniqueTokens = new Set(doc.tokens);
      for (const t of uniqueTokens) {
        docFreq[t] = (docFreq[t] || 0) + 1;
      }
    }

    for (const t in docFreq) {
      this.idf[t] = Math.log((N + 1) / (docFreq[t] + 1)) + 1; // smooth IDF
    }
  }

  // ─── Build TF-IDF Vector ─────────────────────────────────
  _buildVector(tfMap) {
    const vector = {};
    for (const word in tfMap) {
      const idfScore = this.idf[word] || Math.log(2) + 1;
      vector[word] = tfMap[word] * idfScore;
    }
    return vector;
  }

  // ─── Cosine Similarity ───────────────────────────────────
  _cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // Dot product over shared terms
    for (const term in vecA) {
      if (vecB[term]) {
        dotProduct += vecA[term] * vecB[term];
      }
      normA += vecA[term] ** 2;
    }

    for (const term in vecB) {
      normB += vecB[term] ** 2;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }

  // ─── Index a document ────────────────────────────────────
  addDocument(doc) {
    const tokens = this._tokenize(`${doc.title} ${doc.title} ${doc.content}`); // title weight x2
    const tf = this._computeTF(tokens);
    this.documents.push({ ...doc, tokens, tf });
  }

  // ─── Rebuild IDF after indexing all docs ─────────────────
  buildIndex() {
    this._computeIDF();
    // Compute final TF-IDF vectors for all documents
    for (const doc of this.documents) {
      doc.tfidf = this._buildVector(doc.tf);
    }
  }

  // ─── Search ──────────────────────────────────────────────
  search(query, department = null, topK = 3) {
    const queryTokens = this._tokenize(query);
    const queryTF = this._computeTF(queryTokens);
    const queryVector = this._buildVector(queryTF);

    if (department) {
      const deptCandidates = this.documents.filter(d => d.department === department);
      if (deptCandidates.length > 0) {
        const deptScored = deptCandidates.map(doc => ({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          department: doc.department,
          source_citation: doc.source_citation,
          score: this._cosineSimilarity(queryVector, doc.tfidf),
          tags: doc.tags,
        })).sort((a, b) => b.score - a.score);

        if (deptScored[0] && deptScored[0].score >= 0.15) {
          const results = deptScored.slice(0, topK).filter(r => r.score > 0.05);
          return {
            topResult: results[0],
            results,
            retrievalConfidence: results[0]?.score > 0.35 ? 'high' : results[0]?.score > 0.12 ? 'medium' : 'low',
          };
        }
      }
    }

    // Global fallback across all departments
    const scored = this.documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      department: doc.department,
      source_citation: doc.source_citation,
      score: this._cosineSimilarity(queryVector, doc.tfidf),
      tags: doc.tags,
    })).sort((a, b) => b.score - a.score);

    const results = scored.slice(0, topK).filter(r => r.score > 0.04);
    if (results.length === 0) return null;

    return {
      topResult: results[0],
      results,
      retrievalConfidence: results[0]?.score > 0.35 ? 'high' : results[0]?.score > 0.12 ? 'medium' : 'low',
    };
  }

  // ─── Get a passage snippet from content ──────────────────
  extractPassage(content, query, maxLength = 250) {
    const queryWords = new Set(this._tokenize(query));
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];

    // Score sentences by query term overlap
    const scored = sentences.map(s => {
      const words = new Set(this._tokenize(s));
      const overlap = [...queryWords].filter(w => words.has(w)).length;
      return { sentence: s.trim(), score: overlap };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored.slice(0, 2).map(s => s.sentence).join(' ');

    return best.length > maxLength ? best.substring(0, maxLength) + '...' : best;
  }
}

// Singleton instance
const engine = new TFIDFEngine();

// Initialize with KB articles
function initializeKBEngine(kbArticles) {
  for (const article of kbArticles) {
    engine.addDocument(article);
  }
  engine.buildIndex();
  console.log(`[TF-IDF] Indexed ${kbArticles.length} KB articles, vocabulary size: ${Object.keys(engine.idf).length}`);
}

module.exports = { engine, initializeKBEngine };
