import nodemailer from "nodemailer";

// ── Lazy init ─────────────────────────────────────────────────────────────────
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn("⚠️  SMTP_USER or SMTP_PASS is not configured — email will not be sent.");
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: process.env.SMTP_PORT === "465", // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

const getFromEmail = () =>
  process.env.EMAIL_FROM || "GlowUp Cosmetics <onboarding@resend.dev>";

const FRONTEND_URL = () => process.env.FRONTEND_URL || "http://localhost:5173";

// ── Shared layout ─────────────────────────────────────────────────────────────

async function sendEmailWithRetry(payload: any, maxRetries = 3): Promise<void> {
  const transporter = getTransporter();
  if (process.env.NODE_ENV !== "test") {
    console.log(`[MAIL MOCKED - DISABLED] To: ${payload.to} - Subject: ${payload.subject}`);
    return;
  }

  const mailOptions = {
    from: getFromEmail(),
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await transporter!.sendMail(mailOptions);
      return; // Success
    } catch (err: any) {
      console.error(
        `❌ Email send error (attempt ${attempt}/${maxRetries}) [${payload.subject}]:`,
        err.message,
      );
      if (attempt === maxRetries) {
        console.error(
          `❌ Email sending failed after ${maxRetries} attempts:`,
          payload.subject,
        );
      }
      // Exponential backoff: 1s, 2s, 4s...
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function emailLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
  <html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GlowUp Cosmetics</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#db2777,#9d174d);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                🌸 GlowUp Cosmetics
              </h1>
              <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75);letter-spacing:1px;text-transform:uppercase;">
                Authentic beauty · Safe · Effective
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                © ${new Date().getFullYear()} GlowUp Cosmetics. All rights reserved.<br/>
                123 Nguyen Van Cu, District 5, Ho Chi Minh City
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function primaryBtn(text: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;padding:13px 32px;background:#db2777;color:#ffffff;border-radius:7px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.2px;">
      ${text}
    </a>
  </div>`;
}

// ── 1. Welcome Email ─────────────────────────────────────────────────────────────

export const sendWelcomeEmail = async (
  to: string,
  name: string,
): Promise<void> => {


  const storeLink = FRONTEND_URL();

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Welcome to GlowUp Cosmetics!</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Your customer account has been successfully activated. Next time you shop, sign in for a faster checkout experience.
    </p>
    ${primaryBtn("Visit our store", storeLink)}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      If you have any questions, feel free to contact us at<br/>
      <a href="mailto:support@glowup.com" style="color:#ef4444;text-decoration:none;">support@glowup.com</a>
    </p>`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: "GlowUp Cosmetics - Customer account confirmation",
    html: emailLayout(body),
  });
};

// ── 2. OTP Verification ────────────────────────────────────────────────────────

export const sendOtpVerificationEmail = async (
  to: string,
  otpCode: string,
): Promise<void> => {


  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Account verification code</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Your verification code (OTP) is:
    </p>
    <div style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;padding:16px 32px;background:#f3f4f6;color:#111827;border-radius:8px;font-size:24px;font-weight:800;letter-spacing:4px;border:1px dashed #d1d5db;">
        ${otpCode}
      </span>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      This code is valid for <strong>5 minutes</strong>.<br/>
      If you did not request this code, you can safely ignore this email.
    </p>`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `Your OTP verification code: ${otpCode} — GlowUp Cosmetics`,
    html: emailLayout(body),
  });
};

// ── 2. Reset Password ─────────────────────────────────────────────────────────

export const sendResetPasswordEmail = async (
  to: string,
  resetToken: string,
): Promise<void> => {


  const resetLink = `${FRONTEND_URL()}/reset-password?token=${resetToken}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Reset your password</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      We received a request to reset your account password.<br/>
      Click the button below to create a new password. The link is valid for <strong>1 hour</strong>.
    </p>
    ${primaryBtn("Reset password →", resetLink)}
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      If you did not request this, you can ignore this email.<br/>
      Your password will <strong>not</strong> be changed.
    </p>`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: "Reset your password — GlowUp Cosmetics",
    html: emailLayout(body),
  });
};

// ── 2. Order Confirmed ────────────────────────────────────────────────────────

export const sendOrderSuccessEmail = async (
  to: string,
  orderCode: string,
  totalAmount: number,
): Promise<void> => {
  const orderLink = `${FRONTEND_URL()}/account/orders`;

  const body = `
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600;">Notification: Payment confirmed</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Order confirmed</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Hello,<br/>
      Your order <strong style="color:#db2777;">${orderCode}</strong> has been received and payment was successful (or cash on delivery was selected). Our warehouse team is now processing it.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:13px;color:#6b7280;">Order code</span>
          <strong style="float:right;color:#111827;font-size:14px;">${orderCode}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;">
          <span style="font-size:13px;color:#6b7280;">Total payment</span>
          <strong style="float:right;color:#db2777;font-size:15px;">${totalAmount.toLocaleString("en-US")} ₫</strong>
        </td>
      </tr>
    </table>
    ${primaryBtn("View order details", orderLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `Order confirmation ${orderCode} — GlowUp Cosmetics`,
    html: emailLayout(body),
  });
};

// ── 3. Order Shipped ──────────────────────────────────────────────────────────

export const sendOrderShippedEmail = async (
  to: string,
  orderCode: string,
  trackingCode?: string,
): Promise<void> => {


  const orderLink = `${FRONTEND_URL()}/account/orders`;
  const trackingRow = trackingCode
    ? `<tr>
        <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:13px;color:#6b7280;">Tracking code</span>
          <strong style="float:right;color:#111827;font-size:14px;">${trackingCode}</strong>
        </td>
       </tr>`
    : "";

  const body = `
    <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#1d4ed8;font-weight:600;">🚚 Your order is on the way!</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Order shipped</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Your order <strong style="color:#db2777;">${orderCode}</strong> has been handed over to the carrier and is on its way to your address.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:13px;color:#6b7280;">Order code</span>
          <strong style="float:right;color:#111827;font-size:14px;">${orderCode}</strong>
        </td>
      </tr>
      ${trackingRow}
    </table>
    ${primaryBtn("Track order →", orderLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `🚚 Order #${orderCode} is being delivered — GlowUp Cosmetics`,
    html: emailLayout(body),
  });
};

// ── 4. Order Cancelled ────────────────────────────────────────────────────────

export const sendOrderCancelledEmail = async (
  to: string,
  orderCode: string,
  isPaid: boolean = false,
): Promise<void> => {


  const shopLink = `${FRONTEND_URL()}/`;

  const refundText = isPaid
    ? `<br/>Your refund will be processed within <strong>1-3 business days</strong>.`
    : "";

  const body = `
    <div style="background:#fff7ed;border-left:4px solid #f97316;border-radius:4px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#c2410c;font-weight:600;">🚫 Order cancelled</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Order cancellation notice</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Your order <strong style="color:#db2777;">${orderCode}</strong> has been cancelled.${refundText}
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Sorry for the inconvenience. If you have questions, please contact us at
      <a href="mailto:contact@glowup.com" style="color:#db2777;">contact@glowup.com</a>.
    </p>
    ${primaryBtn("Continue shopping →", shopLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `🚫 Order #${orderCode} cancelled — GlowUp Cosmetics`,
    html: emailLayout(body),
  });
};

// ── 5. Order Returned ────────────────────────────────────────────────────────

export const sendOrderReturnedEmail = async (
  to: string,
  orderCode: string,
): Promise<void> => {


  const shopLink = `${FRONTEND_URL()}/`;

  const body = `
    <div style="background:#f3f4f6;border-left:4px solid #6b7280;border-radius:4px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">📦 Order returned</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Return notice</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Your order <strong style="color:#db2777;">${orderCode}</strong> has been approved for return.<br/>
      If applicable, your refund will be processed within <strong>1-3 business days</strong>.
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Thank you for using our service. If you have questions, please contact us at
      <a href="mailto:contact@glowup.com" style="color:#db2777;">contact@glowup.com</a>.
    </p>
    ${primaryBtn("Continue shopping →", shopLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `📦 Return / refund confirmation for order #${orderCode} — GlowUp Cosmetics`,
    html: emailLayout(body),
  });
};

// ── 6. Order Return Rejected ──────────────────────────────────────────────────

export const sendOrderReturnRejectedEmail = async (
  to: string,
  orderCode: string,
): Promise<void> => {
  const shopLink = `${FRONTEND_URL()}/`;

  const body = `
    <div style="background:#fff1f2;border-left:4px solid #e11d48;border-radius:4px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#9f1239;font-weight:600;">⚠️ Return request rejected</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Return request declined</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Unfortunately, the return request for order <strong style="color:#db2777;">${orderCode}</strong> was not approved.<br/>
      The product may not meet GlowUp Cosmetics' return conditions.
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      If you have questions or need to file a complaint, please contact us directly at
      <a href="mailto:contact@glowup.com" style="color:#db2777;">contact@glowup.com</a>.
    </p>
    ${primaryBtn("View return policy →", shopLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `⚠️ Return request for order #${orderCode} rejected — GlowUp Cosmetics`,
    html: emailLayout(body),
  });
};

// ── 7. Order Completed ──────────────────────────────────────────────────────────

export const sendOrderCompletedEmail = async (
  to: string,
  orderCode: string,
): Promise<void> => {
  const shopLink = `${FRONTEND_URL()}/`;

  const body = `
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600;">✅ Order delivered successfully</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Delivery success notice</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Your order <strong style="color:#db2777;">${orderCode}</strong> was delivered successfully. Thank you for shopping at GlowUp Cosmetics!
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Don't forget to leave a review to unlock more offers.
    </p>
    ${primaryBtn("Review your order →", shopLink + "account/orders")}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `✅ Order #${orderCode} delivered successfully — GlowUp Cosmetics`,
    html: emailLayout(body),
  });
};
