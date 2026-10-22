const config = require('../../config');
const oauthService = require('./oauth.service');

const redirectToFailure = (res, message) => {
  const url = new URL(config.oauth.failureRedirect);
  url.searchParams.set('error', message || 'فشل تسجيل الدخول');
  return res.redirect(url.toString());
};

const start = (provider) => (req, res) => {
  try {
    const authorizationUrl = oauthService.buildAuthorizationUrl(provider, req.query.role);
    return res.redirect(authorizationUrl);
  } catch (err) {
    if (err.statusCode === 503) {
      return res.status(503).json({
        success: false,
        message: err.message,
      });
    }

    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'حدث خطأ في السيرفر',
    });
  }
};

const callback = (provider) => async (req, res) => {
  try {
    if (req.query.error) {
      return redirectToFailure(res, 'تم إلغاء تسجيل الدخول');
    }

    const data = await oauthService.handleCallback({
      provider,
      code: req.query.code,
      state: req.query.state,
    });

    const redirectUrl = new URL(config.oauth.successRedirect);
    redirectUrl.searchParams.set('token', data.token);
    if (data.isNew) {
      redirectUrl.searchParams.set('new', '1');
    }

    return res.redirect(redirectUrl.toString());
  } catch (err) {
    return redirectToFailure(res, err.message);
  }
};

module.exports = {
  google: start('google'),
  googleCallback: callback('google'),
  linkedin: start('linkedin'),
  linkedinCallback: callback('linkedin'),
};
