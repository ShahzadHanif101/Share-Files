'use strict';
/**
 * Thin Google Sheets layer. Replaces SpreadsheetApp + Script Properties.
 * All row numbers are 1-based sheet rows (row 1 = headers).
 */
const { google } = require('googleapis');
const { SHEETS, IDS, pad } = require('./common');

const META = 'Meta'; // hidden-ish tab holding the never-reused ID counters (replaces Script Properties)
let _api = null;
let _ids = null;

function api() {
  if (_api) return _api;
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  _api = google.sheets({ version: 'v4', auth });
  return _api;
}

function sid() {
  if (!process.env.SPREADSHEET_ID) throw new Error('SPREADSHEET_ID is not set.');
  return process.env.SPREADSHEET_ID;
}

function col(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Numeric sheetId for a tab name (cached). Creates the tab when create=true. */
async function sheetId(name, create) {
  if (!_ids) {
    const r = await api().spreadsheets.get({ spreadsheetId: sid(), fields: 'sheets.properties(sheetId,title)' });
    _ids = {};
    r.data.sheets.forEach((s) => { _ids[s.properties.title] = s.properties.sheetId; });
  }
  if (_ids[name] === undefined) {
    if (!create) throw new Error('Sheet "' + name + '" not found.');
    const r = await api().spreadsheets.batchUpdate({
      spreadsheetId: sid(),
      requestBody: { requests: [{ addSheet: { properties: { title: name } } }] }
    });
    _ids[name] = r.data.replies[0].addSheet.properties.sheetId;
  }
  return _ids[name];
}

/** Data rows (from row 2), each padded to `width` columns. Dates come back as serial numbers. */
async function readRows(name, width) {
  const r = await api().spreadsheets.values.get({
    spreadsheetId: sid(),
    range: "'" + name + "'!A2:" + col(width),
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });
  return (r.data.values || []).map((row) => {
    const o = row.slice(0, width);
    while (o.length < width) o.push('');
    return o;
  });
}

function formatRequests(sheet, row, dateCol, amountCol) {
  const cell = (c, type, pattern) => ({
    repeatCell: {
      range: { sheetId: sheet, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: c - 1, endColumnIndex: c },
      cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
      fields: 'userEnteredFormat.numberFormat'
    }
  });
  return [cell(dateCol, 'DATE', 'dd mmm yyyy'), cell(amountCol, 'NUMBER', '#,##0.00')];
}

async function formatRow(name, row, dateCol, amountCol) {
  const sheet = await sheetId(name);
  await api().spreadsheets.batchUpdate({
    spreadsheetId: sid(),
    requestBody: { requests: formatRequests(sheet, row, dateCol, amountCol) }
  });
}

/** Appends one row; returns its row number. */
async function appendRow(name, values, dateCol, amountCol) {
  const r = await api().spreadsheets.values.append({
    spreadsheetId: sid(),
    range: "'" + name + "'!A1",
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] }
  });
  const m = /(\d+)(?::[A-Z]+(\d+))?$/.exec(r.data.updates.updatedRange);
  const row = Number(m[2] || m[1]);
  if (dateCol) await formatRow(name, row, dateCol, amountCol);
  return row;
}

/** Overwrites columns startCol.. of an existing row. */
async function updateRow(name, row, startCol, values, dateCol, amountCol) {
  await api().spreadsheets.values.update({
    spreadsheetId: sid(),
    range: "'" + name + "'!" + col(startCol) + row + ':' + col(startCol + values.length - 1) + row,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
  if (dateCol) await formatRow(name, row, dateCol, amountCol);
}

async function deleteRow(name, row) {
  const sheet = await sheetId(name);
  await api().spreadsheets.batchUpdate({
    spreadsheetId: sid(),
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId: sheet, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }]
    }
  });
}

/** Row number of the record with this ID in column A, or -1. */
async function findRowById(name, id) {
  const r = await api().spreadsheets.values.get({
    spreadsheetId: sid(),
    range: "'" + name + "'!A2:A",
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const ids = r.data.values || [];
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/**
 * Reserves `count` consecutive numbers for a counter and returns the first one.
 * The highest number ever issued lives in the Meta tab, so deleting the newest
 * record never frees its number. A higher number already in the sheet wins.
 */
async function reserveCounter(key, highestInSheet, count) {
  await sheetId(META, true);
  const r = await api().spreadsheets.values.get({
    spreadsheetId: sid(),
    range: "'" + META + "'!A1:B",
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const rows = r.data.values || [];
  const idx = rows.findIndex((x) => String(x[0]) === key);
  const stored = idx >= 0 ? Number(rows[idx][1]) || 0 : 0;
  const start = Math.max(stored, highestInSheet);
  const end = start + count;

  if (idx >= 0) {
    await api().spreadsheets.values.update({
      spreadsheetId: sid(),
      range: "'" + META + "'!B" + (idx + 1),
      valueInputOption: 'RAW',
      requestBody: { values: [[end]] }
    });
  } else {
    await api().spreadsheets.values.append({
      spreadsheetId: sid(),
      range: "'" + META + "'!A1",
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[key, end]] }
    });
  }
  return start + 1;
}

/** Reserves `count` IDs like EXP-00007 for the given key (EXP / CRD / TN). */
async function reserveIds(key, sheetName, count) {
  const cfg = IDS[key];
  const re = new RegExp('^' + cfg.prefix + '-(\\d+)$');
  let highest = 0;
  (await readRows(sheetName, 1)).forEach((r) => {
    const m = String(r[0]).match(re);
    if (m) highest = Math.max(highest, Number(m[1]));
  });
  const first = await reserveCounter('COUNTER_' + key, highest, count);
  return Array.from({ length: count }, (_, i) => cfg.prefix + '-' + pad(first + i, cfg.width));
}

/**
 * Reads a tab and gives every row that has data but no ID a fresh one
 * (same behaviour as ensureIds_ in Apps Script). Returns the rows with IDs filled in.
 */
async function loadRows(name, key, width) {
  const rows = await readRows(name, width);
  const missing = [];
  rows.forEach((row, i) => {
    const hasId = String(row[0]).trim() !== '';
    const hasData = row.slice(1).some((c) => c !== '' && c !== null);
    if (!hasId && hasData) missing.push(i);
  });
  if (missing.length) {
    const ids = await reserveIds(key, name, missing.length);
    await api().spreadsheets.values.batchUpdate({
      spreadsheetId: sid(),
      requestBody: {
        valueInputOption: 'RAW',
        data: missing.map((i, n) => ({ range: "'" + name + "'!A" + (i + 2), values: [[ids[n]]] }))
      }
    });
    missing.forEach((i, n) => { rows[i][0] = ids[n]; });
  }
  return rows;
}

module.exports = { SHEETS, readRows, appendRow, updateRow, deleteRow, findRowById, reserveCounter, reserveIds, loadRows };
