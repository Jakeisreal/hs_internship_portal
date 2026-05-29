/**
 * HWASHIN AX Ambassador 현장실습 합격조회 포털용 Google Apps Script
 *
 * 사용 방법
 * 1. Google Sheets를 생성하고, Apps Script 편집기에 본 코드를 붙여넣습니다.
 * 2. Script Properties에 ADMIN_KEY 값을 등록합니다.
 *    - 프로젝트 설정 > 스크립트 속성 > ADMIN_KEY = 원하는 관리자 키
 * 3. 배포 > 새 배포 > 웹 앱
 *    - 실행 사용자: 나
 *    - 액세스 권한: 링크가 있는 모든 사용자
 * 4. 배포 URL을 result.html / admin.html의 API 설정에 입력합니다.
 */

const SHEET_NAME = 'applicants';
const HEADERS = [
  'id','university','name','birthDate','phone','email','major','field',
  'documentStatus','finalStatus','currentStage','interviewDate','interviewPlace',
  'interviewConfirmStatus','interviewConfirmMemo',
  'noticeTitle','noticeBody','requiredDocuments','requestItems','memo','updatedAt'
];

function doGet(e) {
  const p = e.parameter || {};
  const action = p.action || 'lookup';

  try {
    if (action === 'lookup') {
      return respond_(lookup_(p.name, p.birthDate), p.callback);
    }

    if (action === 'list') {
      requireAdmin_(p.key);
      return respond_({ ok: true, applicants: list_() }, p.callback);
    }

    if (action === 'upsert') {
      requireAdmin_(p.key);
      const payload = JSON.parse(p.payload || '{}');
      const saved = upsert_(payload);
      return respond_({ ok: true, applicant: saved }, p.callback);
    }

    if (action === 'confirmInterview') {
      const result = confirmInterview_(p.name, p.birthDate, p.status, p.memo);
      return respond_(result, p.callback);
    }

    return respond_({ ok: false, message: 'Unknown action: ' + action }, p.callback);
  } catch (err) {
    return respond_({ ok: false, message: String(err && err.message ? err.message : err) }, p.callback);
  }
}

function doPost(e) {
  const body = JSON.parse((e.postData && e.postData.contents) || '{}');
  const action = body.action || 'upsert';

  try {
    if (action === 'upsert') {
      requireAdmin_(body.key);
      return respond_({ ok: true, applicant: upsert_(body.payload || {}) });
    }

    if (action === 'bulkUpsert') {
      requireAdmin_(body.key);
      const items = body.items || [];
      const saved = items.map(upsert_);
      return respond_({ ok: true, count: saved.length, applicants: saved });
    }

    return respond_({ ok: false, message: 'Unknown action: ' + action });
  } catch (err) {
    return respond_({ ok: false, message: String(err && err.message ? err.message : err) });
  }
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);

  const firstRow = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeader = firstRow.some(String);
  if (!hasHeader) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function list_() {
  const sh = sheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .filter(row => row.some(String))
    .map(rowToObj_);
}

function lookup_(name, birthDate) {
  const normalizedName = normalizeName_(name);
  const normalizedBirth = normalizeBirth_(birthDate);
  const found = list_().find(a =>
    normalizeName_(a.name) === normalizedName &&
    normalizeBirth_(a.birthDate) === normalizedBirth
  );

  if (!found) return { ok: true, found: false };
  return { ok: true, found: true, applicant: publicApplicant_(found) };
}

function upsert_(payload) {
  const sh = sheet_();
  const item = sanitize_(payload);
  if (!item.name || !item.birthDate) throw new Error('name and birthDate are required.');

  item.birthDate = normalizeBirth_(item.birthDate);
  item.id = item.id || (normalizeName_(item.name) + '_' + item.birthDate);
  item.updatedAt = new Date().toISOString();

  const rows = list_();
  const idx = rows.findIndex(a => String(a.id) === String(item.id));
  const rowValues = HEADERS.map(h => item[h] || '');

  if (idx >= 0) {
    sh.getRange(idx + 2, 1, 1, HEADERS.length).setValues([rowValues]);
  } else {
    sh.appendRow(rowValues);
  }
  return item;
}

function confirmInterview_(name, birthDate, status, memo) {
  const sh = sheet_();
  const normalizedName = normalizeName_(name);
  const normalizedBirth = normalizeBirth_(birthDate);
  const rows = list_();
  const idx = rows.findIndex(a =>
    normalizeName_(a.name) === normalizedName &&
    normalizeBirth_(a.birthDate) === normalizedBirth
  );
  if (idx < 0) return { ok: false, message: '지원자 정보를 찾을 수 없습니다.' };

  const rowNumber = idx + 2;
  const statusCol = HEADERS.indexOf('interviewConfirmStatus') + 1;
  const memoCol = HEADERS.indexOf('interviewConfirmMemo') + 1;
  const updatedCol = HEADERS.indexOf('updatedAt') + 1;

  sh.getRange(rowNumber, statusCol).setValue(status || '');
  sh.getRange(rowNumber, memoCol).setValue(memo || '');
  sh.getRange(rowNumber, updatedCol).setValue(new Date().toISOString());

  return { ok: true };
}

function publicApplicant_(a) {
  const allowed = [
    'university','name','birthDate','major','field','documentStatus','finalStatus',
    'currentStage','interviewDate','interviewPlace','interviewConfirmStatus',
    'noticeTitle','noticeBody','requiredDocuments','requestItems','updatedAt'
  ];
  const out = {};
  allowed.forEach(k => out[k] = a[k] || '');
  return out;
}

function sanitize_(payload) {
  const out = {};
  HEADERS.forEach(h => out[h] = payload[h] || '');
  return out;
}

function rowToObj_(row) {
  const o = {};
  HEADERS.forEach((h, i) => o[h] = row[i] instanceof Date ? Utilities.formatDate(row[i], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : row[i]);
  return o;
}

function normalizeName_(v) {
  return String(v || '').replace(/\s/g, '').trim();
}

function normalizeBirth_(v) {
  const only = String(v || '').replace(/[^0-9]/g, '');
  if (only.length !== 8) return String(v || '').trim();
  return only.slice(0,4) + '-' + only.slice(4,6) + '-' + only.slice(6,8);
}

function requireAdmin_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!expected) throw new Error('ADMIN_KEY is not configured in Script Properties.');
  if (String(key || '') !== String(expected)) throw new Error('Invalid admin key.');
}

function respond_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback && !/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    callback = '';
  }
  const body = callback ? (callback + '(' + json + ')') : json;
  return ContentService
    .createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
