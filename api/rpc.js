'use strict';
// Single endpoint that replaces google.script.run: POST { fn, args } -> { result } | { error }
const { isAuthed } = require('../lib/auth');
const { UserError } = require('../lib/common');
const fns = Object.assign({}, require('../lib/expenses'), require('../lib/loans'));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!isAuthed(req)) return res.status(401).json({ error: 'Not signed in.' });

  const body = req.body || {};
  if (typeof body.fn !== 'string' || !Object.prototype.hasOwnProperty.call(fns, body.fn)) {
    return res.status(400).json({ error: 'Unknown function.' });
  }
  try {
    const result = await fns[body.fn](...(Array.isArray(body.args) ? body.args : []));
    return res.status(200).json({ result: result === undefined ? null : result });
  } catch (err) {
    if (err instanceof UserError) return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
