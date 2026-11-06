const crypto = require('crypto');

/**
 * توليد مفتاح سري عشوائي بتنسيق Base32 متوافق مع تطبيقات المصادقة
 * (Google Authenticator, 1Password, Authy)
 */
const generateSecret = (length = 20) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += chars[randomBytes[i] % chars.length];
  }
  return secret;
};

/**
 * توليد رابط OTPAuth القياسي لربط التطبيق
 */
const generateOtpAuthUrl = (email, secret, issuer = 'ACCESS') => {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
};

/**
 * توليد رابط QR Code للعرض في الواجهة عبر qrserver.com
 */
const generateQrCodeUrl = (otpAuthUrl) => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(otpAuthUrl)}&format=svg`;
};

/**
 * فك تشفير Base32 → Buffer
 */
const base32ToBuffer = (base32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32.toUpperCase().replace(/=/g, '')) {
    const val = chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
};

/**
 * توليد رمز TOTP لحظة بعينها (counter)
 */
const generateTOTP = (secret, counter) => {
  const keyBuffer = base32ToBuffer(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', keyBuffer);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 1_000_000).toString().padStart(6, '0');
};

/**
 * التحقق من كود TOTP المُدخل (نافذة ±1 خطوة = 90 ثانية تسامح)
 * لا يقبل أي كود احتيالي ثابت مثل 123456
 */
const verifyOtpCode = (secret, code) => {
  if (!code || typeof code !== 'string') return false;
  const cleanCode = code.replace(/\s+/g, '');
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) return false;

  try {
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = 30;

    // نافذة -1، 0، +1 خطوة (90 ثانية كاملة تسامح)
    for (let i = -1; i <= 1; i++) {
      const counter = Math.floor(epoch / timeStep) + i;
      const otp = generateTOTP(secret, counter);
      // مقارنة ثابتة الوقت لمنع هجمات timing
      if (crypto.timingSafeEqual(Buffer.from(otp), Buffer.from(cleanCode))) {
        return true;
      }
    }
  } catch (_) {
    return false;
  }

  return false;
};

/**
 * التحقق من رمز استرداد احتياطي
 * يُعيد true إذا وُجد، ويُرجع الكود المستهلك لحذفه من القائمة
 */
const verifyBackupCode = (backupCodes, inputCode) => {
  if (!Array.isArray(backupCodes) || !inputCode) return { valid: false };
  const clean = inputCode.trim().toUpperCase();
  const idx = backupCodes.findIndex(
    (c) => c.trim().toUpperCase() === clean
  );
  if (idx === -1) return { valid: false };
  return { valid: true, usedIndex: idx };
};

/**
 * توليد 8 رموز استرداد احتياطية بتنسيق XXXX-XXXX
 */
const generateBackupCodes = (count = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes = [];
  for (let i = 0; i < count; i++) {
    const part1 = Array.from(crypto.randomBytes(4))
      .map((b) => chars[b % chars.length])
      .join('');
    const part2 = Array.from(crypto.randomBytes(4))
      .map((b) => chars[b % chars.length])
      .join('');
    codes.push(`${part1}-${part2}`);
  }
  return codes;
};

module.exports = {
  generateSecret,
  generateOtpAuthUrl,
  generateQrCodeUrl,
  generateBackupCodes,
  verifyOtpCode,
  verifyBackupCode,
};
