const STORAGE_KEY = 'centralizedAppHub.csvUrl';
const REQUIRED_COLUMNS = ['id','title','category','url','icon','description','open_type'];

const state = { apps: [], filteredApps: [], category: 'ทั้งหมด', query: '', previewApps: [] };
const $ = (selector) => document.querySelector(selector);
const els = {
  dashboard: $('#dashboardView'), viewer: $('#viewerView'), grid: $('#appGrid'), loading: $('#loadingState'), empty: $('#emptyState'),
  status: $('#statusText'), filters: $('#categoryFilters'), search: $('#searchInput'), refresh: $('#refreshBtn'), settings: $('#settingsBtn'),
  modal: $('#settingsModal'), closeSettings: $('#closeSettingsBtn'), csvInput: $('#csvUrlInput'), test: $('#testBtn'), save: $('#saveBtn'),
  testResult: $('#testResult'), previewBody: $('#previewBody'), previewCount: $('#previewCount'), viewerTitle: $('#viewerTitle'),
  frame: $('#appFrame'), frameLoading: $('#frameLoading'), reloadFrame: $('#reloadFrameBtn'), openNewTab: $('#openNewTabBtn'), toast: $('#toastRegion')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  const appId = new URLSearchParams(location.search).get('app');
  showSkeletons();
  try {
    const apps = await fetchApps(getCsvUrl());
    state.apps = apps;
    if (appId) openViewer(appId); else renderDashboard();
  } catch (error) {
    if (appId) showToast(error.message, 'error');
    renderDashboard();
    els.status.textContent = 'ยังไม่ได้เชื่อมต่อ Google Sheets — กด “ตั้งค่า” เพื่อเริ่มต้น';
    showToast(error.message, 'error');
  }
}

function bindEvents() {
  els.search.addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); applyFilters(); });
  els.refresh.addEventListener('click', syncApps);
  els.settings.addEventListener('click', openSettings);
  els.closeSettings.addEventListener('click', closeSettings);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeSettings(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); });
  els.test.addEventListener('click', testConnection);
  els.save.addEventListener('click', saveAndSync);
  els.reloadFrame.addEventListener('click', () => { els.frameLoading.classList.remove('hidden'); els.frame.src = els.frame.src; });
  els.frame.addEventListener('load', () => els.frameLoading.classList.add('hidden'));
}

function getCsvUrl() { return localStorage.getItem(STORAGE_KEY) || ''; }

async function fetchApps(csvUrl) {
  if (!csvUrl) throw new Error('กรุณากำหนด Google Sheets CSV URL ก่อนใช้งาน');
  assertSafeHttpUrl(csvUrl);
  const response = await fetch(`${csvUrl}${csvUrl.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`เชื่อมต่อไม่สำเร็จ (HTTP ${response.status})`);
  const csvText = await response.text();
  return parseCsv(csvText);
}

function parseCsv(csvText) {
  const result = Papa.parse(csvText, { header:true, skipEmptyLines:'greedy', transformHeader:(h) => h.trim().toLowerCase(), transform:(v) => v.trim() });
  if (result.errors.length) throw new Error(`CSV ไม่ถูกต้อง: ${result.errors[0].message}`);
  const fields = result.meta.fields || [];
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.includes(column));
  if (missing.length) throw new Error(`ไม่พบคอลัมน์ที่จำเป็น: ${missing.join(', ')}`);
  const seen = new Set();
  return result.data.map(normalizeApp).filter((app) => {
    if (!app.id || !app.title || !app.url || seen.has(app.id)) return false;
    seen.add(app.id);
    return true;
  });
}

function normalizeApp(row) {
  return { id:row.id, title:row.title, category:row.category || 'อื่นๆ', url:row.url, icon:row.icon || '🧩', description:row.description || 'ไม่มีคำอธิบาย', open_type:row.open_type.toLowerCase() === 'tab' ? 'tab' : 'embed' };
}

function renderDashboard() {
  els.dashboard.classList.remove('hidden');
  els.viewer.classList.add('hidden');
  renderCategories();
  applyFilters();
}

function renderCategories() {
  const categories = ['ทั้งหมด', ...new Set(state.apps.map((app) => app.category))];
  els.filters.replaceChildren(...categories.map((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `category-pill${state.category === category ? ' active' : ''}`;
    button.textContent = category;
    button.addEventListener('click', () => { state.category = category; renderCategories(); applyFilters(); });
    return button;
  }));
}

function applyFilters() {
  state.filteredApps = state.apps.filter((app) => {
    const matchesCategory = state.category === 'ทั้งหมด' || app.category === state.category;
    const haystack = `${app.title} ${app.description} ${app.category}`.toLowerCase();
    return matchesCategory && haystack.includes(state.query);
  });
  renderCards();
}

function renderCards() {
  els.loading.classList.add('hidden');
  els.grid.classList.toggle('hidden', state.filteredApps.length === 0);
  els.grid.classList.toggle('grid', state.filteredApps.length > 0);
  els.empty.classList.toggle('hidden', state.filteredApps.length > 0);
  els.status.textContent = `พบ ${state.filteredApps.length} จาก ${state.apps.length} แอป`;
  els.grid.replaceChildren(...state.filteredApps.map(createCard));
}

function createCard(app) {
  const card = document.createElement('article'); card.className = 'app-card';
  const top = document.createElement('div'); top.className = 'flex items-start justify-between gap-3';
  const icon = createIcon(app.icon);
  const badge = document.createElement('span'); badge.className = 'rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600'; badge.textContent = app.category;
  top.append(icon, badge);
  const title = document.createElement('h3'); title.className = 'mt-4 text-lg font-semibold'; title.textContent = app.title;
  const desc = document.createElement('p'); desc.className = 'mt-2 line-clamp-3 text-sm leading-6 text-slate-500'; desc.textContent = app.description;
  const button = document.createElement('button'); button.className = 'mt-auto flex items-center justify-between pt-5 text-left text-sm font-medium text-brand-600';
  button.innerHTML = `<span>${app.open_type === 'tab' ? 'เปิดในแท็บใหม่' : 'เปิดใช้งาน'}</span><i class="fa-solid ${app.open_type === 'tab' ? 'fa-arrow-up-right-from-square' : 'fa-arrow-right'}"></i>`;
  button.addEventListener('click', () => launchApp(app));
  card.append(top, title, desc, button); return card;
}

function createIcon(value) {
  const wrap = document.createElement('div'); wrap.className = 'grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-indigo-50 text-3xl text-brand-600';
  if (/^https?:\/\//i.test(value)) { const img = document.createElement('img'); img.src=value; img.alt=''; img.className='h-full w-full object-cover'; img.loading='lazy'; img.onerror=() => { wrap.textContent='🧩'; }; wrap.append(img); }
  else if (/^(fa[srlbd]?|fa)-/i.test(value)) { const i=document.createElement('i'); i.className=`fa-solid ${value}`; wrap.append(i); }
  else wrap.textContent = value;
  return wrap;
}

function launchApp(app) {
  try { assertSafeHttpUrl(app.url); } catch (error) { return showToast(error.message, 'error'); }
  if (app.open_type === 'tab') window.open(app.url, '_blank', 'noopener,noreferrer');
  else { const url = new URL(location.href); url.search = ''; url.searchParams.set('app', app.id); location.href = url.toString(); }
}

function openViewer(appId) {
  const app = state.apps.find((item) => item.id === appId);
  if (!app) { showToast(`ไม่พบแอป ID: ${appId}`, 'error'); history.replaceState({}, '', location.pathname); return renderDashboard(); }
  try { assertSafeHttpUrl(app.url); } catch (error) { history.replaceState({}, '', location.pathname); showToast(error.message, 'error'); return renderDashboard(); }
  if (app.open_type === 'tab') { window.open(app.url, '_blank', 'noopener,noreferrer'); history.replaceState({}, '', location.pathname); return renderDashboard(); }
  els.dashboard.classList.add('hidden'); els.viewer.classList.remove('hidden'); els.viewer.classList.add('flex');
  els.viewerTitle.textContent = app.title; document.title = `${app.title} | Centralized App Hub`;
  els.openNewTab.href = app.url; els.frame.src = app.url;
}

async function syncApps() {
  setButtonBusy(els.refresh, true);
  try { state.apps = await fetchApps(getCsvUrl()); renderCategories(); applyFilters(); showToast(`Sync สำเร็จ ${state.apps.length} แอป`, 'success'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { setButtonBusy(els.refresh, false); }
}

function openSettings() { els.csvInput.value = getCsvUrl(); els.testResult.classList.add('hidden'); renderPreview(state.apps); els.modal.classList.remove('hidden'); document.body.classList.add('overflow-hidden'); }
function closeSettings() { els.modal.classList.add('hidden'); document.body.classList.remove('overflow-hidden'); }

async function testConnection() {
  setButtonBusy(els.test, true);
  try { state.previewApps = await fetchApps(els.csvInput.value.trim()); renderPreview(state.previewApps); showTestResult(`เชื่อมต่อสำเร็จ พบ ${state.previewApps.length} แอป`, true); }
  catch (error) { state.previewApps=[]; renderPreview([]); showTestResult(error.message, false); }
  finally { setButtonBusy(els.test, false); }
}

async function saveAndSync() {
  const url = els.csvInput.value.trim(); setButtonBusy(els.save, true);
  try { const apps = await fetchApps(url); localStorage.setItem(STORAGE_KEY, url); state.apps=apps; state.category='ทั้งหมด'; state.query=''; els.search.value=''; closeSettings(); renderDashboard(); showToast('บันทึกและ Sync สำเร็จ', 'success'); }
  catch (error) { showTestResult(error.message, false); }
  finally { setButtonBusy(els.save, false); }
}

function renderPreview(apps) {
  els.previewCount.textContent = `${apps.length} รายการ`;
  els.previewBody.replaceChildren(...apps.slice(0,20).map((app) => {
    const tr=document.createElement('tr');
    [app.id,app.title,app.category,app.url,app.open_type].forEach((value, index) => { const td=document.createElement('td'); td.className=`p-3 ${index===3?'max-w-xs truncate text-slate-500':''}`; td.textContent=value; td.title=value; tr.append(td); }); return tr;
  }));
}

function showSkeletons() { els.loading.replaceChildren(...Array.from({length:8}, () => { const div=document.createElement('div'); div.className='skeleton'; return div; })); }
function showTestResult(message, success) { els.testResult.className=`rounded-xl p-3 text-sm ${success?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`; els.testResult.textContent=message; }
function setButtonBusy(button, busy) { button.disabled=busy; button.classList.toggle('opacity-60',busy); const icon=button.querySelector('i'); if (icon) icon.classList.toggle('fa-spin',busy); }
function assertSafeHttpUrl(value) { let url; try { url=new URL(value); } catch { throw new Error('URL ไม่ถูกต้อง'); } if (!['http:','https:'].includes(url.protocol)) throw new Error('รองรับเฉพาะ URL แบบ HTTP/HTTPS'); }
function showToast(message, type='success') { const item=document.createElement('div'); item.className=`max-w-sm rounded-xl px-4 py-3 text-sm text-white shadow-xl ${type==='error'?'bg-red-600':'bg-emerald-600'}`; item.textContent=message; els.toast.append(item); setTimeout(() => item.remove(),4500); }
