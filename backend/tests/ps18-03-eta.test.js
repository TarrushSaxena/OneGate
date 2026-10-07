const test = require('node:test');
const assert = require('node:assert');
const { computeETA, formatETAMessage, getSLAHours } = require('../services/priority');

test('PS18-03: ETA computation formula, range rounding, offline agents, and SLA clamping', () => {
  // 1. Empty queue (0 tickets ahead, 2 available agents, medium priority)
  // avg_reply for medium = 45m. queueWait = 0. etaMid = 45m.
  // low = roundTo5(45 * 0.75) = 35m. high = roundTo5(45 * 1.25) = 55m.
  const etaEmpty = computeETA(0, 2, 'medium');
  assert.strictEqual(etaEmpty.etaLowMin, 35);
  assert.strictEqual(etaEmpty.etaHighMin, 55);
  assert.strictEqual(etaEmpty.queuePosition, null);

  // 2. Range rounded to 5 minutes
  assert.strictEqual(etaEmpty.etaLowMin % 5, 0, 'etaLowMin must be a multiple of 5');
  assert.strictEqual(etaEmpty.etaHighMin % 5, 0, 'etaHighMin must be a multiple of 5');

  // 3. Long queue (10 tickets ahead, 1 available agent, high priority)
  // avg_reply for high = 20m. queueWait = (10/1)*20 = 200m. etaMid = 220m.
  // SLA clamp for high is 2 hours = 120m!
  // high must not exceed SLA clamp of 120m!
  const etaLong = computeETA(10, 1, 'high');
  const slaMaxHigh = getSLAHours('high') * 60; // 120m
  assert.ok(etaLong.etaHighMin <= slaMaxHigh, `ETA high must be clamped to SLA (${slaMaxHigh}m), got ${etaLong.etaHighMin}`);
  assert.strictEqual(etaLong.queuePosition, 11);

  // 4. Offline agents (availableAgents = 0)
  // Fallback to queue position-based calculation
  const etaOffline = computeETA(2, 0, 'medium');
  assert.ok(etaOffline.etaLowMin > 0);
  assert.ok(etaOffline.etaHighMin >= etaOffline.etaLowMin);
  assert.strictEqual(etaOffline.queuePosition, 3);

  // 5. String formatting check ("About X to Y min, by H:MM AM/PM")
  const etaStr = formatETAMessage(15, 25, 'Asia/Kolkata');
  assert.match(etaStr, /^About 15 to 25 min, by \d{1,2}:\d{2}\s?(?:AM|PM)$/i);
});
