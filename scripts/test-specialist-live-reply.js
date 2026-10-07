const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '../output/playwright');

async function testSpecialistLiveReply() {
  const browser = await chromium.launch({ headless: true });

  for (const { width, height, name } of [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 390, height: 844, name: 'mobile' }
  ]) {
    console.log(`Testing specialist reply on ${name} (${width}x${height})...`);
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3107/index.html');
    await page.waitForLoadState('networkidle');

    // 1. Login as employee and open chat
    const empData = await page.evaluate(async () => {
      const r = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'employee' })
      });
      const data = await r.json();
      localStorage.setItem('ps18_token', data.token);
      window.PS18.user = data.user;
      window.navigate('chat');
      return data;
    });

    await page.waitForSelector('.og-work', { timeout: 8000 });
    await page.waitForTimeout(600);

    // 2. Start a fresh ticket if needed
    const newBtn = await page.$('#og-new');
    if (newBtn) {
      await newBtn.click();
      await page.waitForTimeout(300);
    }

    // Message 1
    await page.fill('#og-draft', 'How many paid leaves do I get per year?');
    await page.click('#og-compose button[type="submit"]');
    await page.waitForTimeout(1000);

    // Message 2
    await page.fill('#og-draft', 'My salary was not credited this month and rent is due tomorrow');
    await page.click('#og-compose button[type="submit"]');
    await page.waitForTimeout(1500);

    // Get current ticket
    const ticketInfo = await page.evaluate(async () => {
      const r = await fetch('/api/tickets?limit=10', {
        headers: { Authorization: `Bearer ${localStorage.getItem('ps18_token')}` }
      });
      const data = await r.json();
      const financeTicket = data.tickets.find(t => t.department === 'Finance' && t.status !== 'resolved');
      return financeTicket;
    });

    console.log(`Found active Finance ticket for ${name}:`, ticketInfo ? ticketInfo.reference : 'none');

    if (ticketInfo) {
      // 3. Login as Finance Specialist and send reply
      const replyResult = await page.evaluate(async (ticket) => {
        // Login as Vikram Mehta via demo-login
        const authRes = await fetch('/api/auth/demo-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'finance-specialist' })
        });
        const authData = await authRes.json();
        if (!authRes.ok) throw new Error('Specialist login failed: ' + JSON.stringify(authData));

        // Reply to ticket
        const replyRes = await fetch(`/api/tickets/${ticket.id}/reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authData.token}`
          },
          body: JSON.stringify({
            version: ticket.version,
            message: "Hello! I've reviewed your payroll records. The transfer batch was cleared at 11:30 AM and funds will credit within 15 minutes."
          })
        });
        return await replyRes.json();
      }, ticketInfo);

      console.log(`Specialist reply posted for ${name}:`, replyResult.status || 'OK');

      // Wait for socket update to arrive and render in the employee UI
      await page.waitForTimeout(1200);

      // Screenshot after live specialist reply
      await page.screenshot({
        path: path.join(outDir, `specialist-reply-${name}-received.png`)
      });
    }

    // Also test "My requests" view drawer on mobile / list on desktop
    await page.click('[data-view="tickets"]');
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outDir, `my-requests-${name}.png`)
    });

    await context.close();
  }

  await browser.close();
  console.log('Specialist live reply test completed successfully!');
}

testSpecialistLiveReply().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
