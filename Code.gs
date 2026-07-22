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

    const result = {
      success: true,
      message: 'ติดตั้ง Centralized App Hub Database สำเร็จ',
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      sheetName: sheet.getName()
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
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
