/**
 * Server-side transactional email sending.
 *
 * The Resend API key lives ONLY here (server environment) — it must never be
 * exposed to the browser. The client calls POST /api/email and the endpoint
 * in api/index.ts funnels requests into sendEmail() below.
 */
import { Resend } from 'resend';

export type EmailType =
  | 'welcome'
  | 'signInAlert'
  | 'trialEnding'
  | 'paymentSuccess'
  | 'paymentFailed'
  | 'subscriptionCancelled'
  | 'passwordReset'
  | 'emailVerification';

export interface EmailParams {
  name?: string;
  timestamp?: string;
  location?: string;
  device?: string;
  trialEnds?: string;
  daysRemaining?: number;
  amount?: string;
  plan?: string;
  nextBilling?: string;
  lastAttempt?: string;
  effectiveDate?: string;
  resetLink?: string;
  verificationLink?: string;
  expiresIn?: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
}

const CURRENT_YEAR = new Date().getFullYear();

/** Shared HTML shell so every template stays on-brand without duplicating CSS. */
function shell(title: string, content: string): string {
  return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 40px 0; border-bottom: 1px solid #eee; }
        .content { padding: 40px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .alert { padding: 15px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AuraMind</h1>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>&copy; ${CURRENT_YEAR} AuraMind. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>`;
}

function alertBlock(style: string, heading: string): string {
  return `<div class="alert" style="border-left: 4px solid ${style}; background: #f8f9fa; padding: 15px; margin: 20px 0;">
    <h2 style="margin-top: 0;">${heading}</h2>
  </div>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" class="button">${label}</a>`;
}

function para(text: string): string {
  return `<p>${text}</p>`;
}

function renderEmail(type: EmailType, p: EmailParams, origin: string): RenderedEmail {
  const name = p.name || 'there';
  const appUrl = origin.replace(/\/$/, '');

  switch (type) {
    case 'welcome':
      return {
        subject: 'Welcome to AuraMind! Your account is ready',
        html: shell('Welcome to AuraMind', `
          ${para(`Hi ${name},`)}
          ${para('Thanks for signing up! Your account is ready to go.')}
          <p><strong>Here's how to get started:</strong></p>
          <ol>
            <li>Click the button below to go to your dashboard</li>
            <li>Create your first deck of flashcards</li>
            <li>Start studying with our smart review system</li>
          </ol>
          <p><strong>What makes AuraMind different:</strong></p>
          <ul>
            <li><strong>AI-powered:</strong> Turn any text into flashcards instantly</li>
            <li><strong>Smart review:</strong> We show you cards at the right time</li>
            <li><strong>Track progress:</strong> See how much you've learned</li>
          </ul>
          ${button(`${appUrl}/dashboard`, 'Go to Dashboard')}
          ${para('<strong>Need help?</strong> Just reply to this email and we\'ll assist you.')}
        `),
      };

    case 'signInAlert':
      return {
        subject: 'New sign-in to your AuraMind account',
        html: shell('New Sign In to AuraMind', `
          ${alertBlock('#ffc107', 'New sign-in detected')}
          ${para(`Hi ${name},`)}
          ${para('Someone just signed into your AuraMind account. Here are the details:')}
          <ul>
            <li><strong>When:</strong> ${p.timestamp || 'unknown'}</li>
            ${p.location ? `<li><strong>Where:</strong> ${p.location}</li>` : ''}
            ${p.device ? `<li><strong>Device:</strong> ${p.device}</li>` : ''}
          </ul>
          <p><strong>Was this you?</strong></p>
          <p>If yes, you can ignore this email. Your account is secure.</p>
          <p><strong>If this wasn't you:</strong></p>
          <p>Someone else has access to your account. Please change your password immediately to protect your data.</p>
        `),
      };

    case 'trialEnding':
      return {
        subject: `Your free trial ends in ${p.daysRemaining ?? ''} days`,
        html: shell('Your AuraMind Trial is Ending', `
          ${alertBlock('#ffc107', 'Your free trial is ending soon')}
          ${para(`Hi ${name},`)}
          ${para(`Your free trial ends in <strong>${p.daysRemaining ?? 'a few'} days</strong> on ${p.trialEnds || 'the end date'}.`)}
          <p><strong>What happens when your trial ends:</strong></p>
          <p>You'll lose access to premium features like unlimited flashcard generation and advanced study tools.</p>
          <p><strong>Keep your access:</strong></p>
          <p>Upgrade to a paid plan to continue using all features without interruption.</p>
          ${button(`${appUrl}/subscribe`, 'Upgrade Now')}
          ${para('<strong>Questions?</strong> Reply to this email and we\'ll help you out.')}
        `),
      };

    case 'paymentSuccess':
      return {
        subject: 'Payment successful - Your AuraMind subscription is active',
        html: shell('Payment Successful - AuraMind', `
          ${alertBlock('#28a745', 'Payment successful')}
          ${para(`Hi ${name},`)}
          ${para('Great news! Your payment went through successfully.')}
          <p><strong>Payment details:</strong></p>
          <ul>
            <li>Amount: ${p.amount || '—'}</li>
            <li>Plan: ${p.plan || '—'}</li>
            <li>Next billing date: ${p.nextBilling || '—'}</li>
          </ul>
          <p><strong>Your subscription is now active.</strong> You can start using all premium features right away.</p>
          <a href="${appUrl}/dashboard" style="color: #000; font-weight: bold;">Go to Dashboard →</a>
          ${para('Thanks for being a valued member of AuraMind!')}
        `),
      };

    case 'paymentFailed':
      return {
        subject: 'Payment failed - Please update your payment method',
        html: shell('Payment Failed - AuraMind', `
          ${alertBlock('#dc3545', 'Payment failed')}
          ${para(`Hi ${name},`)}
          ${para(`We couldn't process your payment of ${p.amount || '—'} on ${p.lastAttempt || 'our latest attempt'}.`)}
          <p><strong>Why this might have happened:</strong></p>
          <ul>
            <li>Not enough money in your account</li>
            <li>Your card has expired</li>
            <li>Your bank declined the transaction</li>
          </ul>
          <p><strong>What you need to do:</strong></p>
          <p>Update your payment method to keep your subscription active. If you don't, you'll lose access to premium features.</p>
          ${button(`${appUrl}/subscribe`, 'Update Payment Method')}
          ${para('<strong>Need help?</strong> Reply to this email and we\'ll assist you.')}
        `),
      };

    case 'subscriptionCancelled':
      return {
        subject: 'Your AuraMind subscription has been cancelled',
        html: shell('Subscription Cancelled - AuraMind', `
          ${alertBlock('#6c757d', 'Subscription cancelled')}
          ${para(`Hi ${name},`)}
          ${para(`Your ${p.plan || 'current'} subscription has been cancelled.`)}
          <p><strong>What this means:</strong></p>
          <p>You'll still have access to all features until ${p.effectiveDate || 'the end of your billing period'}. After that date, your account will switch to the free plan.</p>
          <p><strong>Want to keep your subscription?</strong></p>
          <p>You can reactivate it anytime before or after the cancellation date.</p>
          ${button(`${appUrl}/subscribe`, 'Reactivate Subscription')}
          ${para('Thanks for trying AuraMind. We hope to see you again!')}
        `),
      };

    case 'passwordReset':
      return {
        subject: 'Reset your AuraMind password',
        html: shell('Reset Your Password - AuraMind', `
          ${alertBlock('#ffc107', 'Reset your password')}
          ${para(`Hi ${name},`)}
          ${para('We received a request to reset your password for your AuraMind account.')}
          <p><strong>To reset your password:</strong></p>
          <p>Click the button below. This will take you to a page where you can create a new password.</p>
          ${button(p.resetLink || `${appUrl}/auth/forgot-password`, 'Reset Password')}
          <p><strong>Important:</strong> This link expires in ${p.expiresIn || 'a short time'}. After that, you'll need to request a new password reset.</p>
          <p><strong>Didn't request this?</strong></p>
          <p>If you didn't ask to reset your password, you can safely ignore this email. Your account is still secure.</p>
        `),
      };

    case 'emailVerification':
      return {
        subject: 'Verify your email address',
        html: shell('Verify Your Email - AuraMind', `
          ${alertBlock('#17a2b8', 'Verify your email address')}
          ${para(`Hi ${name},`)}
          ${para('Please verify your email to complete your AuraMind account setup.')}
          <p><strong>Why verify your email?</strong></p>
          <p>Verifying your email helps us:</p>
          <ul>
            <li>Keep your account secure</li>
            <li>Send you important updates about your account</li>
            <li>Recover your account if you forget your password</li>
          </ul>
          <p><strong>To verify your email:</strong></p>
          <p>Click the button below. It only takes a second.</p>
          ${button(p.verificationLink || `${appUrl}/auth/callback`, 'Verify Email')}
          <p><strong>Didn't create an account?</strong></p>
          <p>If you didn't sign up for AuraMind, you can safely ignore this email.</p>
        `),
      };

    default:
      // Exhaustive — EmailType is closed; this branch is unreachable.
      return { subject: '', html: '' };
  }
}

export interface EmailSendResult {
  success: boolean;
  error?: string;
}

export async function sendEmail(
  type: EmailType,
  to: string,
  params: EmailParams,
  origin?: string,
): Promise<EmailSendResult> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { success: false, error: 'Email service not configured' };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'noreply@mail.auramind.app';
  const appOrigin = origin || process.env.NEXT_PUBLIC_APP_URL || 'https://auramind.app';
  const { subject, html } = renderEmail(type, params, appOrigin);

  if (!subject) {
    return { success: false, error: `Unknown email type: ${type}` };
  }

  try {
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      const message = typeof error.message === 'string' ? error.message : 'Resend rejected the email';
      return { success: false, error: message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email send failed',
    };
  }
}

/** Escape admin-composed text before embedding it in the shared HTML shell. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Free-form send for the admin bulk-email endpoint. Unlike sendEmail (fixed
 * templates), the subject/body are admin-composed: the body is treated as
 * plain text (blank lines become paragraphs) and HTML-escaped so markup in
 * the input cannot break the shell or inject content.
 */
export async function sendCustomEmail(
  to: string,
  subject: string,
  textBody: string,
): Promise<EmailSendResult> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { success: false, error: 'Email service not configured' };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'noreply@mail.auramind.app';
  const paragraphs = textBody
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  const html = shell(escapeHtml(subject), paragraphs || '<p></p>');

  try {
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      const message = typeof error.message === 'string' ? error.message : 'Resend rejected the email';
      return { success: false, error: message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email send failed',
    };
  }
}
