'use strict';

/** Errors safe to show to the user. Anything else is logged and hidden. */
class UserError extends Error {}

const SHEETS = { expenses: 'Expenses', credit: 'credit', people: 'People', loans: 'Loans' };
const IDS = {
  EXP: { prefix: 'EXP', width: 5 },
  CRD: { prefix: 'CRD', width: 4 },
  TN: { prefix: 'TN', width: 4 }
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n, width) {
  let s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/** 'yyyy-MM-dd' -> { iso, serial } where serial is the Google Sheets date number. */
function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  if (!m) throw new UserError('Invalid date.');
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new UserError('Invalid date.');
  }
  return { iso: str, serial: Math.round(ms / 86400000) + 25569 };
}

/** Cell value (sheet serial number or text) -> 'yyyy-MM-dd', or '' if unusable. */
function isoDate(value) {
  if (typeof value === 'number' && isFinite(value) && value > 0) {
    return new Date(Math.floor(value - 25569) * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  return m ? m[1] : '';
}

/** 'yyyy-MM-dd' -> 'dd MMM yyyy' */
function displayDate(iso) {
  const [y, mo, d] = iso.split('-');
  return d + ' ' + MONTHS[Number(mo) - 1] + ' ' + y;
}

function validateAmount(value) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) throw new UserError('Please enter a valid amount greater than 0.');
  return n;
}

function byDateThenIdDesc(dateKey) {
  return function (a, b) {
    if (a[dateKey] !== b[dateKey]) return a[dateKey] < b[dateKey] ? 1 : -1;
    return b.id.localeCompare(a.id, undefined, { numeric: true });
  };
}

module.exports = { UserError, SHEETS, IDS, pad, parseDate, isoDate, displayDate, validateAmount, byDateThenIdDesc };
