// middleware/auth.js

function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {

    req.user = {
      user_id: req.session.userId,
      role: req.session.userRole
    };

    return next();
  }

  // API request
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Page request
  return res.redirect('/login');
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.userRole === 'ADMIN') {

    req.user = {
      user_id: req.session.userId,
      role: req.session.userRole
    };
console.log('Session role:', req.session.userRole);
    return next();
  }

  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  if (req.session && req.session.userId) {
    return res.status(403).send('Access denied. Admin privileges required.');
  }

  return res.redirect('/login');
}

function ensureCustomer(req, res, next) {
  if (req.session && req.session.userId && req.session.userRole === 'customer') {

    req.user = {
      user_id: req.session.userId,
      role: req.session.userRole
    };

    return next();
  }

  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(403).json({
      success: false,
      message: 'Customer access required'
    });
  }

  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }

  return res.redirect('/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    const redirectUrl =
      req.session.userRole === 'admin' ? '/dashboard' : '/menu';
    return res.redirect(redirectUrl);
  }
  return next();
}

module.exports = {
  ensureAuthenticated,
  ensureAdmin,
  ensureCustomer,
  redirectIfAuthenticated
};