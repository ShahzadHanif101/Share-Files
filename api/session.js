'use strict';
const { isAuthed } = require('../lib/auth');
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(isAuthed(req) ? 200 : 401).json({ ok: isAuthed(req) });
};
