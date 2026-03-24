// ============================================================
//  CPS.CX - Position Calculator
//  v3.0 - Gold Edition
// ============================================================

const STORAGE_KEY_ACCOUNTS = 'position_calculator_accounts';
const STORAGE_KEY_RISK      = 'position_calculator_risk';
const DEFAULT_RISK_PRESETS  = { saltwayer: 5, neil: 4, sherlock: 1 };

// ── Service Worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// ── Init ──────────────────────────────────────────────────────
function initializeApp() {
  loadRiskPresets();
  updateAccountPresetsList();
  onDcaModeChange();
  onSignalTypeChange();
}

// ── Storage helpers ───────────────────────────────────────────
function getStoredData(key, defaultValue) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch { return defaultValue; }
}

function saveStoredData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── UI toggles ────────────────────────────────────────────────
function onDcaModeChange() {
  const dcaMode = document.getElementById('dcaMode').value;
  const dcaGroup = document.getElementById('dcaGroup');
  const signalType = document.getElementById('signalType').value;

  // Sherlock always needs DCA
  if (dcaMode === 'without' && signalType !== 'sherlock') {
    dcaGroup.classList.add('hidden');
  } else {
    dcaGroup.classList.remove('hidden');
  }
  updatePnlPreview();
}

function onSignalTypeChange() {
  const signalType = document.getElementById('signalType').value;
  const riskPresets = getStoredData(STORAGE_KEY_RISK, DEFAULT_RISK_PRESETS);
  const dcaMode = document.getElementById('dcaMode').value;

  // Auto-fill risk from preset
  let riskPercent = riskPresets[signalType] ?? DEFAULT_RISK_PRESETS[signalType] ?? 5;
  document.getElementById('riskPercent').value = riskPercent;

  // Sherlock always requires DCA - lock the select
  const dcaSelect = document.getElementById('dcaMode');
  if (signalType === 'sherlock') {
    dcaSelect.value = 'with';
    dcaSelect.disabled = true;
    document.getElementById('dcaGroup').classList.remove('hidden');
  } else {
    dcaSelect.disabled = false;
    onDcaModeChange();
  }

  updatePnlPreview();
}

// ── Live preview ──────────────────────────────────────────────
function updatePnlPreview() {
  const balance    = parseFloat(document.getElementById('balance').value);
  const riskPct    = parseFloat(document.getElementById('riskPercent').value);
  const entry      = parseFloat(document.getElementById('entry').value);
  const sl         = parseFloat(document.getElementById('sl').value);
  const direction  = document.getElementById('direction').value; // 'long' | 'short'
  const signalType = document.getElementById('signalType').value;
  const dca        = parseFloat(document.getElementById('dca').value);
  const dcaMode    = document.getElementById('dcaMode').value;
  const preview    = document.getElementById('pnlPreview');

  // Validate base fields
  if (isNaN(balance) || isNaN(riskPct) || isNaN(entry) || isNaN(sl)) {
    preview.classList.remove('active');
    return;
  }

  // Validate direction logic
  const slValid = direction === 'long' ? sl < entry : sl > entry;
  if (!slValid) {
    preview.classList.remove('active');
    return;
  }

  // Sherlock needs DCA to preview
  if (signalType === 'sherlock' && isNaN(dca)) {
    preview.classList.remove('active');
    return;
  }

  // Non-sherlock with DCA needs DCA price
  if (signalType !== 'sherlock' && dcaMode === 'with' && isNaN(dca)) {
    preview.classList.remove('active');
    return;
  }

  const riskAmount = balance * (riskPct / 100);

  document.getElementById('pnlRiskAmount').textContent = `-$${riskAmount.toFixed(2)}`;
  document.getElementById('pnlWorstCase').textContent  = `-$${riskAmount.toFixed(2)} (${riskPct.toFixed(1)}%)`;
  document.getElementById('pnlBreakEven').textContent  = `$0 @ $${entry.toFixed(4)}`;
  preview.classList.add('active');
}

// ── Main calculation ──────────────────────────────────────────
function calculate() {
  const signalType = document.getElementById('signalType').value;
  const dcaMode    = document.getElementById('dcaMode').value;
  const direction  = document.getElementById('direction').value;
  const balance    = parseFloat(document.getElementById('balance').value);
  const riskPct    = parseFloat(document.getElementById('riskPercent').value);
  const entry      = parseFloat(document.getElementById('entry').value);
  const dca        = parseFloat(document.getElementById('dca').value);
  const sl         = parseFloat(document.getElementById('sl').value);
  const resultDiv  = document.getElementById('result');

  // ── Validation ──
  if (isNaN(balance) || isNaN(riskPct) || isNaN(entry) || isNaN(sl)) {
    showResult(resultDiv, buildError('Fill in all required fields.'));
    return;
  }

  // Direction logic guard
  if (direction === 'long' && sl >= entry) {
    showResult(resultDiv, buildError('Stop loss must be below entry for a Long.'));
    return;
  }
  if (direction === 'short' && sl <= entry) {
    showResult(resultDiv, buildError('Stop loss must be above entry for a Short.'));
    return;
  }

  // ── Sherlock (same as old Shirus strategy) ──
  if (signalType === 'sherlock') {
    if (isNaN(dca)) {
      showResult(resultDiv, buildError('Sherlock strategy requires a DCA price.'));
      return;
    }

    // Validate DCA direction
    if (direction === 'long' && dca >= entry) {
      showResult(resultDiv, buildError('DCA must be below entry for a Long.'));
      return;
    }
    if (direction === 'short' && dca <= entry) {
      showResult(resultDiv, buildError('DCA must be above entry for a Short.'));
      return;
    }

    // Use the stored risk preset for Sherlock (bug fix #5)
    const riskPresets = getStoredData(STORAGE_KEY_RISK, DEFAULT_RISK_PRESETS);
    const sherlockRisk = riskPresets.sherlock ?? 1;
    const riskAmount = balance * (sherlockRisk / 100);

    // Correct signed distances for both long and short (bug fix #1, #6)
    const d1 = direction === 'long' ? (entry - sl) : (sl - entry);
    const d2 = direction === 'long' ? (dca - sl)   : (sl - dca);

    const size = riskAmount / (d1 + d2);
    const entryUsd = size * entry;
    const dcaUsd   = size * dca;

    showResult(resultDiv, `
      <div class="result-grid">
        <div class="result-item">
          <span class="result-label">Entry Size</span>
          <span class="result-value">${size.toFixed(4)} <span class="unit">tokens</span></span>
        </div>
        <div class="result-item">
          <span class="result-label">Entry USD</span>
          <span class="result-value">$${entryUsd.toFixed(2)}</span>
        </div>
        <div class="result-item">
          <span class="result-label">DCA Size</span>
          <span class="result-value">${size.toFixed(4)} <span class="unit">tokens</span></span>
        </div>
        <div class="result-item">
          <span class="result-label">DCA USD</span>
          <span class="result-value">$${dcaUsd.toFixed(2)}</span>
        </div>
        <div class="result-item result-item--full">
          <span class="result-label">Risk Used</span>
          <span class="result-value">${sherlockRisk}% = $${riskAmount.toFixed(2)}</span>
        </div>
      </div>
    `);
    return;
  }

  // ── Saltwayer / Neil ──
  const risk = balance * (riskPct / 100);

  // Signed entry-to-SL distance (always positive after this)
  const entrySlDist = direction === 'long' ? (entry - sl) : (sl - entry);

  if (entrySlDist <= 0) {
    showResult(resultDiv, buildError('Invalid SL distance. Check your prices and direction.'));
    return;
  }

  if (dcaMode === 'without') {
    const mainSize = risk / entrySlDist;
    showResult(resultDiv, `
      <div class="result-grid">
        <div class="result-item">
          <span class="result-label">Entry Size</span>
          <span class="result-value">${mainSize.toFixed(4)} <span class="unit">tokens</span></span>
        </div>
        <div class="result-item">
          <span class="result-label">Entry USD</span>
          <span class="result-value">$${(mainSize * entry).toFixed(2)}</span>
        </div>
        <div class="result-item result-item--full">
          <span class="result-label">No DCA</span>
          <span class="result-value muted">Single entry only</span>
        </div>
      </div>
    `);
    return;
  }

  // With DCA
  if (isNaN(dca)) {
    showResult(resultDiv, buildError('Enter a DCA price.'));
    return;
  }

  // Validate DCA direction
  if (direction === 'long' && dca >= entry) {
    showResult(resultDiv, buildError('DCA must be below entry for a Long.'));
    return;
  }
  if (direction === 'short' && dca <= entry) {
    showResult(resultDiv, buildError('DCA must be above entry for a Short.'));
    return;
  }

  const dcaSlDist = direction === 'long' ? (dca - sl) : (sl - dca);
  const multiplier = signalType === 'saltwayer' ? 2.5 : 2;

  const denominator = entrySlDist + multiplier * dcaSlDist;
  if (denominator <= 0) {
    showResult(resultDiv, buildError('Invalid price levels. Check DCA vs SL distance.'));
    return;
  }

  const mainSize = risk / denominator;
  const dcaSize  = mainSize * multiplier;

  showResult(resultDiv, `
    <div class="result-grid">
      <div class="result-item">
        <span class="result-label">Entry Size</span>
        <span class="result-value">${mainSize.toFixed(4)} <span class="unit">tokens</span></span>
      </div>
      <div class="result-item">
        <span class="result-label">Entry USD</span>
        <span class="result-value">$${(mainSize * entry).toFixed(2)}</span>
      </div>
      <div class="result-item">
        <span class="result-label">DCA Size</span>
        <span class="result-value">${dcaSize.toFixed(4)} <span class="unit">tokens</span></span>
      </div>
      <div class="result-item">
        <span class="result-label">DCA USD</span>
        <span class="result-value">$${(dcaSize * dca).toFixed(2)}</span>
      </div>
      <div class="result-item result-item--full">
        <span class="result-label">DCA Multiplier</span>
        <span class="result-value">${multiplier}x</span>
      </div>
    </div>
  `);
}

function buildError(msg) {
  return `<div class="result-error">${msg}</div>`;
}

function showResult(div, html) {
  div.style.display = 'block';
  div.innerHTML = html;
  div.style.animation = 'none';
  requestAnimationFrame(() => {
    div.style.animation = 'fadeSlideIn 0.35s ease-out forwards';
  });
}

// ── Settings modal ────────────────────────────────────────────
function openSettings() {
  document.getElementById('settingsModal').classList.add('active');
  loadRiskPresets();
  updateAccountPresetsList();
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
}

function switchTab(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tab + 'Tab').classList.add('active');
  btn.classList.add('active');
}

// ── Account presets ───────────────────────────────────────────
function saveAccountPreset() {
  const presetName = document.getElementById('presetName').value.trim();
  const balance    = parseFloat(document.getElementById('balance').value);

  if (!presetName) { showNotification('Enter a preset name', true); return; }
  if (isNaN(balance)) { showNotification('Enter a valid balance first', true); return; }

  const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
  accounts[presetName] = balance;
  saveStoredData(STORAGE_KEY_ACCOUNTS, accounts);
  document.getElementById('presetName').value = '';
  updateAccountPresetsList();
  showNotification(`"${presetName}" saved`);
}

function loadAccountPreset(presetName) {
  const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
  const balance  = accounts[presetName];
  if (balance !== undefined) {
    document.getElementById('balance').value = balance;
    updatePnlPreview();
    closeSettings();
    showNotification(`Loaded "${presetName}"`);
  }
}

function deleteAccountPreset(presetName) {
  if (confirm(`Delete preset "${presetName}"?`)) {
    const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
    delete accounts[presetName];
    saveStoredData(STORAGE_KEY_ACCOUNTS, accounts);
    updateAccountPresetsList();
    showNotification(`"${presetName}" deleted`);
  }
}

function updateAccountPresetsList() {
  const accounts    = getStoredData(STORAGE_KEY_ACCOUNTS, {});
  const presetList  = document.getElementById('accountPresetsList');

  if (Object.keys(accounts).length === 0) {
    presetList.innerHTML = '<div class="empty-state">No presets saved yet</div>';
    return;
  }

  presetList.innerHTML = Object.entries(accounts).map(([name, balance]) => `
    <div class="preset-item">
      <div class="preset-item-info">
        <div class="preset-item-name">${name}</div>
        <div class="preset-item-value">$${parseFloat(balance).toFixed(2)}</div>
      </div>
      <div class="preset-item-actions">
        <button class="preset-btn" onclick="loadAccountPreset('${name}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Load
        </button>
        <button class="preset-btn preset-btn--danger" onclick="deleteAccountPreset('${name}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

// ── Risk presets ──────────────────────────────────────────────
function loadRiskPresets() {
  const r = getStoredData(STORAGE_KEY_RISK, DEFAULT_RISK_PRESETS);
  document.getElementById('riskSaltwayer').value = r.saltwayer ?? 5;
  document.getElementById('riskNeil').value      = r.neil      ?? 4;
  document.getElementById('riskSherlock').value  = r.sherlock  ?? 1;
}

function saveRiskPresets() {
  const s = parseFloat(document.getElementById('riskSaltwayer').value);
  const n = parseFloat(document.getElementById('riskNeil').value);
  const sh = parseFloat(document.getElementById('riskSherlock').value);

  if ([s, n, sh].some(v => isNaN(v) || v <= 0)) {
    showNotification('Enter valid risk percentages (> 0)', true);
    return;
  }

  saveStoredData(STORAGE_KEY_RISK, { saltwayer: s, neil: n, sherlock: sh });
  showNotification('Risk presets saved');
}

// ── Notifications ─────────────────────────────────────────────
function showNotification(message, isError = false) {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const n = document.createElement('div');
  n.className = `notification${isError ? ' notification--error' : ''}`;
  n.innerHTML = `
    ${isError
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/>`
    }
    ${message}
  `;
  document.body.appendChild(n);

  requestAnimationFrame(() => n.classList.add('visible'));
  setTimeout(() => {
    n.classList.remove('visible');
    setTimeout(() => n.remove(), 300);
  }, 2800);
}

document.addEventListener('DOMContentLoaded', initializeApp);
