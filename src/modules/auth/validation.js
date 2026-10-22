const Joi = require('joi');

const registerSchema = Joi.object({
  full_name: Joi.string().min(3).max(150).required().messages({
    'string.empty': 'الاسم الكامل مطلوب',
    'string.min': 'الاسم يجب أن يكون 3 أحرف على الأقل',
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'البريد الإلكتروني غير صالح',
    'string.empty': 'البريد الإلكتروني مطلوب',
  }),
  phone: Joi.string().min(8).max(20).allow('', null),
  password: Joi.string().min(6).required().messages({
    'string.min': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    'string.empty': 'كلمة المرور مطلوبة',
  }),
  role: Joi.string().valid('client', 'team_leader', 'specialist').required().messages({
    'any.only': 'نوع الحساب غير صالح',
    'any.required': 'نوع الحساب مطلوب',
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'البريد الإلكتروني غير صالح',
    'string.empty': 'البريد الإلكتروني مطلوب',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'كلمة المرور مطلوبة',
  }),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'البريد الإلكتروني غير صالح',
    'string.empty': 'البريد الإلكتروني مطلوب',
  }),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    'string.empty': 'التوكن مطلوب',
  }),
  newPassword: Joi.string().min(6).required().messages({
    'string.min': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    'string.empty': 'كلمة المرور الجديدة مطلوبة',
  }),
});

const verifyEmailSchema = Joi.object({
  token: Joi.string().required().messages({
    'string.empty': 'التوكن مطلوب',
  }),
});

const resendVerificationSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'البريد الإلكتروني غير صالح',
    'string.empty': 'البريد الإلكتروني مطلوب',
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
};