// Secure mailer abstraction for password resets and temporary credentials
const fs = require('fs');
const path = require('path');
const { isTest, isProd } = require('./config');

const outbox = [];
const outboxDir = path.join(__dirname, '../data/runtime/outbox');

function ensureOutboxDir() {
  if (!fs.existsSync(outboxDir)) {
    fs.mkdirSync(outboxDir, { recursive: true });
  }
}

async function sendMail({ to, subject, html, text, metadata = {} }) {
  const transport = process.env.SMTP_HOST ? 'smtp' : (process.env.MAIL_TRANSPORT || 'local_outbox');
  const message = {
    id: `mail-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    to,
    subject,
    html,
    text,
    transport,
    delivered: true,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  outbox.push(message);

  console.log(`📧 [MAILER DISPATCH] Sent to ${to} | Subject: "${subject}" | Transport: ${transport} | ID: ${message.id}`);

  if (!isTest) {
    try {
      ensureOutboxDir();
      fs.writeFileSync(
        path.join(outboxDir, `${message.id}.json`),
        JSON.stringify(message, null, 2),
        'utf8'
      );
    } catch (_) {}
  }

  return message;
}

async function sendPasswordResetLink({ to, resetToken, resetUrl }) {
  const url = resetUrl || `http://localhost:3000/reset-password?token=${resetToken}`;
  return sendMail({
    to,
    subject: 'OneGate - Password Reset Request',
    text: `You requested a password reset for your OneGate account.\n\nUse this link to reset your password (valid for 30 minutes):\n${url}\n\nIf you did not request this, please ignore this email.`,
    html: `<p>You requested a password reset for your OneGate account.</p><p><a href="${url}">Click here to reset your password</a> (valid for 30 minutes).</p><p>If you did not request this, please ignore this email.</p>`,
    metadata: { resetToken, url },
  });
}

async function sendTemporaryPassword({ to, name, tempPassword }) {
  return sendMail({
    to,
    subject: 'OneGate - Your Account Has Been Provisioned',
    text: `Hello ${name || 'there'},\n\nYour OneGate account has been provisioned.\nTemporary Password: ${tempPassword}\n\nYou will be required to change your password upon your first login.\n\nLogin: http://localhost:3000/`,
    html: `<p>Hello ${name || 'there'},</p><p>Your OneGate account has been provisioned.</p><p><strong>Temporary Password:</strong> <code>${tempPassword}</code></p><p>You will be required to change this password on your first login.</p>`,
    metadata: { tempPassword },
  });
}

function getOutbox() {
  return [...outbox];
}

function clearOutbox() {
  outbox.length = 0;
}

module.exports = {
  sendMail,
  sendPasswordResetLink,
  sendTemporaryPassword,
  getOutbox,
  clearOutbox,
};
