// ============================================================
//  CPS.CX — Position Calculator v3.1
//  Gold Edition + Custom Signal
// ============================================================

const STORAGE_KEY_ACCOUNTS = 'position_calculator_accounts';
const STORAGE_KEY_RISK     = 'position_calculator_risk';
const STORAGE_KEY_CUSTOM   = 'position_calculator_custom';

const DEFAULT_RISK_PRESETS = { saltwayer: 5, neil: 4, sherlock: 1, custom: 3 };
const DEFAULT_CUSTOM       = { name: 'Custom', multiplier: 1 };

// ── Service Worker ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// ══════════════════════════════════════════════════════════════
//  ANIMATION ENGINE
// ══════════════════════════════════════════════════════════════

function animateNumber(el, from, to, duration = 420, prefix = '', suffix = '', decimals = 2) {
  if (typeof el._rafId === 'number') cancelAnimationFrame(el._rafId);
  const start = performance.now();
  const diff  = to - from;
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    el.textContent = prefix + (from + diff * e).toFixed(decimals) + suffix;
    if (t < 1) el._rafId = requestAnimationFrame(tick);
  }
  el._rafId = requestAnimationFrame(tick);
}

function slideToggle(el, show, duration = 260) {
  clearTimeout(el._slideTimer);
  if (show) {
    el.style.display  = 'flex';
    el.style.overflow = 'hidden';
    const h = el.scrollHeight || 80;
    el.style.maxHeight  = '0px';
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(-8px)';
    el.style.transition = `max-height ${duration}ms cubic-bezier(0.16,1,0.3,1),
                            opacity ${duration}ms ease,
                            transform ${duration}ms cubic-bezier(0.16,1,0.3,1)`;
    requestAnimationFrame(() => {
      el.style.maxHeight = h + 20 + 'px';
      el.style.opacity   = '1';
      el.style.transform = 'translateY(0)';
    });
    el._slideTimer = setTimeout(() => {
      el.style.overflow = el.style.maxHeight = el.style.transition = '';
    }, duration + 20);
  } else {
    const h = el.scrollHeight;
    el.style.overflow   = 'hidden';
    el.style.maxHeight  = h + 'px';
    el.style.opacity    = '1';
    el.style.transform  = 'translateY(0)';
    el.style.transition = `max-height ${duration}ms cubic-bezier(0.16,1,0.3,1),
                            opacity ${Math.round(duration * 0.6)}ms ease,
                            transform ${duration}ms cubic-bezier(0.16,1,0.3,1)`;
    requestAnimationFrame(() => {
      el.style.maxHeight = '0px';
      el.style.opacity   = '0';
      el.style.transform = 'translateY(-8px)';
    });
    el._slideTimer = setTimeout(() => {
      el.style.display = 'none';
      el.style.transition = '';
    }, duration + 20);
  }
}

function addRipple(btn) {
  btn.style.position   = btn.style.position || 'relative';
  btn.style.overflow   = 'hidden';
  btn.addEventListener('pointerdown', e => {
    const r    = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size/2}px;top:${e.clientY - r.top - size/2}px`;
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  });
}

function flashIn(el, y = 14, scale = 0.97) {
  el.style.transition = 'none';
  el.style.opacity    = '0';
  el.style.transform  = `translateY(${y}px) scale(${scale})`;
  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1)';
    el.style.opacity    = '1';
    el.style.transform  = 'translateY(0) scale(1)';
  });
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════

function initializeApp() {
  loadRiskPresets();
  updateAccountPresetsList();
  populateCustomSignalName();
  onSignalTypeChange();

  // Ripples on all buttons
  document.querySelectorAll('button').forEach(addRipple);

  // Staggered entrance
  document.querySelectorAll('.field-group, .header, .header-rule').forEach((el, i) => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(20px)';
    el.style.transition = `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${60 + i * 50}ms,
                            transform 0.5s cubic-bezier(0.16,1,0.3,1) ${60 + i * 50}ms`;
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  });
}

// ── Storage ────────────────────────────────────────────────────
function getStoredData(key, def) {
  try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : def; }
  catch { return def; }
}
function saveStoredData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

function getCustomConfig() { return getStoredData(STORAGE_KEY_CUSTOM, DEFAULT_CUSTOM); }

function populateCustomSignalName() {
  const cfg = getCustomConfig();
  const opt = document.querySelector('#signalType option[value="custom"]');
  if (opt) opt.textContent = cfg.name || 'Custom';
}

// ══════════════════════════════════════════════════════════════
//  UI TOGGLES
// ══════════════════════════════════════════════════════════════

function onDcaModeChange() {
  const mode   = document.getElementById('dcaMode').value;
  const signal = document.getElementById('signalType').value;
  const group  = document.getElementById('dcaGroup');
  const needs  = signal === 'sherlock' || mode === 'with';
  const vis    = group.style.display !== 'none' && group.style.opacity !== '0';
  if (needs && !vis)  slideToggle(group, true);
  if (!needs && vis)  slideToggle(group, false);
  updatePnlPreview();
}

function onSignalTypeChange() {
  const signal = document.getElementById('signalType').value;
  const rp     = getStoredData(STORAGE_KEY_RISK, DEFAULT_RISK_PRESETS);
  const riskEl = document.getElementById('riskPercent');

  // Animate risk value change
  const prevRisk = parseFloat(riskEl.value) || 0;
  const newRisk  = rp[signal] ?? DEFAULT_RISK_PRESETS[signal] ?? 5;
  animateNumber(riskEl, prevRisk, newRisk, 300, '', '', 1);
  setTimeout(() => { riskEl.value = newRisk; }, 310);

  const dcaWithBtn    = document.getElementById('dcaWithBtn');
  const dcaWithoutBtn = document.getElementById('dcaWithoutBtn');

  if (signal === 'sherlock') {
    _setDcaMode('with', true);
    [dcaWithBtn, dcaWithoutBtn].forEach(b => { b.disabled = true; b.style.opacity = '0.45'; });
  } else {
    [dcaWithBtn, dcaWithoutBtn].forEach(b => { b.disabled = false; b.style.opacity = ''; });
  }

  onDcaModeChange();
  updatePnlPreview();
}

// Internal silent setDcaMode (no re-trigger)
function _setDcaMode(mode, silent = false) {
  document.getElementById('dcaMode').value = mode;
  document.getElementById('dcaWithBtn').classList.toggle('active', mode === 'with');
  document.getElementById('dcaWithoutBtn').classList.toggle('active', mode === 'without');
  if (!silent && typeof onDcaModeChange === 'function') onDcaModeChange();
}

// ══════════════════════════════════════════════════════════════
//  LIVE PREVIEW
// ══════════════════════════════════════════════════════════════

let _lastRisk = null;

function updatePnlPreview() {
  const balance   = parseFloat(document.getElementById('balance').value);
  const riskPct   = parseFloat(document.getElementById('riskPercent').value);
  const entry     = parseFloat(document.getElementById('entry').value);
  const sl        = parseFloat(document.getElementById('sl').value);
  const direction = document.getElementById('direction').value;
  const signal    = document.getElementById('signalType').value;
  const dca       = parseFloat(document.getElementById('dca').value);
  const dcaMode   = document.getElementById('dcaMode').value;
  const preview   = document.getElementById('pnlPreview');
  const active    = preview.classList.contains('active');

  const bad = isNaN(balance) || isNaN(riskPct) || isNaN(entry) || isNaN(sl);
  const slBad = !bad && (direction === 'long' ? sl >= entry : sl <= entry);
  const needsDca = signal === 'sherlock' || dcaMode === 'with';
  const dcaBad = needsDca && isNaN(dca);

  if (bad || slBad || dcaBad) {
    if (active) {
      preview.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      preview.style.opacity    = '0';
      preview.style.transform  = 'translateY(-4px)';
      setTimeout(() => {
        preview.classList.remove('active');
        preview.style.cssText = '';
        _lastRisk = null;
      }, 200);
    }
    return;
  }

  const riskAmount = balance * (riskPct / 100);

  if (!active) {
    preview.classList.add('active');
    flashIn(preview, 8, 0.99);
    _lastRisk = null;
  }

  const riskEl = document.getElementById('pnlRiskAmount');
  if (_lastRisk !== riskAmount) {
    animateNumber(riskEl, _lastRisk ?? riskAmount, riskAmount, 380, '-$', '', 2);
    _lastRisk = riskAmount;
  }

  document.getElementById('pnlWorstCase').textContent = `-$${riskAmount.toFixed(2)} (${riskPct.toFixed(1)}%)`;
  document.getElementById('pnlBreakEven').textContent  = `$0 @ $${entry.toFixed(4)}`;
}

// ══════════════════════════════════════════════════════════════
//  CALCULATION
// ══════════════════════════════════════════════════════════════

function calculate() {
  const signal    = document.getElementById('signalType').value;
  const dcaMode   = document.getElementById('dcaMode').value;
  const direction = document.getElementById('direction').value;
  const balance   = parseFloat(document.getElementById('balance').value);
  const riskPct   = parseFloat(document.getElementById('riskPercent').value);
  const entry     = parseFloat(document.getElementById('entry').value);
  const dca       = parseFloat(document.getElementById('dca').value);
  const sl        = parseFloat(document.getElementById('sl').value);
  const resultDiv = document.getElementById('result');

  if (navigator.vibrate) navigator.vibrate(10);

  if (isNaN(balance) || isNaN(riskPct) || isNaN(entry) || isNaN(sl)) {
    err(resultDiv, 'Fill in all required fields.'); return;
  }
  if (direction === 'long'  && sl >= entry) { err(resultDiv, 'SL must be below entry for a Long.');  return; }
  if (direction === 'short' && sl <= entry) { err(resultDiv, 'SL must be above entry for a Short.'); return; }

  const entrySlDist = direction === 'long' ? (entry - sl) : (sl - entry);
  if (entrySlDist <= 0) { err(resultDiv, 'Invalid SL distance.'); return; }

  // Sherlock
  if (signal === 'sherlock') {
    if (isNaN(dca)) { err(resultDiv, 'Sherlock requires a DCA price.'); return; }
    if (direction === 'long'  && dca >= entry) { err(resultDiv, 'DCA must be below entry for a Long.');  return; }
    if (direction === 'short' && dca <= entry) { err(resultDiv, 'DCA must be above entry for a Short.'); return; }
    const rp   = getStoredData(STORAGE_KEY_RISK, DEFAULT_RISK_PRESETS);
    const risk = (rp.sherlock ?? 1) / 100 * balance;
    const d1   = direction === 'long' ? (entry - sl) : (sl - entry);
    const d2   = direction === 'long' ? (dca   - sl) : (sl - dca);
    const sz   = risk / (d1 + d2);
    ok(resultDiv, [
      { label: 'Entry Size', value: sz.toFixed(4),             unit: 'tokens' },
      { label: 'Entry USD',  value: '$' + (sz * entry).toFixed(2) },
      { label: 'DCA Size',   value: sz.toFixed(4),             unit: 'tokens' },
      { label: 'DCA USD',    value: '$' + (sz * dca).toFixed(2) },
      { label: 'Risk Used',  value: (rp.sherlock ?? 1) + '% = $' + risk.toFixed(2), full: true },
    ]); return;
  }

  // Custom signal
  if (signal === 'custom') {
    const cfg  = getCustomConfig();
    const mult = parseFloat(cfg.multiplier) || 1;
    const risk = balance * (riskPct / 100);
    if (dcaMode === 'without') {
      const sz = risk / entrySlDist;
      ok(resultDiv, [
        { label: 'Entry Size', value: sz.toFixed(4), unit: 'tokens' },
        { label: 'Entry USD',  value: '$' + (sz * entry).toFixed(2) },
        { label: 'Mode',       value: 'No DCA — single entry', full: true, muted: true },
      ]); return;
    }
    if (isNaN(dca)) { err(resultDiv, 'Enter a DCA price.'); return; }
    if (direction === 'long'  && dca >= entry) { err(resultDiv, 'DCA must be below entry for a Long.');  return; }
    if (direction === 'short' && dca <= entry) { err(resultDiv, 'DCA must be above entry for a Short.'); return; }
    const dcaSlDist = direction === 'long' ? (dca - sl) : (sl - dca);
    const denom     = entrySlDist + mult * dcaSlDist;
    if (denom <= 0) { err(resultDiv, 'Invalid price levels.'); return; }
    const main = risk / denom;
    ok(resultDiv, [
      { label: 'Entry Size',     value: main.toFixed(4),           unit: 'tokens' },
      { label: 'Entry USD',      value: '$' + (main * entry).toFixed(2) },
      { label: 'DCA Size',       value: (main * mult).toFixed(4),  unit: 'tokens' },
      { label: 'DCA USD',        value: '$' + (main * mult * dca).toFixed(2) },
      { label: 'DCA Multiplier', value: mult + 'x', full: true },
    ]); return;
  }

  // Saltwayer / Neil
  const risk = balance * (riskPct / 100);
  if (dcaMode === 'without') {
    const sz = risk / entrySlDist;
    ok(resultDiv, [
      { label: 'Entry Size', value: sz.toFixed(4), unit: 'tokens' },
      { label: 'Entry USD',  value: '$' + (sz * entry).toFixed(2) },
      { label: 'Mode',       value: 'No DCA — single entry', full: true, muted: true },
    ]); return;
  }
  if (isNaN(dca)) { err(resultDiv, 'Enter a DCA price.'); return; }
  if (direction === 'long'  && dca >= entry) { err(resultDiv, 'DCA must be below entry for a Long.');  return; }
  if (direction === 'short' && dca <= entry) { err(resultDiv, 'DCA must be above entry for a Short.'); return; }
  const dcaSlDist = direction === 'long' ? (dca - sl) : (sl - dca);
  const mult      = signal === 'saltwayer' ? 2.5 : 2;
  const denom     = entrySlDist + mult * dcaSlDist;
  if (denom <= 0) { err(resultDiv, 'Invalid price levels.'); return; }
  const main = risk / denom;
  ok(resultDiv, [
    { label: 'Entry Size',     value: main.toFixed(4),          unit: 'tokens' },
    { label: 'Entry USD',      value: '$' + (main * entry).toFixed(2) },
    { label: 'DCA Size',       value: (main * mult).toFixed(4), unit: 'tokens' },
    { label: 'DCA USD',        value: '$' + (main * mult * dca).toFixed(2) },
    { label: 'DCA Multiplier', value: mult + 'x', full: true },
  ]);
}

function ok(div, rows) {
  div.style.display = 'block';
  div.innerHTML = `<div class="result-grid">${rows.map(r => `
    <div class="result-item${r.full ? ' result-item--full' : ''}">
      <span class="result-label">${r.label}</span>
      <span class="result-value${r.muted ? ' muted' : ''}">${r.value}${r.unit ? ` <span class="unit">${r.unit}</span>` : ''}</span>
    </div>`).join('')}</div>`;
  flashIn(div);
}

function err(div, msg) {
  div.style.display = 'block';
  div.innerHTML = `<div class="result-error">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    ${msg}</div>`;
  flashIn(div, 6, 1);
  // Shake
  div.style.animation = 'shake 0.35s cubic-bezier(0.36,0.07,0.19,0.97)';
  div.addEventListener('animationend', () => { div.style.animation = ''; }, { once: true });
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS MODAL
// ══════════════════════════════════════════════════════════════

function openSettings() {
  const overlay = document.getElementById('settingsModal');
  overlay.classList.add('active');
  loadRiskPresets();
  loadCustomSettings();
  updateAccountPresetsList();
  // Attach ripples to dynamically added buttons
  setTimeout(() => overlay.querySelectorAll('button').forEach(addRipple), 50);
}

function closeSettings() {
  const overlay = document.getElementById('settingsModal');
  const modal   = overlay.querySelector('.modal');
  modal.style.transition   = 'transform 0.3s cubic-bezier(0.4,0,1,1)';
  modal.style.transform    = 'translateY(100%)';
  overlay.style.transition = 'opacity 0.3s ease';
  overlay.style.opacity    = '0';
  setTimeout(() => {
    overlay.classList.remove('active');
    modal.style.cssText = '';
    overlay.style.cssText = '';
  }, 310);
}

function switchTab(tab, btn) {
  const cur = document.querySelector('.tab-content.active');
  if (cur) {
    cur.style.transition = 'opacity 0.14s ease';
    cur.style.opacity    = '0';
  }
  setTimeout(() => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const next = document.getElementById(tab + 'Tab');
    next.classList.add('active');
    next.style.opacity   = '0';
    next.style.transform = 'translateX(10px)';
    next.style.transition = 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1)';
    requestAnimationFrame(() => { next.style.opacity = '1'; next.style.transform = 'translateX(0)'; });
    btn.classList.add('active');
    if (cur) { cur.style.transition = ''; cur.style.opacity = ''; }
  }, cur ? 140 : 0);
}

// ── Account presets ────────────────────────────────────────────
function saveAccountPreset() {
  const name    = document.getElementById('presetName').value.trim();
  const balance = parseFloat(document.getElementById('balance').value);
  if (!name)         { showNotification('Enter a preset name', true); return; }
  if (isNaN(balance)){ showNotification('Enter a valid balance first', true); return; }
  const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
  accounts[name] = balance;
  saveStoredData(STORAGE_KEY_ACCOUNTS, accounts);
  document.getElementById('presetName').value = '';
  updateAccountPresetsList();
  showNotification(`"${name}" saved`);
}

function loadAccountPreset(name) {
  const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
  if (accounts[name] !== undefined) {
    const balEl   = document.getElementById('balance');
    const prevVal = parseFloat(balEl.value) || 0;
    balEl.value   = accounts[name];
    animateNumber(balEl, prevVal, accounts[name], 350, '', '', 2);
    setTimeout(() => { balEl.value = accounts[name]; }, 360);
    updatePnlPreview();
    closeSettings();
    showNotification(`Loaded "${name}"`);
  }
}

function deleteAccountPreset(name) {
  if (!confirm(`Delete preset "${name}"?`)) return;
  const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
  delete accounts[name];
  saveStoredData(STORAGE_KEY_ACCOUNTS, accounts);
  updateAccountPresetsList();
  showNotification(`"${name}" deleted`);
}

function updateAccountPresetsList() {
  const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
  const list     = document.getElementById('accountPresetsList');
  if (!Object.keys(accounts).length) {
    list.innerHTML = '<div class="empty-state">No presets saved yet</div>'; return;
  }
  list.innerHTML = Object.entries(accounts).map(([name, bal]) => `
    <div class="preset-item">
      <div class="preset-item-info">
        <div class="preset-item-name">${name}</div>
        <div class="preset-item-value">$${parseFloat(bal).toFixed(2)}</div>
      </div>
      <div class="preset-item-actions">
        <button class="preset-btn" onclick="loadAccountPreset('${name}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Load
        </button>
        <button class="preset-btn preset-btn--danger" onclick="deleteAccountPreset('${name}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.preset-item').forEach((el, i) => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = `opacity 0.25s ease ${i * 40}ms, transform 0.25s cubic-bezier(0.16,1,0.3,1) ${i * 40}ms`;
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  });
}

// ── Risk presets ───────────────────────────────────────────────
function loadRiskPresets() {
  const r = getStoredData(STORAGE_KEY_RISK, DEFAULT_RISK_PRESETS);
  document.getElementById('riskSaltwayer').value = r.saltwayer ?? 5;
  document.getElementById('riskNeil').value      = r.neil      ?? 4;
  document.getElementById('riskSherlock').value  = r.sherlock  ?? 1;
  document.getElementById('riskCustom').value    = r.custom    ?? 3;
}

function saveRiskPresets() {
  const s  = parseFloat(document.getElementById('riskSaltwayer').value);
  const n  = parseFloat(document.getElementById('riskNeil').value);
  const sh = parseFloat(document.getElementById('riskSherlock').value);
  const cu = parseFloat(document.getElementById('riskCustom').value);
  if ([s, n, sh, cu].some(v => isNaN(v) || v <= 0)) {
    showNotification('All values must be > 0', true); return;
  }
  saveStoredData(STORAGE_KEY_RISK, { saltwayer: s, neil: n, sherlock: sh, custom: cu });
  showNotification('Risk presets saved');
}

// ── Custom signal ──────────────────────────────────────────────
function loadCustomSettings() {
  const cfg = getCustomConfig();
  document.getElementById('customSignalName').value       = cfg.name       ?? 'Custom';
  document.getElementById('customSignalMultiplier').value = cfg.multiplier ?? 1;
}

function saveCustomSettings() {
  const name = document.getElementById('customSignalName').value.trim() || 'Custom';
  const mult = parseFloat(document.getElementById('customSignalMultiplier').value);
  if (isNaN(mult) || mult < 0.1) { showNotification('Multiplier must be ≥ 0.1', true); return; }
  saveStoredData(STORAGE_KEY_CUSTOM, { name, multiplier: mult });
  const opt = document.querySelector('#signalType option[value="custom"]');
  if (opt) opt.textContent = name;
  if (document.getElementById('signalType').value === 'custom') onSignalTypeChange();
  showNotification(`"${name}" saved`);
}

function stepMultiplier(delta) {
  const el  = document.getElementById('customSignalMultiplier');
  const cur = parseFloat(el.value) || 1;
  const nxt = Math.max(0.1, parseFloat((cur + delta).toFixed(2)));
  animateNumber(el, cur, nxt, 180, '', '', 2);
  setTimeout(() => { el.value = nxt; }, 185);
}

// ══════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

function showNotification(message, isError = false) {
  document.querySelectorAll('.notification').forEach(n => n.remove());
  const n = document.createElement('div');
  n.className = `notification${isError ? ' notification--error' : ''}`;
  n.innerHTML = `
    ${isError
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`}
    <span>${message}</span>`;
  document.body.appendChild(n);
  requestAnimationFrame(() => n.classList.add('visible'));
  setTimeout(() => {
    n.style.transition = 'opacity 0.28s ease, transform 0.28s cubic-bezier(0.4,0,1,1)';
    n.style.opacity    = '0';
    n.style.transform  = 'translate(-50%, 10px)';
    setTimeout(() => n.remove(), 290);
  }, 2600);
}

// ══════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', initializeApp);
