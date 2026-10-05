'use strict';
const S = require('./sheets');
const C = require('./common');

const LOAN_TYPES = ['Given', 'Returned'];
const LOANS = C.SHEETS.loans;

async function loan_getPeople() {
  const rows = await S.readRows(C.SHEETS.people, 2);
  return rows.filter((r) => r[1] !== '').map((r) => ({ id: r[0], name: String(r[1]) }));
}

async function loan_addPerson(name) {
  const personName = String(name || '').trim();
  if (!personName) throw new C.UserError('Please enter a person name.');

  const rows = await S.readRows(C.SHEETS.people, 2);
  let highest = 0;
  rows.forEach((r) => {
    if (String(r[1]).trim().toLowerCase() === personName.toLowerCase()) {
      throw new C.UserError('"' + personName + '" already exists.');
    }
    const n = Number(r[0]);
    if (isFinite(n) && n > highest) highest = n;
  });

  const id = await S.reserveCounter('COUNTER_PERSON', highest, 1);
  await S.appendRow(C.SHEETS.people, [id, personName]);
  return { success: true, id, name: personName };
}

function validate(data) {
  if (!data || !String(data.person || '').trim()) throw new C.UserError('Please select a person.');
  if (LOAN_TYPES.indexOf(data.type) === -1) throw new C.UserError('Invalid transaction type.');
  return {
    date: C.parseDate(data.date).serial,
    person: String(data.person),
    type: data.type,
    amount: C.validateAmount(data.amount),
    notes: String(data.notes || '').trim()
  };
}

async function loan_save(data) {
  const v = validate(data);
  const id = (await S.reserveIds('TN', LOANS, 1))[0];
  await S.appendRow(LOANS, [id, v.date, v.person, v.type, v.amount, v.notes], 2, 5);
  return { success: true, id };
}

async function loan_update(data) {
  if (!data || !data.id) throw new C.UserError('Missing id.');
  const v = validate(data);
  const row = await S.findRowById(LOANS, data.id);
  if (row === -1) throw new C.UserError('Transaction not found.');
  await S.updateRow(LOANS, row, 2, [v.date, v.person, v.type, v.amount, v.notes], 2, 5);
  return true;
}

async function loan_delete(id) {
  if (!id) throw new C.UserError('Missing id.');
  const row = await S.findRowById(LOANS, id);
  if (row === -1) throw new C.UserError('Transaction not found.');
  await S.deleteRow(LOANS, row);
  return true;
}

/** Transactions for one person between two dates (yyyy-MM-dd), newest first. */
async function loan_getTransactions(person, fromDate, toDate) {
  const rows = await S.loadRows(LOANS, 'TN', 6);
  const transactions = [];
  let totalGiven = 0;
  let totalReturned = 0;

  rows.forEach((row) => {
    const iso = C.isoDate(row[1]);
    if (!iso) return;
    if (String(row[2]) !== String(person)) return;
    if (iso < fromDate || iso > toDate) return;

    const amount = Number(row[4]) || 0;
    if (row[3] === 'Given') totalGiven += amount;
    if (row[3] === 'Returned') totalReturned += amount;

    transactions.push({
      id: String(row[0]),
      person: String(row[2]),
      date: C.displayDate(iso),
      dateISO: iso,
      type: String(row[3]),
      amount,
      notes: String(row[5] || '')
    });
  });

  transactions.sort(C.byDateThenIdDesc('dateISO'));
  return { transactions, totalGiven, totalReturned, balance: totalGiven - totalReturned };
}

module.exports = { loan_getPeople, loan_addPerson, loan_save, loan_update, loan_delete, loan_getTransactions };
