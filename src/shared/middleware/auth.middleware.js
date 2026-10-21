const jwt = require('jsonwebtoken');
const config = require('../../config');
const db = require('../../config/db');

const protect = async (req, res, next) => {
  try {
    let token;

    // استخراج التوكن من الـ Header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرح، يرجى تسجيل الدخول',
      });
    }

    // التحقق من صحة التوكن
    const decoded = jwt.verify(token, config.jwt.secret);

    // جلب بيانات المستخدم من قاعدة البيانات
    const result = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'المستخدم غير موجود',
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'هذا الحساب موقوف',
      });
    }

    // إضافة بيانات المستخدم للـ request
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'توكن غير صالح أو منتهي الصلاحية',
    });
  }
};

// Middleware للتحقق من الأدوار
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      });
    }
    next();
  };
};

module.exports = {
  protect,
  restrictTo,
};