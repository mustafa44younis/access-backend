const authService = require('./auth.service');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} = require('./validation');

const register = async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صالحة',
        errors: error.details.map((err) => err.message),
      });
    }

    const data = await authService.register(value);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      data,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'حدث خطأ في السيرفر',
    });
  }
};

const login = async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صالحة',
        errors: error.details.map((err) => err.message),
      });
    }

    const data = await authService.login(value, {
      userAgent: req.headers['user-agent'] || 'متصفح ويب',
      ip: req.ip || req.connection?.remoteAddress || '127.0.0.1',
    });

    if (data.requires_2fa) {
      return res.status(200).json({
        success: true,
        requires_2fa: true,
        message: data.message,
      });
    }

    res.status(200).json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      data,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'حدث خطأ في السيرفر',
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { error, value } = forgotPasswordSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صالحة',
        errors: error.details.map((err) => err.message),
      });
    }

    const data = await authService.forgotPassword(value.email);

    res.status(200).json({
      success: true,
      message: data.message,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'حدث خطأ في السيرفر',
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صالحة',
        errors: error.details.map((err) => err.message),
      });
    }

    const data = await authService.resetPassword(value);

    res.status(200).json({
      success: true,
      message: data.message,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'حدث خطأ في السيرفر',
    });
  }
};
const verifyEmail = async (req, res) => {
  try {
    const { error, value } = verifyEmailSchema.validate({
      token: req.body?.token || req.query.token,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صالحة',
        errors: error.details.map((err) => err.message),
      });
    }

    const data = await authService.verifyEmail(value);

    res.status(200).json({
      success: true,
      message: data.message,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'حدث خطأ في السيرفر',
    });
  }
};


const resendVerification = async (req, res) => {
  try {
    const { error, value } = resendVerificationSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صالحة',
        errors: error.details.map((err) => err.message),
      });
    }

    const data = await authService.resendVerification(value.email);

    res.status(200).json({
      success: true,
      message: data.message,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'حدث خطأ في السيرفر',
    });
  }
};

// الحصول على بيانات المستخدم الحالي
const getMe = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في السيرفر',
    });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getMe
};