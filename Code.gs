/**
 * Centralized App Hub API v1
 * Google Apps Script Web App + Google Sheets database
 *
 * เริ่มต้นครั้งแรก:
 * 1. รัน setupSystem() จาก Apps Script editor
 * 2. อนุญาตสิทธิ์ และเปิด URL ของชีตจาก Execution log
 * 3. Deploy เป็น Web app: Execute as Me / Who has access: Anyone
 */

const CONFIG = Object.freeze({
  API_VERSION: '1.0.0',
  SPREADSHEET_ID: '', // เว้นว่างได้: setupSystem() จะบันทึก ID ให้อัตโนมัติ
  SPREADSHEET_NAME: 'Centralized App Hub Database',
  SHEET_NAME: 'Apps',
  HEADERS: ['id', 'title', 'category', 'url', 'icon', 'description', 'open_type'],
  HEADER_COLOR: '#4f46e5',
  ALLOWED_OPEN_TYPES: ['embed', 'tab']
});

/** สร้างฐานข้อมูล ตาราง รูปแบบ และข้อมูลตัวอย่างโดยไม่ลบข้อมูลเดิม */
function setupSystem() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getOrCreateSpreadsheet_();
    const sheet = getOrCreateAppSheet_(spreadsheet);
    formatAppSheet_(sheet);
    installValidations_(sheet);
    insertSampleRowsIfEmpty_(sheet);
    const adminKey = ensureAdminKey_();

    const result = {
      success: true,
      message: 'ติดตั้ง Centralized App Hub Database สำเร็จ',
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      sheetName: sheet.getName(),
      adminKey: adminKey
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** POST /exec action=create — เพิ่มแอปจากหน้าจัดการ */
function doPost(e) {
  try {
    const params = (e && e.parameter) || {};
    authorizeWrite_(params.admin_key);
    const action = String(params.action || '').toLowerCase();
    if (action !== 'create') return jsonResponse_(errorPayload_('UNSUPPORTED_ACTION', 'ไม่รองรับ action: ' + action));
    const app = validateNewApp_(params);
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const sheet = getAppSheet_();
      const apps = readApps_();
      if (apps.some(function (item) { return item.id === app.id; })) {
        return jsonResponse_(errorPayload_('DUPLICATE_ID', 'มีแอป ID นี้อยู่แล้ว: ' + app.id));
      }
      sheet.appendRow(appToRow_(app));
      return jsonResponse_({ success:true, message:'เพิ่มแอปสำเร็จ', data:app, timestamp:new Date().toISOString() });
    } finally { lock.releaseLock(); }
  } catch (error) {
    console.error(error.stack || error);
    return jsonResponse_(errorPayload_('WRITE_FAILED', error.message || String(error)));
  }
}

function validateNewApp_(params) {
  const title = cleanText_(params.title, 100);
  const url = cleanUrl_(params.url);
  if (!title) throw new Error('กรุณากรอกชื่อแอป');
  if (!url) throw new Error('กรุณากรอก URL ของแอป');
  const openType = String(params.open_type || 'embed').toLowerCase();
  if (CONFIG.ALLOWED_OPEN_TYPES.indexOf(openType) < 0) throw new Error('open_type ต้องเป็น embed หรือ tab');
  return {
    id: createUniqueId_(title), title:title, category:cleanText_(params.category, 60) || 'อื่นๆ',
    url:url, icon:cleanText_(params.icon, 500) || '🧩',
    description:cleanText_(params.description, 300) || 'ไม่มีคำอธิบาย', open_type:openType
  };
}

function cleanText_(value, maxLength) { return String(value || '').trim().slice(0, maxLength); }
function cleanUrl_(value) {
  const url = String(value || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('URL ต้องขึ้นต้นด้วย http:// หรือ https://');
  return url.slice(0, 2000);
}
function createUniqueId_(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'app';
  return slug + '-' + Utilities.getUuid().slice(0, 8);
}
function ensureAdminKey_() {
  const properties = PropertiesService.getScriptProperties();
  let key = properties.getProperty('HUB_ADMIN_KEY');
  if (!key) { key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); properties.setProperty('HUB_ADMIN_KEY', key); }
  return key;
}
function authorizeWrite_(providedKey) {
  const expected = ensureAdminKey_();
  if (!providedKey || String(providedKey) !== expected) throw new Error('รหัสผู้ดูแลไม่ถูกต้อง');
}

/** เมนูสำหรับ Apps Script ที่ผูกกับ Google Sheets */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Centralized App Hub')
    .addItem('ติดตั้ง/ซ่อมแซมตาราง', 'setupSystem')
    .addItem('ตรวจสอบโครงสร้างข้อมูล', 'validateDatabase')
    .addToUi();
}

/** GET /exec, GET /exec?action=list, GET /exec?action=health */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || 'list').toLowerCase();
    if (action === 'health') return jsonResponse_(healthPayload_());
    if (action !== 'list') return jsonResponse_(errorPayload_('UNSUPPORTED_ACTION', 'ไม่รองรับ action: ' + action));

    const apps = readApps_();
    if (String(params.format || '').toLowerCase() === 'csv') {
      return csvResponse_([CONFIG.HEADERS].concat(apps.map(appToRow_)));
    }
    return jsonResponse_({
      success: true,
      apiVersion: CONFIG.API_VERSION,
      count: apps.length,
      data: apps,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(error.stack || error);
    return jsonResponse_(errorPayload_('INTERNAL_ERROR', error.message || String(error)));
  }
}

function validateDatabase() {
  const sheet = getAppSheet_();
  validateHeaders_(sheet);
  const apps = readApps_();
  const ids = {};
  apps.forEach(function (app) {
    if (ids[app.id]) throw new Error('พบ id ซ้ำ: ' + app.id);
    ids[app.id] = true;
  });
  const result = { success: true, rows: apps.length, message: 'โครงสร้างข้อมูลถูกต้อง' };
  console.log(JSON.stringify(result));
  return result;
}

function readApps_() {
  const sheet = getAppSheet_();
  validateHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.length)
    .getDisplayValues()
    .filter(function (row) { return row.some(function (cell) { return String(cell).trim() !== ''; }); })
    .map(rowToApp_)
    .filter(function (app) { return app.id && app.title && app.url; });
}

function rowToApp_(row) {
  const app = {};
  CONFIG.HEADERS.forEach(function (header, index) { app[header] = String(row[index] || '').trim(); });
  app.category = app.category || 'อื่นๆ';
  app.icon = app.icon || '🧩';
  app.description = app.description || 'ไม่มีคำอธิบาย';
  app.open_type = CONFIG.ALLOWED_OPEN_TYPES.indexOf(app.open_type.toLowerCase()) >= 0 ? app.open_type.toLowerCase() : 'embed';
  return app;
}

function appToRow_(app) {
  return CONFIG.HEADERS.map(function (header) { return app[header] || ''; });
}

function healthPayload_() {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  return {
    success: Boolean(sheet),
    status: sheet ? 'ok' : 'configuration_required',
    apiVersion: CONFIG.API_VERSION,
    database: spreadsheet.getName(),
    sheet: CONFIG.SHEET_NAME,
    timestamp: new Date().toISOString()
  };
}

function getOrCreateSpreadsheet_() {
  let spreadsheet = null;
  const configuredId = getSpreadsheetId_();
  if (configuredId) spreadsheet = SpreadsheetApp.openById(configuredId);
  if (!spreadsheet) spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) spreadsheet = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
  PropertiesService.getScriptProperties().setProperty('HUB_SPREADSHEET_ID', spreadsheet.getId());
  return spreadsheet;
}

function getSpreadsheet_() {
  const id = getSpreadsheetId_();
  if (!id) throw new Error('ยังไม่ได้ติดตั้งฐานข้อมูล กรุณารัน setupSystem() ก่อน');
  return SpreadsheetApp.openById(id);
}

function getSpreadsheetId_() {
  return String(CONFIG.SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('HUB_SPREADSHEET_ID') || '').trim();
}

function getAppSheet_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต ' + CONFIG.SHEET_NAME + ' กรุณารัน setupSystem()');
  return sheet;
}

function getOrCreateAppSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
  validateHeaders_(sheet);
  return sheet;
}

function validateHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).getDisplayValues()[0]
    .map(function (value) { return String(value).trim().toLowerCase(); });
  const invalid = CONFIG.HEADERS.filter(function (header, index) { return headers[index] !== header; });
  if (invalid.length) throw new Error('หัวตารางไม่ถูกต้อง ต้องเรียงเป็น: ' + CONFIG.HEADERS.join(', '));
}

function formatAppSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, CONFIG.HEADERS.length)
    .setBackground(CONFIG.HEADER_COLOR).setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center');
  [130, 220, 160, 360, 180, 420, 120].forEach(function (width, index) { sheet.setColumnWidth(index + 1, width); });
  if (!sheet.getFilter() && sheet.getMaxRows() > 1) {
    sheet.getRange(1, 1, sheet.getMaxRows(), CONFIG.HEADERS.length).createFilter();
  }
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), CONFIG.HEADERS.length).setVerticalAlignment('middle');
}

function installValidations_(sheet) {
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.ALLOWED_OPEN_TYPES, true)
    .setAllowInvalid(false)
    .setHelpText('เลือก embed หรือ tab เท่านั้น')
    .build();
  sheet.getRange(2, 7, rows, 1).setDataValidation(rule);
}

function insertSampleRowsIfEmpty_(sheet) {
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, 2, CONFIG.HEADERS.length).setValues([
    ['farm-dashboard', 'ระบบจัดการฟาร์ม', 'งานฟาร์ม', 'https://example.com/farm', '🐷', 'ติดตามข้อมูลและงานประจำวันภายในฟาร์ม', 'embed'],
    ['google-drive', 'Google Drive', 'เครื่องมือส่วนตัว', 'https://drive.google.com', 'fa-brands fa-google-drive', 'เปิดพื้นที่จัดเก็บและจัดการเอกสาร', 'tab']
  ]);
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function csvResponse_(rows) {
  const csv = rows.map(function (row) { return row.map(escapeCsvCell_).join(','); }).join('\r\n');
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}

function escapeCsvCell_(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function errorPayload_(code, message) {
  return { success: false, error: { code: code, message: message }, timestamp: new Date().toISOString() };
}
