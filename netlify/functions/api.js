const { google } = require('googleapis');

const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'applicants';
const HEADERS = [
  'id','university','name','birthDate','phone','email','major','internshipType','field',
  'documentStatus','finalStatus','currentStage','interviewDate','interviewPlace',
  'interviewConfirmStatus','interviewConfirmMemo',
  'noticeTitle','noticeBody','requiredDocuments','requestItems','memo','updatedAt'
];

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return response({ ok: true });

  try {
    const input = parseInput(event);
    const action = input.action || 'lookup';

    if (action === 'lookup') {
      return response(await lookup(input.name, input.birthDate, input.email));
    }

    if (action === 'list') {
      requireAdmin(input.key);
      return response({ ok: true, applicants: await list() });
    }

    if (action === 'upsert') {
      requireAdmin(input.key);
      const saved = await upsert(input.payload || {});
      return response({ ok: true, applicant: saved });
    }

    if (action === 'bulkUpsert') {
      requireAdmin(input.key);
      const payloads = Array.isArray(input.payloads) ? input.payloads : [];
      const saved = [];
      for (const payload of payloads) {
        saved.push(await upsert(payload || {}));
      }
      return response({ ok: true, count: saved.length, applicants: saved });
    }

    if (action === 'confirmInterview') {
      return response(await confirmInterview(input.name, input.birthDate, input.status, input.memo));
    }

    return response({ ok: false, message: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return response({ ok: false, message: err && err.message ? err.message : String(err) }, 500);
  }
};

function parseInput(event) {
  if (event.httpMethod === 'POST') {
    return JSON.parse(event.body || '{}');
  }
  return event.queryStringParameters || {};
}

async function sheetsClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = getPrivateKey();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error('Google Sheets environment variables are not configured.');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return {
    spreadsheetId,
    sheets: google.sheets({ version: 'v4', auth })
  };
}

async function ensureSheet() {
  const { sheets, spreadsheetId } = await sheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === SHEET_NAME);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }
    });
  }

  const headerRange = `${SHEET_NAME}!A1:${columnName(HEADERS.length)}1`;
  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: headerRange });
  const current = ((headerRes.data.values && headerRes.data.values[0]) || []).map(h => String(h || '').trim());

  if (!current || !current.some(Boolean)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: headerRange,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] }
    });
    return { sheets, spreadsheetId, headers: HEADERS };
  }

  const headers = current.filter(Boolean);
  const missing = HEADERS.filter(h => !headers.includes(h));
  if (missing.length) {
    const startCol = columnName(headers.length + 1);
    const endCol = columnName(headers.length + missing.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!${startCol}1:${endCol}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [missing] }
    });
  }

  return { sheets, spreadsheetId, headers: headers.concat(missing) };
}

async function listWithRows() {
  const { sheets, spreadsheetId, headers } = await ensureSheet();
  const range = `${SHEET_NAME}!A2:${columnName(headers.length)}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = res.data.values || [];

  return values
    .map((row, i) => ({ rowNumber: i + 2, applicant: rowToObj(row, headers), headers }))
    .filter(item => Object.values(item.applicant).some(Boolean));
}

async function list() {
  return (await listWithRows()).map(item => item.applicant);
}

async function lookup(name, birthDate, email) {
  const { sheets, spreadsheetId, headers } = await ensureSheet();
  const normalizedName = normalizeName(name);
  const normalizedBirth = normalizeBirth(birthDate);
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) return { ok: true, found: false };

  const found = (await listWithRows()).find(row =>
    normalizeName(row.applicant.name) === normalizedName &&
    normalizeBirth(row.applicant.birthDate) === normalizedBirth
  );

  if (!found) return { ok: true, found: false };

  const existingEmail = normalizeEmail(found.applicant.email);
  if (existingEmail && existingEmail !== normalizedEmail) {
    return { ok: true, found: false };
  }

  if (!existingEmail) {
    found.applicant.email = normalizedEmail;
    found.applicant.updatedAt = new Date().toISOString();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A${found.rowNumber}:${columnName(headers.length)}${found.rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers.map(h => found.applicant[h] || '')] }
    });
  }

  return { ok: true, found: true, applicant: publicApplicant(found.applicant) };
}

async function upsert(payload) {
  const { sheets, spreadsheetId, headers } = await ensureSheet();
  const item = sanitize(payload);
  if (!item.name || !item.birthDate) throw new Error('name and birthDate are required.');

  item.birthDate = normalizeBirth(item.birthDate);
  item.id = item.id || `${normalizeName(item.name)}_${item.birthDate}`;
  item.updatedAt = new Date().toISOString();

  const rows = await listWithRows();
  const existing = rows.find(row => String(row.applicant.id) === String(item.id));
  const rowValues = headers.map(h => item[h] || '');

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A${existing.rowNumber}:${columnName(headers.length)}${existing.rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:${columnName(headers.length)}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] }
    });
  }

  return item;
}

async function confirmInterview(name, birthDate, status, memo) {
  const { sheets, spreadsheetId, headers } = await ensureSheet();
  const normalizedName = normalizeName(name);
  const normalizedBirth = normalizeBirth(birthDate);
  const rows = await listWithRows();
  const found = rows.find(row =>
    normalizeName(row.applicant.name) === normalizedName &&
    normalizeBirth(row.applicant.birthDate) === normalizedBirth
  );

  if (!found) return { ok: false, message: '지원자 정보를 찾을 수 없습니다.' };

  const applicant = {
    ...found.applicant,
    interviewConfirmStatus: status || '',
    interviewConfirmMemo: memo || '',
    updatedAt: new Date().toISOString()
  };

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${found.rowNumber}:${columnName(headers.length)}${found.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers.map(h => applicant[h] || '')] }
  });

  return { ok: true };
}

function sanitize(payload) {
  const out = {};
  HEADERS.forEach(h => out[h] = payload[h] || '');
  return out;
}

function publicApplicant(a) {
  const allowed = [
    'university','name','birthDate','major','field','documentStatus','finalStatus',
    'internshipType','currentStage','interviewDate','interviewPlace','interviewConfirmStatus',
    'noticeTitle','noticeBody','requiredDocuments','requestItems','updatedAt'
  ];
  const out = {};
  allowed.forEach(k => out[k] = a[k] || '');
  return out;
}

function rowToObj(row, headers = HEADERS) {
  const out = {};
  headers.forEach((h, i) => out[h] = row[i] || '');
  return out;
}

function normalizeName(v) {
  return String(v || '').replace(/\s/g, '').trim();
}

function normalizeBirth(v) {
  const only = String(v || '').replace(/[^0-9]/g, '');
  if (only.length !== 8) return String(v || '').trim();
  return `${only.slice(0, 4)}-${only.slice(4, 6)}-${only.slice(6, 8)}`;
}

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function requireAdmin(key) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) throw new Error('ADMIN_KEY is not configured.');
  if (String(key || '') !== String(expected)) throw new Error('Invalid admin key.');
}

function getPrivateKey() {
  if (process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }
  return (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

function columnName(index) {
  let name = '';
  while (index > 0) {
    const mod = (index - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    index = Math.floor((index - mod) / 26);
  }
  return name;
}

function response(body, statusCode = 200) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}
