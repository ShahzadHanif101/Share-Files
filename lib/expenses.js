'use strict';
const S = require('./sheets');
const C = require('./common');

const TYPES = {
  expense: { sheet: C.SHEETS.expenses, key: 'EXP' },
  income: { sheet: C.SHEETS.credit, key: 'CRD' }
};

function typeFromId(id) {
  const prefix = String(id || '').split('-')[0];
  if (prefix === 'EXP') return 'expense';
  if (prefix === 'CRD') return 'income';
  throw new C.UserError('Invalid transaction id.');
}

/** Both tabs combined, newest first. */
async function exp_getTransactions() {
  const types = Object.keys(TYPES);
  const tabs = await Promise.all(types.map((t) => S.loadRows(TYPES[t].sheet, TYPES[t].key, 5)));
  const result = [];
  tabs.forEach((rows, i) => {
    rows.forEach((row) => {
      if (!row[2] && !row[4]) return; // neither description nor amount
      result.push({
        id: String(row[0]),
        date: C.isoDate(row[1]),
        description: String(row[2] || ''),
        notes: String(row[3] || ''),
        amount: Number(row[4]) || 0,
        type: types[i]
      });
    });
  });
  result.sort(C.byDateThenIdDesc('date'));
  return result;
}

function validate(tx) {
  if (!tx || !String(tx.description || '').trim()) throw new C.UserError('Please enter a description.');
  if (!TYPES[tx.type]) throw new C.UserError('Invalid transaction type.');
  return {
    date: C.parseDate(tx.date).serial,
    description: String(tx.description).trim(),
    notes: String(tx.notes || '').trim(),
    amount: C.validateAmount(tx.amount)
  };
}

async function exp_add(tx) {
  const v = validate(tx);
  const cfg = TYPES[tx.type];
  const id = (await S.reserveIds(cfg.key, cfg.sheet, 1))[0];
  await S.appendRow(cfg.sheet, [id, v.date, v.description, v.notes, v.amount], 2, 5);
  return exp_getTransactions();
}

async function exp_update(tx) {
  if (!tx || !tx.id) throw new C.UserError('Missing id.');
  const type = typeFromId(tx.id);
  if (tx.type && tx.type !== type) throw new C.UserError('The type of an existing transaction cannot be changed.');
  tx.type = type;
  const v = validate(tx);
  const sheet = TYPES[type].sheet;
  const row = await S.findRowById(sheet, tx.id);
  if (row === -1) throw new C.UserError('Transaction not found.');
  await S.updateRow(sheet, row, 2, [v.date, v.description, v.notes, v.amount], 2, 5);
  return exp_getTransactions();
}

async function exp_delete(id) {
  if (!id) throw new C.UserError('Missing id.');
  const sheet = TYPES[typeFromId(id)].sheet;
  const row = await S.findRowById(sheet, id);
  if (row === -1) throw new C.UserError('Transaction not found.');
  await S.deleteRow(sheet, row);
  return exp_getTransactions();
}

module.exports = { exp_getTransactions, exp_add, exp_update, exp_delete };
