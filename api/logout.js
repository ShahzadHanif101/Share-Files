'use strict';
const { setSession } = require('../lib/auth');
module.exports = (req, res) => {
  setSession(req, res, '', 0);
  res.status(200).json({ ok: true });
};
