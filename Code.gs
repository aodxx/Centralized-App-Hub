/**
 * Centralized App Hub — Google Apps Script CSV endpoint
 * ตั้งค่า SHEET_ID/SHEET_NAME แล้ว Deploy เป็น Web app สำหรับผู้ใช้ Anyone
 */
const CONFIG = Object.freeze({
  SHEET_ID: 'PUT_YOUR_GOOGLE_SHEET_ID_HERE',
  SHEET_NAME: 'Apps',
  REQUIRED_HEADERS: ['id', 'title', 'category', 'url', 'icon', 'description', 'open_type']
});

/**
 * Optional parameters:
 *   ?sheet=Apps  เลือกชื่อชีต
 *   ?health=1    ตรวจสอบการตั้งค่า
 */
function doGet(e) {
  try {
    validateConfig_();
    if (e && e.parameter && e.parameter.health === '1') {
      return createCsvOutput_('status,message\nok,Connection successful');
    }

    const requestedSheet = sanitizeSheetName_(e && e.parameter ? e.parameter.sheet : '');
    const sheetName = requestedSheet || CONFIG.SHEET_NAME;
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error('ไม่พบชีตชื่อ "' + sheetName + '"');

    const values = sheet.getDataRange().getDisplayValues();
    if (!values.length || !values[0].length) throw new Error('ชีตไม่มีข้อมูล');
    validateHeaders_(values[0]);

    const rows = values.filter(function (row, index) {
      return index === 0 || row.some(function (cell) { return String(cell).trim() !== ''; });
    });
    const csv = rows.map(function (row) {
      return row.map(escapeCsvCell_).join(',');
    }).join('\r\n');
    return createCsvOutput_(csv);
  } catch (error) {
    return createCsvOutput_('error\n' + escapeCsvCell_(error.message || String(error)));
  }
}

function validateConfig_() {
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'PUT_YOUR_GOOGLE_SHEET_ID_HERE') {
    throw new Error('กรุณากำหนด CONFIG.SHEET_ID ใน Code.gs');
  }
}

function validateHeaders_(headers) {
  const normalized = headers.map(function (header) { return String(header).trim().toLowerCase(); });
  const missing = CONFIG.REQUIRED_HEADERS.filter(function (header) {
    return normalized.indexOf(header) === -1;
  });
  if (missing.length) throw new Error('ไม่พบคอลัมน์ที่จำเป็น: ' + missing.join(', '));
}

function sanitizeSheetName_(value) {
  const name = String(value || '').trim();
  if (!name) return '';
  if (name.length > 100 || /[\\/?*\[\]:]/.test(name)) throw new Error('ชื่อชีตไม่ถูกต้อง');
  return name;
}

function escapeCsvCell_(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function createCsvOutput_(content) {
  return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.CSV);
}
