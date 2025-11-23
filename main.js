const STORAGE_KEY_ACCOUNTS = 'position_calculator_accounts';
const STORAGE_KEY_RISK = 'position_calculator_risk';
const DEFAULT_RISK_PRESETS = { saltwayer: 5, neil: 4 };

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
    
function initializeApp() {
    loadRiskPresets();
    updateAccountPresetsList();
    onDcaModeChange();
}

function getStoredData(key, defaultValue) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
}

function saveStoredData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function onDcaModeChange() {
    const dcaMode = document.getElementById("dcaMode").value;
    const dcaGroup = document.getElementById("dcaGroup");
    if (dcaMode === "without") {
        dcaGroup.classList.add("hidden");
    } else {
        dcaGroup.classList.remove("hidden");
    }
    updatePnlPreview();
}

function onSignalTypeChange() {
    const signalType = document.getElementById("signalType").value;
    const riskPresets = getStoredData(STORAGE_KEY_RISK, DEFAULT_RISK_PRESETS);
    const riskPercent = riskPresets[signalType] || (signalType === "saltwayer" ? 5 : 4);
    document.getElementById("riskPercent").value = riskPercent;
    updatePnlPreview();
}

function updatePnlPreview() {
    const balance = parseFloat(document.getElementById("balance").value);
    const riskPercent = parseFloat(document.getElementById("riskPercent").value);
    const entry = parseFloat(document.getElementById("entry").value);
    const sl = parseFloat(document.getElementById("sl").value);
    const dcaMode = document.getElementById("dcaMode").value;
    const dca = parseFloat(document.getElementById("dca").value);
    const pnlPreview = document.getElementById("pnlPreview");

    if (isNaN(balance) || isNaN(riskPercent) || isNaN(entry) || isNaN(sl)) {
        pnlPreview.classList.remove("active");
        return;
    }

    if (dcaMode === "with" && isNaN(dca)) {
        pnlPreview.classList.remove("active");
        return;
    }

    const riskAmount = balance * (riskPercent / 100);
    const priceDiff = Math.abs(entry - sl);
    const breakEven = entry;

    document.getElementById("pnlRiskAmount").textContent = `-$${riskAmount.toFixed(2)}`;
    document.getElementById("pnlWorstCase").textContent = `-$${riskAmount.toFixed(2)} (${riskPercent.toFixed(1)}%)`;
    document.getElementById("pnlBreakEven").textContent = `$0 @ $${breakEven.toFixed(4)}`;

    pnlPreview.classList.add("active");
}

function calculate() {
    let type = document.getElementById("signalType").value;
    let dcaMode = document.getElementById("dcaMode").value;

    let balance = parseFloat(document.getElementById("balance").value);
    let riskPercent = parseFloat(document.getElementById("riskPercent").value);
    let entry = parseFloat(document.getElementById("entry").value);
    let dca = parseFloat(document.getElementById("dca").value);
    let sl = parseFloat(document.getElementById("sl").value);

    const resultDiv = document.getElementById("result");

    if (isNaN(balance) || isNaN(riskPercent) || isNaN(entry) || isNaN(sl)) {
        resultDiv.style.display = "block";
        resultDiv.innerHTML = "Please fill all required fields.";
        resultDiv.style.animation = "none";
        setTimeout(() => {
            resultDiv.style.animation = "fadeIn 0.5s ease-out forwards";
        }, 10);
        return;
    }

    let risk = balance * (riskPercent / 100);

    if (dcaMode === "without") {
        let mainSize = risk / (entry - sl);

        resultDiv.style.display = "block";
        resultDiv.innerHTML = `
            <strong>Main Entry Size:</strong> ${mainSize.toFixed(4)} tokens<br>
            <strong>DCA Size:</strong> None (No DCA)
        `;
        resultDiv.style.animation = "none";
        setTimeout(() => {
            resultDiv.style.animation = "fadeIn 0.5s ease-out forwards";
        }, 10);
        return;
    }

    if (isNaN(dca)) {
        resultDiv.style.display = "block";
        resultDiv.innerHTML = "Enter a DCA price.";
        resultDiv.style.animation = "none";
        setTimeout(() => {
            resultDiv.style.animation = "fadeIn 0.5s ease-out forwards";
        }, 10);
        return;
    }

    let multiplier = type === "saltwayer" ? 2.5 : 2;

    let denominator = (entry - sl) + multiplier * (dca - sl);
    let mainSize = risk / denominator;
    let dcaSize = mainSize * multiplier;

    resultDiv.style.display = "block";
    resultDiv.innerHTML = `
        <strong>Main Entry Size:</strong> ${mainSize.toFixed(4)} tokens<br>
        <strong>DCA Size:</strong> ${dcaSize.toFixed(4)} tokens
    `;
    resultDiv.style.animation = "none";
    setTimeout(() => {
        resultDiv.style.animation = "fadeIn 0.5s ease-out forwards";
    }, 10);
}

function openSettings() {
    document.getElementById("settingsModal").classList.add("active");
    loadRiskPresets();
    updateAccountPresetsList();
}

function closeSettings() {
    document.getElementById("settingsModal").classList.remove("active");
}

function switchTab(tab) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));

    document.getElementById(tab + "Tab").classList.add("active");
    event.target.classList.add("active");
}

function saveAccountPreset() {
    const presetName = document.getElementById("presetName").value.trim();
    const balance = parseFloat(document.getElementById("balance").value);

    if (!presetName) {
        showNotification("Please enter a preset name", true);
        return;
    }

    if (isNaN(balance)) {
        showNotification("Please enter a valid balance", true);
        return;
    }

    const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
    accounts[presetName] = balance;
    saveStoredData(STORAGE_KEY_ACCOUNTS, accounts);

    document.getElementById("presetName").value = "";
    updateAccountPresetsList();
    showNotification(`Preset "${presetName}" saved successfully`);
}

function loadAccountPreset(presetName) {
    const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
    const balance = accounts[presetName];
    if (balance !== undefined) {
        document.getElementById("balance").value = balance;
        updatePnlPreview();
        showNotification(`Preset "${presetName}" loaded`);
    }
}

function deleteAccountPreset(presetName) {
    if (confirm(`Delete preset "${presetName}"?`)) {
        const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
        delete accounts[presetName];
        saveStoredData(STORAGE_KEY_ACCOUNTS, accounts);
        updateAccountPresetsList();
        showNotification(`Preset "${presetName}" deleted`);
    }
}

function updateAccountPresetsList() {
    const accounts = getStoredData(STORAGE_KEY_ACCOUNTS, {});
    const presetList = document.getElementById("accountPresetsList");

    if (Object.keys(accounts).length === 0) {
        presetList.innerHTML = '<div style="color: #a0d8f1; text-align: center; padding: 20px;">No presets saved yet</div>';
        return;
    }

    presetList.innerHTML = Object.entries(accounts).map(([name, balance]) => `
        <div class="preset-item">
            <div class="preset-item-info">
                <div class="preset-item-name">${name}</div>
                <div class="preset-item-value">$${balance.toFixed(2)}</div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="preset-item-btn" onclick="loadAccountPreset('${name}')">Load</button>
                <button class="preset-item-btn" onclick="deleteAccountPreset('${name}')">Delete</button>
            </div>
        </div>
    `).join("");
}

function loadRiskPresets() {
    const riskPresets = getStoredData(STORAGE_KEY_RISK, DEFAULT_RISK_PRESETS);
    document.getElementById("riskSaltwayer").value = riskPresets.saltwayer || 5;
    document.getElementById("riskNeil").value = riskPresets.neil || 4;
}

function saveRiskPresets() {
    const saltwayerRisk = parseFloat(document.getElementById("riskSaltwayer").value);
    const neilRisk = parseFloat(document.getElementById("riskNeil").value);

    if (isNaN(saltwayerRisk) || isNaN(neilRisk) || saltwayerRisk <= 0 || neilRisk <= 0) {
        showNotification("Please enter valid risk percentages", true);
        return;
    }

    const riskPresets = {
        saltwayer: saltwayerRisk,
        neil: neilRisk
    };
    saveStoredData(STORAGE_KEY_RISK, riskPresets);
    showNotification("Risk presets saved successfully");
}

function showNotification(message, isError = false) {
    const notification = document.createElement("div");
    notification.className = `notification${isError ? " error" : ""}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

document.addEventListener("DOMContentLoaded", initializeApp);