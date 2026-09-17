'use strict';

/* ============ Element references ============ */
const typeSelector = document.getElementById('typeSelector');
const inputGroups = {
  url: document.getElementById('input-url'),
  text: document.getElementById('input-text'),
  wifi: document.getElementById('input-wifi'),
  phone: document.getElementById('input-phone'),
};

const urlInput = document.getElementById('urlInput');
const textInput = document.getElementById('textInput');
const wifiSsid = document.getElementById('wifiSsid');
const wifiPassword = document.getElementById('wifiPassword');
const wifiEncryption = document.getElementById('wifiEncryption');
const wifiHidden = document.getElementById('wifiHidden');
const phoneInput = document.getElementById('phoneInput');

const qrColorInput = document.getElementById('qrColor');
const qrColorValueEl = document.getElementById('qrColorValue');
const bgColorInput = document.getElementById('bgColor');
const bgColorValueEl = document.getElementById('bgColorValue');
const sizeSlider = document.getElementById('sizeSlider');
const sizeValueEl = document.getElementById('sizeValue');
const eccSelector = document.getElementById('eccSelector');
const styleSelector = document.getElementById('styleSelector');

const copyBtn = document.getElementById('copyBtn');
const resetBtn = document.getElementById('resetBtn');

const qrCanvasEl = document.getElementById('qrCanvas');
const qrLoadingEl = document.getElementById('qrLoading');
const qrEmptyEl = document.getElementById('qrEmpty');
const downloadPngBtn = document.getElementById('downloadPng');
const downloadSvgBtn = document.getElementById('downloadSvg');

const statusDotEl = document.getElementById('statusDot');
const statusTextEl = document.getElementById('statusText');
const metaSizeEl = document.getElementById('metaSize');
const metaEccEl = document.getElementById('metaEcc');

const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');
const themeToggleBtn = document.getElementById('themeToggle');

const historyListEl = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const toastContainerEl = document.getElementById('toastContainer');

/* ============ Constants & state ============ */
const HISTORY_KEY = 'qrlab_history';
const THEME_KEY = 'qrlab_theme';
const HISTORY_LIMIT = 30;

const DEFAULT_STATE = {
  type: 'url',
  qrColor: '#4F6DF5',
  bgColor: '#FFFFFF',
  size: 320,
  ecc: 'M',
  style: 'square',
};

const TYPE_LABELS = { url: 'URL', text: 'Text', wifi: 'Wi-Fi network', phone: 'Phone number' };
const TYPE_ABBR = { url: 'URL', text: 'TXT', wifi: 'W-FI', phone: 'TEL' };

let state = { ...DEFAULT_STATE };
let qrCode = null;
let currentGenerated = null; // { type, label, fields } for the QR currently shown
let debounceTimer = null;
let loadingTimer = null;

/* ============ Content builders ============ */
function escapeWifiValue(str) {
  return str.replace(/([\\;,":])/g, '\\$1');
}

function buildWifiString(ssid, password, encryption, hidden) {
  let out = `WIFI:T:${encryption};S:${escapeWifiValue(ssid)};`;
  if (encryption !== 'nopass') out += `P:${escapeWifiValue(password)};`;
  out += `H:${hidden ? 'true' : 'false'};;`;
  return out;
}

function getCurrentFieldValues(type) {
  switch (type) {
    case 'url': return { url: urlInput.value.trim() };
    case 'text': return { text: textInput.value };
    case 'wifi': return {
      ssid: wifiSsid.value.trim(),
      password: wifiPassword.value,
      encryption: wifiEncryption.value,
      hidden: wifiHidden.checked,
    };
    case 'phone': return { phone: phoneInput.value.trim() };
    default: return {};
  }
}

// Validates the active input(s) and returns the string to encode in the QR code.
function validateAndBuildContent() {
  switch (state.type) {
    case 'url': {
      const raw = urlInput.value.trim();
      if (!raw) return { valid: false };
      const value = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) ? raw : `https://${raw}`;
      return { valid: true, value, label: raw };
    }
    case 'text': {
      const raw = textInput.value.trim();
      if (!raw) return { valid: false };
      return { valid: true, value: raw, label: raw };
    }
    case 'wifi': {
      const ssid = wifiSsid.value.trim();
      if (!ssid) return { valid: false };
      const password = wifiPassword.value;
      const encryption = wifiEncryption.value;
      const hidden = wifiHidden.checked;
      if (encryption !== 'nopass' && !password) {
        setFieldError('wifi', 'Enter a password, or set encryption to None');
        return { valid: false };
      }
      const value = buildWifiString(ssid, password, encryption, hidden);
      return { valid: true, value, label: `Wi-Fi: ${ssid}` };
    }
    case 'phone': {
      const raw = phoneInput.value.trim();
      if (!raw) return { valid: false };
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 3) {
        setFieldError('phone', 'Enter a valid phone number');
        return { valid: false };
      }
      const cleaned = raw.replace(/[^\d+]/g, '');
      return { valid: true, value: `tel:${cleaned}`, label: raw };
    }
    default:
      return { valid: false };
  }
}

/* ============ QR rendering ============ */
const STYLE_MAP = {
  square: { dots: 'square', corners: 'square', dot: 'square' },
  rounded: { dots: 'rounded', corners: 'extra-rounded', dot: 'dot' },
  dots: { dots: 'dots', corners: 'dot', dot: 'dot' },
};

function buildQrOptions(dataValue) {
  const s = STYLE_MAP[state.style];
  return {
    width: state.size,
    height: state.size,
    type: 'svg',
    data: dataValue,
    margin: 8,
    qrOptions: { errorCorrectionLevel: state.ecc },
    dotsOptions: { color: state.qrColor, type: s.dots },
    cornersSquareOptions: { color: state.qrColor, type: s.corners },
    cornersDotOptions: { color: state.qrColor, type: s.dot },
    backgroundOptions: { color: state.bgColor },
  };
}

function renderQr(dataValue) {
  const options = buildQrOptions(dataValue);
  if (!qrCode) {
    qrCode = new QRCodeStyling(options);
    qrCanvasEl.innerHTML = '';
    qrCode.append(qrCanvasEl);
  } else {
    qrCode.update(options);
  }
}

// Central generation step: validates input, renders the QR, updates all preview UI.
function generateQR() {
  clearFieldErrors();
  const result = validateAndBuildContent();
  updateMeta();

  if (!result.valid) {
    currentGenerated = null;
    showEmptyState();
    return;
  }

  showLoading();
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    try {
      renderQr(result.value);
      currentGenerated = { type: state.type, label: result.label, fields: getCurrentFieldValues(state.type) };
      showReadyState();
    } catch (err) {
      currentGenerated = null;
      showEmptyState();
      showToast('Something went wrong generating the QR code', 'error');
    } finally {
      hideLoading();
    }
  }, 180);
}

// Debounced entry point called by every settings/input change.
function updatePreview() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(generateQR, 150);
}

/* ============ Preview state helpers ============ */
function showEmptyState() {
  qrEmptyEl.classList.remove('hidden');
  qrCanvasEl.classList.add('hidden');
  downloadPngBtn.disabled = true;
  downloadSvgBtn.disabled = true;
  statusDotEl.classList.remove('ready');
  statusTextEl.textContent = 'Waiting for content';
}

function showReadyState() {
  qrEmptyEl.classList.add('hidden');
  qrCanvasEl.classList.remove('hidden');
  downloadPngBtn.disabled = false;
  downloadSvgBtn.disabled = false;
  statusDotEl.classList.add('ready');
  statusTextEl.textContent = 'Ready to scan';
}

function showLoading() { qrLoadingEl.classList.remove('hidden'); }
function hideLoading() { qrLoadingEl.classList.add('hidden'); }

function updateMeta() {
  sizeValueEl.textContent = state.size;
  metaSizeEl.textContent = `${state.size} × ${state.size}`;
  metaEccEl.textContent = state.ecc;
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
}

function setFieldError(key, message) {
  const el = document.getElementById(`error-${key}`);
  if (el) el.textContent = message;
}

/* ============ Downloads ============ */
function buildFileName() {
  return `qrlab-${state.type}-${Date.now()}`;
}

function downloadPNG() {
  if (!qrCode || !currentGenerated) {
    showToast('Add content to generate a QR code first', 'error');
    return;
  }
  try {
    qrCode.download({ name: buildFileName(), extension: 'png' });
    saveToHistory(currentGenerated.type, currentGenerated.label, currentGenerated.fields);
    showToast('QR code downloaded successfully');
  } catch (err) {
    showToast('Download failed — please try again', 'error');
  }
}

function downloadSVG() {
  if (!qrCode || !currentGenerated) {
    showToast('Add content to generate a QR code first', 'error');
    return;
  }
  try {
    qrCode.download({ name: buildFileName(), extension: 'svg' });
    saveToHistory(currentGenerated.type, currentGenerated.label, currentGenerated.fields);
    showToast('QR code downloaded successfully');
  } catch (err) {
    showToast('Download failed — please try again', 'error');
  }
}

function handleCopy() {
  const result = validateAndBuildContent();
  if (!result.valid) {
    showToast('Nothing to copy yet', 'error');
    return;
  }
  navigator.clipboard.writeText(result.value)
    .then(() => showToast('Content copied to clipboard'))
    .catch(() => showToast('Copy failed — please try again', 'error'));
}

/* ============ History (localStorage) ============ */
function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function writeHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch (err) {
    showToast('Could not save history — storage may be full', 'error');
  }
}

function saveToHistory(type, label, fields) {
  const items = readHistory();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    fields,
    timestamp: Date.now(),
  };
  items.unshift(entry);
  if (items.length > HISTORY_LIMIT) items.length = HISTORY_LIMIT;
  writeHistory(items);
  renderHistory(items);
}

function loadHistory() {
  renderHistory(readHistory());
}

function deleteHistoryItem(id) {
  const items = readHistory().filter((item) => item.id !== id);
  writeHistory(items);
  renderHistory(items);
  showToast('Removed from history');
}

function handleClearHistory() {
  if (!readHistory().length) return;
  if (!confirm('Clear all history? This cannot be undone.')) return;
  writeHistory([]);
  renderHistory([]);
  showToast('History cleared');
}

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderHistory(items) {
  historyListEl.innerHTML = items.map((entry) => `
    <div class="history-item">
      <div class="history-icon">${TYPE_ABBR[entry.type] || '—'}</div>
      <div class="history-body" data-id="${entry.id}" role="button" tabindex="0" aria-label="Load this QR code">
        <p class="history-label">${escapeHtml(entry.label)}</p>
        <p class="history-sub">${TYPE_LABELS[entry.type] || entry.type} · ${formatTimestamp(entry.timestamp)}</p>
      </div>
      <button type="button" class="history-delete" data-id="${entry.id}" aria-label="Delete this entry">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>
        </svg>
      </button>
    </div>
  `).join('');
}

function restoreFromHistory(id) {
  const entry = readHistory().find((item) => item.id === id);
  if (!entry) return;

  state.type = entry.type;
  setActiveSegment(typeSelector, 'type', entry.type);
  switchTypeView(entry.type);

  const f = entry.fields || {};
  if (entry.type === 'url') urlInput.value = f.url || '';
  if (entry.type === 'text') textInput.value = f.text || '';
  if (entry.type === 'wifi') {
    wifiSsid.value = f.ssid || '';
    wifiPassword.value = f.password || '';
    wifiEncryption.value = f.encryption || 'WPA';
    wifiHidden.checked = !!f.hidden;
    togglePasswordField();
  }
  if (entry.type === 'phone') phoneInput.value = f.phone || '';

  switchView('generator');
  updatePreview();
  showToast('Loaded from history');
}

/* ============ Reset ============ */
function resetSettings() {
  state = { ...DEFAULT_STATE };

  urlInput.value = '';
  textInput.value = '';
  wifiSsid.value = '';
  wifiPassword.value = '';
  wifiEncryption.value = 'WPA';
  wifiHidden.checked = false;
  phoneInput.value = '';
  togglePasswordField();

  qrColorInput.value = state.qrColor;
  qrColorValueEl.textContent = state.qrColor.toUpperCase();
  bgColorInput.value = state.bgColor;
  bgColorValueEl.textContent = state.bgColor.toUpperCase();
  sizeSlider.value = state.size;

  setActiveSegment(typeSelector, 'type', state.type);
  setActiveSegment(eccSelector, 'ecc', state.ecc);
  setActiveSegment(styleSelector, 'style', state.style);
  switchTypeView(state.type);

  clearFieldErrors();
  updatePreview();
  showToast('Settings reset');
}

/* ============ UI helpers ============ */
function setActiveSegment(container, attr, value) {
  container.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset[attr] === value);
  });
}

function switchTypeView(type) {
  Object.entries(inputGroups).forEach(([key, el]) => el.classList.toggle('hidden', key !== type));
}

function switchView(view) {
  tabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  views.forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
}

function togglePasswordField() {
  const isOpen = wifiEncryption.value === 'nopass';
  wifiPassword.disabled = isOpen;
  wifiPassword.placeholder = isOpen ? 'No password required' : 'Password';
  if (isOpen) wifiPassword.value = '';
}

/* ============ Theme ============ */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
}

/* ============ Toasts ============ */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = type === 'error' ? 'toast error' : 'toast';
  toast.textContent = message;
  toastContainerEl.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 200);
  }, 2600);
}

/* ============ Event bindings ============ */
function bindEvents() {
  typeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.type = btn.dataset.type;
    setActiveSegment(typeSelector, 'type', state.type);
    switchTypeView(state.type);
    clearFieldErrors();
    updatePreview();
  });

  eccSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.ecc = btn.dataset.ecc;
    setActiveSegment(eccSelector, 'ecc', state.ecc);
    updatePreview();
  });

  styleSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.style = btn.dataset.style;
    setActiveSegment(styleSelector, 'style', state.style);
    updatePreview();
  });

  [urlInput, textInput, wifiSsid, wifiPassword, phoneInput].forEach((el) => {
    el.addEventListener('input', updatePreview);
  });
  wifiHidden.addEventListener('change', updatePreview);
  wifiEncryption.addEventListener('change', () => { togglePasswordField(); updatePreview(); });

  qrColorInput.addEventListener('input', () => {
    state.qrColor = qrColorInput.value;
    qrColorValueEl.textContent = state.qrColor.toUpperCase();
    updatePreview();
  });
  bgColorInput.addEventListener('input', () => {
    state.bgColor = bgColorInput.value;
    bgColorValueEl.textContent = state.bgColor.toUpperCase();
    updatePreview();
  });
  sizeSlider.addEventListener('input', () => {
    state.size = parseInt(sizeSlider.value, 10);
    updateMeta();
    updatePreview();
  });

  copyBtn.addEventListener('click', handleCopy);
  resetBtn.addEventListener('click', resetSettings);
  downloadPngBtn.addEventListener('click', downloadPNG);
  downloadSvgBtn.addEventListener('click', downloadSVG);

  tabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));
  themeToggleBtn.addEventListener('click', toggleTheme);

  historyListEl.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.history-delete');
    if (delBtn) { deleteHistoryItem(delBtn.dataset.id); return; }
    const body = e.target.closest('.history-body');
    if (body) restoreFromHistory(body.dataset.id);
  });
  historyListEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const body = e.target.closest('.history-body');
    if (body) { e.preventDefault(); restoreFromHistory(body.dataset.id); }
  });
  clearHistoryBtn.addEventListener('click', handleClearHistory);
}

/* ============ Init ============ */
function init() {
  initTheme();
  bindEvents();
  togglePasswordField();
  updateMeta();
  showEmptyState();
  loadHistory();
}

init();
