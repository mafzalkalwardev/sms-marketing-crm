async function sendEmail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'noreply@signalmint.local';

  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html: html || text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend email failed: ${body}`);
    }
    return { ok: true, channel: 'resend' };
  }

  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transporter.sendMail({ from, to, subject, text, html: html || text });
    return { ok: true, channel: 'smtp' };
  }

  if (process.env.NODE_ENV !== 'production' || process.env.OTP_LOG_TO_CONSOLE === 'true') {
    console.log(`[email:dev] To: ${to} | ${subject}\n${text}`);
    return { ok: true, channel: 'console' };
  }

  throw new Error('Email is not configured (set RESEND_API_KEY or SMTP_HOST)');
}

module.exports = { sendEmail };
