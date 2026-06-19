import sgMail from "@sendgrid/mail";

// Lazy-init
let isSendGridConfigured = false;

function configureSendGrid() {
  if (isSendGridConfigured) return true;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn("⚠️  SENDGRID_API_KEY chưa được cấu hình — email sẽ không được gửi.");
    return false;
  }
  sgMail.setApiKey(apiKey);
  isSendGridConfigured = true;
  return true;
}

const getFromEmail = () => process.env.EMAIL_FROM || "GlowUp Cosmetics <no-reply@glowup.com>";

export const sendResetPasswordEmail = async (
  to: string,
  resetToken: string,
): Promise<void> => {
  if (!configureSendGrid()) return;

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
  const from = getFromEmail();

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="font-size:22px;color:#1a1a1a;margin:0;">🌸 GlowUp Cosmetics</h1>
      </div>
      <h2 style="font-size:18px;color:#1a1a1a;margin-bottom:8px;">Đặt lại mật khẩu</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin-bottom:24px;">
        Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.<br/>
        Nhấn vào nút bên dưới để tạo mật khẩu mới. Link có hiệu lực trong <strong>1 giờ</strong>.
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${resetLink}"
           style="display:inline-block;padding:12px 28px;background:#db2777;color:#fff;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">
          Đặt lại mật khẩu
        </a>
      </div>
      <p style="color:#9ca3af;font-size:12px;line-height:1.6;">
        Nếu bạn không yêu cầu điều này, hãy bỏ qua email này — mật khẩu của bạn sẽ không thay đổi.<br/>
        Link đặt lại: <a href="${resetLink}" style="color:#db2777;">${resetLink}</a>
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      from,
      to,
      subject: "Đặt lại mật khẩu — GlowUp Cosmetics",
      html,
    });
  } catch (err: any) {
    console.error("❌ SendGrid error:", err.response?.body || err.message);
  }
};

export const sendOrderSuccessEmail = async (
  to: string,
  orderCode: string,
  totalAmount: number
): Promise<void> => {
  if (!configureSendGrid()) return;
  const from = getFromEmail();

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;border:1px solid #e5e7eb;border-radius:8px;">
      <h1 style="color:#db2777;">GlowUp Cosmetics</h1>
      <h2>Cảm ơn bạn đã đặt hàng!</h2>
      <p>Đơn hàng <strong>${orderCode}</strong> của bạn đã được tiếp nhận và đang được xử lý.</p>
      <p>Tổng giá trị: <strong>${totalAmount.toLocaleString("vi-VN")}₫</strong></p>
      <p>Chúng tôi sẽ liên hệ với bạn trong thời gian sớm nhất.</p>
    </div>
  `;

  try {
    await sgMail.send({
      from,
      to,
      subject: `Xác nhận đặt hàng #${orderCode} — GlowUp Cosmetics`,
      html,
    });
  } catch (err: any) {
    console.error("❌ SendGrid error:", err.response?.body || err.message);
  }
};

export const sendOrderCancelledEmail = async (
  to: string,
  orderCode: string
): Promise<void> => {
  if (!configureSendGrid()) return;
  const from = getFromEmail();

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;border:1px solid #e5e7eb;border-radius:8px;">
      <h1 style="color:#db2777;">GlowUp Cosmetics</h1>
      <h2>Đơn hàng đã bị hủy</h2>
      <p>Đơn hàng <strong>${orderCode}</strong> của bạn đã được hủy.</p>
      <p>Nếu bạn đã thanh toán, hệ thống sẽ tiến hành hoàn tiền vào tài khoản của bạn trong 1-3 ngày làm việc.</p>
      <p>Xin lỗi vì sự bất tiện này.</p>
    </div>
  `;

  try {
    await sgMail.send({
      from,
      to,
      subject: `Thông báo hủy đơn hàng #${orderCode} — GlowUp Cosmetics`,
      html,
    });
  } catch (err: any) {
    console.error("❌ SendGrid error:", err.response?.body || err.message);
  }
};
