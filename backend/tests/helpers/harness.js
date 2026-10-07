// Test harness for PS18 integration tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ps18-test-secret-key-minimum-32-characters-long!';
process.env.ACCOUNTS_FILE = ':memory:';
process.env.BCRYPT_ROUNDS = '4';
process.env.MAIL_TRANSPORT = 'capture';
process.env.COMPANY_EMAIL_DOMAIN = 'company.com';

let activeServer = null;
let baseUrl = null;
let activeApp = null;
let activeState = null;

async function startTestServer() {
  if (activeServer && baseUrl) {
    return { server: activeServer, baseUrl, app: activeApp, state: activeState };
  }

  const { server, app, state } = require('../../server');
  activeApp = app;
  activeState = state;
  
  await new Promise((resolve) => {
    activeServer = server.listen(0, '127.0.0.1', () => {
      const port = activeServer.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  return { server: activeServer, baseUrl, app: activeApp, state: activeState };
}

async function stopTestServer() {
  if (activeServer) {
    await new Promise((resolve) => activeServer.close(resolve));
    activeServer = null;
    baseUrl = null;
  }
}

async function fetchApi(path, options = {}) {
  const { baseUrl } = await startTestServer();
  const url = `${baseUrl}${path}`;
  const headers = { ...(options.headers || {}) };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    redirect: options.redirect || 'manual',
  });

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (_) {}
  } else {
    try {
      data = await response.text();
    } catch (_) {}
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
    response,
  };
}

module.exports = {
  startTestServer,
  stopTestServer,
  fetchApi,
};
