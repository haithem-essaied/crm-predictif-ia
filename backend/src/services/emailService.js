/**
 * emailService.js — Send lead follow-up emails via nodemailer.
 *
 * Priority:
 *   1. Real SMTP  — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env
 *   2. Ethereal   — auto-created test account (emails captured, viewable via URL)
 *
 * Returns { success, messageId, previewUrl } on success.
 */

import nodemailer from "nodemailer";

let _transporter = null;
let _fromAddress  = null;

// ── transporter singleton ────────────────────────────────────────────────────

async function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.SMTP_HOST) {
    // Real SMTP (Gmail, Mailtrap, SendGrid, etc.)
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    _fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
    console.log("[Email] Using real SMTP:", process.env.SMTP_HOST);
  } else {
    // Ethereal test account — auto-created, no config needed
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host:   "smtp.ethereal.email",
      port:   587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    _fromAddress = `"CRM IA — Sierra Bravo" <${testAccount.user}>`;
    console.log("[Email] Ethereal test account:", testAccount.user);
  }

  return _transporter;
}

// ── email template ───────────────────────────────────────────────────────────

function buildTemplate({ leadName, score, conversionPct, reason }) {
  return {
    subject: `Action requise : ${leadName} — Score IA ${score}`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
  .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
  .header  { background: #1a1f2e; color: #fff; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header span { font-size: 13px; color: #8892b0; }
  .body { padding: 28px 32px; }
  .kpi-row { display: flex; gap: 16px; margin: 20px 0; }
  .kpi { flex: 1; background: #f9fafb; border-radius: 8px; padding: 14px; text-align: center; }
  .kpi .val { font-size: 28px; font-weight: 700; color: #6366f1; }
  .kpi .lbl { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .reason { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 14px; color: #374151; }
  .cta { display: inline-block; margin-top: 20px; padding: 12px 28px; background: #6366f1; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
  .footer { padding: 16px 32px; background: #f9fafb; font-size: 12px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>◈ CRM IA — Alerte de relance</h1>
    <span>Sierra Bravo Intelligence</span>
  </div>
  <div class="body">
    <p style="font-size:15px;color:#1a1f2e;">Bonjour,</p>
    <p style="font-size:14px;color:#374151;">
      Le lead <strong>${leadName}</strong> nécessite votre attention.
    </p>
    <div class="kpi-row">
      <div class="kpi">
        <div class="val">${score}</div>
        <div class="lbl">Score IA</div>
      </div>
      <div class="kpi">
        <div class="val">${conversionPct}%</div>
        <div class="lbl">Prob. Conversion</div>
      </div>
    </div>
    <div class="reason">
      <strong>Raison :</strong> ${reason}
    </div>
    <p style="font-size:13px;color:#6b7280;">
      Consultez la fiche de ce lead dans le CRM pour planifier une action de relance.
    </p>
  </div>
  <div class="footer">CRM Intelligent — Sierra Bravo Intelligence &nbsp;·&nbsp; Email généré automatiquement</div>
</div>
</body>
</html>`,
  };
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.to              recipient email
 * @param {string} opts.leadName        full name
 * @param {number} opts.score           current AI score
 * @param {number} opts.conversionProb  0-1 probability
 * @param {string} opts.reason          why this email is being sent
 */
export async function sendLeadEmail({ to, leadName, score, conversionProb, reason }) {
  try {
    const transporter = await getTransporter();
    const conversionPct = (conversionProb * 100).toFixed(1);
    const { subject, html } = buildTemplate({ leadName, score, conversionPct, reason });

    const info = await transporter.sendMail({
      from:    _fromAddress,
      to,
      subject,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    if (previewUrl) {
      console.log(`[Email] Preview: ${previewUrl}`);
    }

    return {
      success:    true,
      messageId:  info.messageId,
      previewUrl,
    };
  } catch (err) {
    console.error("[Email] Send failed:", err.message);
    return { success: false, error: err.message };
  }
}
