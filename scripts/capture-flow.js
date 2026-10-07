const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../output/playwright');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function captureRun(tag = 'baseline') {
  const browser = await chromium.launch({ headless: true });
  const delays = [150, 450, 1000, 2000, 4000, 8000];

  for (const { width, height, name } of [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 390, height: 844, name: 'mobile' }
  ]) {
    console.log(`Starting ${name} (${width}x${height}) for ${tag}...`);
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3107/index.html');
    await page.waitForLoadState('networkidle');

    // Login as employee
    await page.evaluate(async () => {
      const r = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'employee' })
      });
      const data = await r.json();
      if (!r.ok) throw new Error('Demo login failed: ' + JSON.stringify(data));
      localStorage.setItem('ps18_token', data.token);
      window.PS18.user = data.user;
      window.navigate('chat');
    });

    await page.waitForSelector('.og-work', { timeout: 8000 });
    await page.waitForTimeout(500);

    // Click "New question" if visible
    const newBtn = await page.$('#og-new');
    if (newBtn) {
      await newBtn.click();
      await page.waitForTimeout(300);
    }

    // Message 1: "How many paid leaves do I get per year?"
    await page.fill('#og-draft', 'How many paid leaves do I get per year?');
    await page.click('#og-compose button[type="submit"]');

    const start1 = Date.now();
    for (const d of delays) {
      const wait = Math.max(0, d - (Date.now() - start1));
      if (wait > 0) await page.waitForTimeout(wait);
      await page.screenshot({ path: path.join(outDir, `${tag}-${name}-msg1-${d}ms.png`) });
    }

    // Message 2: "My salary was not credited this month and rent is due tomorrow"
    await page.fill('#og-draft', 'My salary was not credited this month and rent is due tomorrow');
    await page.click('#og-compose button[type="submit"]');

    const start2 = Date.now();
    for (const d of delays) {
      const wait = Math.max(0, d - (Date.now() - start2));
      if (wait > 0) await page.waitForTimeout(wait);
      await page.screenshot({ path: path.join(outDir, `${tag}-${name}-msg2-${d}ms.png`) });
    }

    await context.close();
  }

  await browser.close();
  console.log(`Capture ${tag} complete!`);
}

if (require.main === module) {
  const tag = process.argv[2] || 'baseline';
  captureRun(tag).catch(err => {
    console.error('Capture failed:', err);
    process.exit(1);
  });
}

module.exports = { captureRun };
