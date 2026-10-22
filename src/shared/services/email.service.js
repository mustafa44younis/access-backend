const nodemailer = require('nodemailer');
const config = require('../../config');

let transporter = null;

const isConfigured = () =>
  Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  return transporter;
};

const buildTemplate = ({ title, body, buttonText, buttonUrl }) => `
  <div dir="rtl" style="font-family: Arial, sans-serif; background:#f5f5f5; padding:32px;">
    <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden;">
      <div style="background:#0a8a2a; padding:24px; text-align:center;">
        <span style="color:#ffffff; font-size:24px; font-weight:bold; letter-spacing:2px;">ACCESS</span>
      </div>
      <div style="padding:32px; color:#1f2937;">
        <h2 style="margin:0 0 16px; font-size:20px;">${title}</h2>
        <p style="margin:0 0 24px; line-height:1.8; color:#4b5563;">${body}</p>
        <div style="text-align:center;">
          <a href="${buttonUrl}" style="display:inline-block; background:#0a8a2a; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:bold;">${buttonText}</a>
        </div>
        <p style="margin:24px 0 0; font-size:12px; color:#9ca3af; word-break:break-all;">${buttonUrl}</p>
      </div>
      <div style="background:#f9fafb; padding:16px; text-align:center; font-size:12px; color:#9ca3af;">
        © ${new Date().getFullYear()} ACCESS. جميع الحقوق محفوظة.
      </div>
    </div>
  </div>
`;

const sendMail = async ({ to, subject, html, text }) => {
  if (!isConfigured()) {
    if (config.nodeEnv === 'production') {
      throw new Error('إعدادات البريد الإلكتروني غير مكتملة');
    }

    console.log(`📧 [DEV EMAIL] إلى: ${to} | الموضوع: ${subject}`);
    if (text) console.log(text);
    return { dev: true };
  }

  return getTransporter().sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text,
  });
};

const sendVerificationEmail = async ({ to, fullName, token }) => {
  const verificationUrl = `${config.app.frontendUrl}/verify-email?token=${token}`;

  return sendMail({
    to,
    subject: 'تفعيل حسابك في ACCESS',
    text: `مرحباً ${fullName}،\nلتفعيل حسابك في ACCESS يرجى زيارة الرابط التالي:\n${verificationUrl}`,
    html: buildTemplate({
      title: `مرحباً ${fullName}`,
      body: 'تم إنشاء حسابك في ACCESS بنجاح. يرجى تأكيد بريدك الإلكتروني لتفعيل حسابك والبدء في استخدام المنصة.',
      buttonText: 'تفعيل الحساب',
      buttonUrl: verificationUrl,
    }),
  });
};

const sendPasswordResetEmail = async ({ to, fullName, token }) => {
  const resetUrl = `${config.app.frontendUrl}/reset-password?token=${token}`;

  return sendMail({
    to,
    subject: 'إعادة تعيين كلمة المرور - ACCESS',
    text: `مرحباً ${fullName}،\nلإعادة تعيين كلمة المرور يرجى زيارة الرابط التالي (صالح لمدة 15 دقيقة):\n${resetUrl}`,
    html: buildTemplate({
      title: `مرحباً ${fullName}`,
      body: 'وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك. الرابط صالح لمدة 15 دقيقة. إذا لم تكن أنت من طلب ذلك، يمكنك تجاهل هذه الرسالة.',
      buttonText: 'إعادة تعيين كلمة المرور',
      buttonUrl: resetUrl,
    }),
  });
};

module.exports = {
  isConfigured,
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
