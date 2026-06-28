import nodemailer from "nodemailer";

// ── Lazy init ─────────────────────────────────────────────────────────────────
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn("⚠️  SMTP_USER hoặc SMTP_PASS chưa được cấu hình — email sẽ không được gửi.");
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
  if (!transporter) return;

  const mailOptions = {
    from: getFromEmail(),
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      return; // Success
    } catch (err: any) {
      console.error(
        `❌ Lỗi gửi email (lần ${attempt}/${maxRetries}) [${payload.subject}]:`,
        err.message,
      );
      if (attempt === maxRetries) {
        console.error(
          `🚨 Thất bại gửi email sau ${maxRetries} lần thử tới:`,
          payload.to,
        );
        return;
      }
      // Exponential backoff: 1s, 2s, 4s...
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function emailLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
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
                Làm đẹp chính hãng · An toàn · Hiệu quả
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
                © ${new Date().getFullYear()} GlowUp Cosmetics. Mọi quyền được bảo lưu.<br/>
                123 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh
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
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Chào mừng bạn đến với GlowUp Cosmetics!</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Chúc mừng bạn đã kích hoạt tài khoản khách hàng thành công. Lần mua hàng tiếp theo, hãy đăng nhập để việc thanh toán thuận tiện hơn.
    </p>
    ${primaryBtn("Đến cửa hàng của chúng tôi", storeLink)}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      Nếu bạn có bất cứ câu hỏi nào, đừng ngần ngại liên lạc với chúng tôi tại<br/>
      <a href="mailto:support@glowup.com" style="color:#ef4444;text-decoration:none;">support@glowup.com</a>
    </p>`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: "GlowUp Cosmetics - Xác nhận tài khoản khách hàng",
    html: emailLayout(body),
  });
};

// ── 2. OTP Verification ────────────────────────────────────────────────────────

export const sendOtpVerificationEmail = async (
  to: string,
  otpCode: string,
): Promise<void> => {


  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Mã xác thực tài khoản</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Mã xác thực (OTP) của bạn là:
    </p>
    <div style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;padding:16px 32px;background:#f3f4f6;color:#111827;border-radius:8px;font-size:24px;font-weight:800;letter-spacing:4px;border:1px dashed #d1d5db;">
        ${otpCode}
      </span>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      Mã này có hiệu lực trong <strong>5 phút</strong>.<br/>
      Nếu bạn không yêu cầu mã này, hãy bỏ qua email này.
    </p>`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `Mã OTP xác thực của bạn: ${otpCode} — GlowUp Cosmetics`,
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
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Đặt lại mật khẩu</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.<br/>
      Nhấn vào nút bên dưới để tạo mật khẩu mới. Link có hiệu lực trong <strong>1 giờ</strong>.
    </p>
    ${primaryBtn("Đặt lại mật khẩu →", resetLink)}
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.<br/>
      Mật khẩu của bạn sẽ <strong>không</strong> bị thay đổi.
    </p>`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: "Đặt lại mật khẩu — GlowUp Cosmetics",
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
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600;">Thông báo: Xác nhận thanh toán thành công</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Đơn hàng đã được xác nhận</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Xin chào quý khách,<br/>
      Hệ thống đã xác nhận đơn hàng <strong style="color:#db2777;">${orderCode}</strong> của quý khách đã được tiếp nhận và thanh toán thành công (hoặc áp dụng phương thức thanh toán khi nhận hàng). Đơn hàng đang được bộ phận kho xử lý.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:13px;color:#6b7280;">Mã đơn hàng</span>
          <strong style="float:right;color:#111827;font-size:14px;">${orderCode}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;">
          <span style="font-size:13px;color:#6b7280;">Tổng thanh toán</span>
          <strong style="float:right;color:#db2777;font-size:15px;">${totalAmount.toLocaleString("vi-VN")}₫</strong>
        </td>
      </tr>
    </table>
    ${primaryBtn("Xem chi tiết đơn hàng", orderLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `Thông báo xác nhận đơn hàng ${orderCode} — GlowUp Cosmetics`,
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
          <span style="font-size:13px;color:#6b7280;">Mã vận đơn</span>
          <strong style="float:right;color:#111827;font-size:14px;">${trackingCode}</strong>
        </td>
       </tr>`
    : "";

  const body = `
    <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#1d4ed8;font-weight:600;">🚚 Đơn hàng đang trên đường đến bạn!</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Đơn hàng đã được giao vận</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Đơn hàng <strong style="color:#db2777;">${orderCode}</strong> của bạn đã được bàn giao cho đơn vị vận chuyển
      và đang trên đường đến địa chỉ của bạn.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:13px;color:#6b7280;">Mã đơn hàng</span>
          <strong style="float:right;color:#111827;font-size:14px;">${orderCode}</strong>
        </td>
      </tr>
      ${trackingRow}
    </table>
    ${primaryBtn("Theo dõi đơn hàng →", orderLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `🚚 Đơn hàng #${orderCode} đang được giao — GlowUp Cosmetics`,
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
    ? `<br/>Hệ thống sẽ tiến hành hoàn tiền cho quý khách trong <strong>1–3 ngày làm việc</strong>.`
    : "";

  const body = `
    <div style="background:#fff7ed;border-left:4px solid #f97316;border-radius:4px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#c2410c;font-weight:600;">🚫 Đơn hàng đã bị hủy</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Thông báo hủy đơn hàng</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Đơn hàng <strong style="color:#db2777;">${orderCode}</strong> của bạn đã được hủy.${refundText}
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Xin lỗi vì sự bất tiện này. Nếu bạn có thắc mắc, vui lòng liên hệ với chúng tôi qua
      <a href="mailto:contact@glowup.com" style="color:#db2777;">contact@glowup.com</a>.
    </p>
    ${primaryBtn("Tiếp tục mua sắm →", shopLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `🚫 Đơn hàng #${orderCode} đã bị hủy — GlowUp Cosmetics`,
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
      <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">📦 Đơn hàng đã được hoàn trả</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Thông báo hoàn trả đơn hàng</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Đơn hàng <strong style="color:#db2777;">${orderCode}</strong> của bạn đã được xác nhận hoàn trả.<br/>
      Hệ thống sẽ tiến hành hoàn tiền (nếu có) cho quý khách trong <strong>1–3 ngày làm việc</strong>.
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Xin cảm ơn bạn đã sử dụng dịch vụ. Nếu bạn có thắc mắc, vui lòng liên hệ với chúng tôi qua
      <a href="mailto:contact@glowup.com" style="color:#db2777;">contact@glowup.com</a>.
    </p>
    ${primaryBtn("Tiếp tục mua sắm →", shopLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `📦 Xác nhận trả hàng / hoàn tiền cho đơn #${orderCode} — GlowUp Cosmetics`,
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
      <p style="margin:0;font-size:14px;color:#9f1239;font-weight:600;">⚠️ Yêu cầu trả hàng bị từ chối</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Thông báo từ chối yêu cầu trả hàng</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Rất tiếc, yêu cầu trả hàng cho đơn <strong style="color:#db2777;">${orderCode}</strong> của bạn không được chấp thuận.<br/>
      Sản phẩm có thể không thỏa mãn điều kiện đổi trả của GlowUp Cosmetics.
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Nếu bạn có thắc mắc hoặc cần khiếu nại, vui lòng liên hệ trực tiếp với chúng tôi qua
      <a href="mailto:contact@glowup.com" style="color:#db2777;">contact@glowup.com</a>.
    </p>
    ${primaryBtn("Xem chính sách đổi trả →", shopLink)}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `⚠️ Yêu cầu trả hàng cho đơn #${orderCode} bị từ chối — GlowUp Cosmetics`,
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
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600;">✅ Đơn hàng đã giao thành công</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Thông báo giao hàng thành công</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Đơn hàng <strong style="color:#db2777;">${orderCode}</strong> của bạn đã được giao thành công. Cảm ơn bạn đã mua sắm tại GlowUp Cosmetics!
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
      Đừng quên để lại đánh giá về sản phẩm để nhận thêm nhiều ưu đãi nhé.
    </p>
    ${primaryBtn("Xem lại đơn hàng và đánh giá →", shopLink + "account/orders")}`;

  await sendEmailWithRetry({
    from: getFromEmail(),
    to,
    subject: `✅ Đơn hàng #${orderCode} đã giao thành công — GlowUp Cosmetics`,
    html: emailLayout(body),
  });
};
