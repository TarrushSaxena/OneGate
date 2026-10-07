// ============================================================
// ONE FRONT DOOR FOR EVERYTHING — APP ROUTER & GLOBAL STATE
// Exclusively Light Theme Liquid Glass
// ============================================================

const API = '/api';
let socket = null;
let currentUser = null;
let currentPage = null;

// ─── Global State ─────────────────────────────────────────────
window.PS18 = {
  api: API,
  socket: null,
  user: null,
  conversations: {},

  async request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const token = localStorage.getItem('ps18_token');
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (options.method && options.method !== 'GET' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${API}${path}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        const error = new Error(problem.message || problem.error || `HTTP ${res.status}`);
        error.status = res.status;
        error.code = problem.code || problem.error;
        error.fieldErrors = problem.fieldErrors || null;
        throw error;
      }
      return await res.json();
    } catch (err) {
      console.error(`[API] ${path}`, err);
      if (err.name === 'AbortError') throw new Error('The connection timed out. Your draft is saved; retry to check delivery.');
      throw err;
    } finally { clearTimeout(timeout); }
  },

  connectSocket() {
    if (window.PS18.socket?.connected) window.PS18.socket.disconnect();
    const s = io({ auth: { token: localStorage.getItem('ps18_token') } });
    window.PS18.socket = s;

    s.on('connect', () => {
      console.log('[WS] Connected to OneGate server');
    });

    s.on('disconnect', () => console.log('[WS] Disconnected'));
    return s;
  },

  showToast(message, type = 'info', duration = 3500) {
    const icons = {
      info:    '💬',
      success: '✅',
      warning: '⚠️',
      error:   '❌',
    };
    const icon = icons[type] || '💬';

    const el = document.createElement('div');
    el.className = 'toast-light';
    el.innerHTML = `
      <span style="font-size:17px;flex-shrink:0;">${icon}</span>
      <span style="font-size:13.5px;font-weight:600;color:#0F172A;line-height:1.4;">${message}</span>
    `;

    const container = document.getElementById('toast-container');
    if (container) {
      container.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px) scale(0.95)';
        el.style.transition = 'all 0.25s ease';
        setTimeout(() => el.remove(), 250);
      }, duration);
    }
  },

  formatTime(ts) {
    if (!ts) return 'just now';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return d.toLocaleDateString();
  },

  md(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:#F1F5F9;border:1px solid #E2E8F0;padding:2px 6px;border-radius:6px;font-size:13px;color:#0284C7;">$1</code>')
      .replace(/📎 \*Source: (.+?)\*/g, '<span style="font-size:12px;font-weight:600;color:#0284C7;display:block;margin-top:8px;padding:4px 8px;background:#F0F9FF;border-radius:6px;border:1px solid #BAE6FD;">📎 Source: $1</span>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  },
};

// ─── Router ────────────────────────────────────────────────────
function navigate(page, params = {}) {
  if (window.PS18.cleanup) { window.PS18.cleanup(); window.PS18.cleanup = null; }
  const app = document.getElementById('app');

  if (currentPage) {
    const el = document.getElementById(`page-${currentPage}`);
    if (el) {
      el.remove();
    }
  }

  currentPage = page;

  const pageEl = document.createElement('div');
  pageEl.id = `page-${page}`;
  pageEl.className = 'page-container animate-fade-in';
  pageEl.style.width = '100%';
  pageEl.style.height = '100%';
  app.appendChild(pageEl);

  const renderers = {
    hero:       window.renderHero,
    'how-it-works': window.renderHowItWorks,
    login:      window.renderLogin,
    chat:       window.renderChat,
    inbox:      window.renderInbox,
    manager:    window.renderManager,
    department: window.renderManager,
    org:        window.renderManager,
    history:    window.renderHistory,
  };

  if (renderers[page]) {
    renderers[page](pageEl, params);
  }
}

// ─── Boot ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const publicPage = location.hash.slice(1);
  if (['hero', 'how-it-works'].includes(publicPage)) {
    navigate(publicPage);
    return;
  }
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      window.PS18.user = data.user;
      if (data.redirect) {
        const page = data.redirect.replace('/app/', '');
        navigate(page || 'chat');
        return;
      }
    }
  } catch (_) {}
  navigate('hero');
});
