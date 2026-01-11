const UI = {
  btnAnalyze: document.getElementById("btn-analyze"),
  btnSettings: document.getElementById("btn-settings"),
  btnCloseSettings: document.getElementById("close-settings"),
  btnSaveSettings: document.getElementById("save-settings"),
  btnCopy: document.getElementById("btn-copy"),

  repoDisplay: document.querySelector("#repo-display .value"),
  terminal: document.getElementById("terminal-output"),
  resultSection: document.getElementById("result-section"),
  modal: document.getElementById("settings-modal"),

  tabs: document.querySelectorAll(".tab"),
  inputs: {
    url: document.getElementById("cfg-url"),
    key: document.getElementById("cfg-key"),
    model: document.getElementById("cfg-model"),
  }
};

// --- Initialization ---
loadSettings();

// --- Event Listeners ---
UI.btnSettings.onclick = () => UI.modal.classList.remove("hidden");
UI.btnCloseSettings.onclick = () => UI.modal.classList.add("hidden");
UI.btnSaveSettings.onclick = saveSettings;

UI.btnAnalyze.onclick = () => {
  UI.btnAnalyze.disabled = true;
  UI.resultSection.classList.add("hidden");
  clearTerminal();
  log("INFO", "Initializing analysis sequence...");
  chrome.runtime.sendMessage({ type: "START_ANALYSIS" });
};

// Tab Switching
UI.tabs.forEach(tab => {
  tab.onclick = () => {
    // 1. UI Switch
    UI.tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    // 2. Content Switch
    document.querySelectorAll(".code-content").forEach(c => c.classList.add("hidden"));
    document.getElementById(`code-${tab.dataset.target}`).classList.remove("hidden");
  };
});

// Copy Function
UI.btnCopy.onclick = () => {
  const activeCode = document.querySelector(".code-content:not(.hidden)");
  if(activeCode) {
    navigator.clipboard.writeText(activeCode.textContent);
    log("SUCCESS", "Content copied to clipboard.");
  }
};

// --- Message Handling ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "UPDATE_STATUS") {
    const level = msg.isError ? "ERROR" : "INFO";
    log(level, msg.text);

    if (msg.isError) {
      UI.btnAnalyze.disabled = false;
    }
  }

  if (msg.type === "ANALYSIS_RESULT") {
    log("SUCCESS", "Analysis complete. Rendering results.");
    UI.btnAnalyze.disabled = false;
    UI.resultSection.classList.remove("hidden");

    // Fill Data
    const data = msg.data;
    document.getElementById("code-req").textContent = data.requirements || "# No requirements found";
    document.getElementById("code-dock").textContent = data.dockerfile || "# No Dockerfile generated";
    document.getElementById("ai-explanation").textContent = data.explanation || "No explanation provided.";

    // Update Repo info in UI if available
    UI.repoDisplay.textContent = "DONE";
    UI.repoDisplay.style.color = "var(--accent-primary)";
  }
});

// --- Helper Functions ---

function log(level, text) {
  const line = document.createElement("div");
  line.className = `log-line ${level.toLowerCase()}`;
  const time = new Date().toLocaleTimeString('en-US', {hour12: false, hour: "numeric", minute: "numeric", second: "numeric"});
  line.innerText = `[${time}] > ${text}`;
  UI.terminal.appendChild(line);
  UI.terminal.scrollTop = UI.terminal.scrollHeight;
}

function clearTerminal() {
  UI.terminal.innerHTML = "";
}

function saveSettings() {
  const config = {
    baseUrl: UI.inputs.url.value,
    apiKey: UI.inputs.key.value,
    model: UI.inputs.model.value
  };
  chrome.storage.local.set({ llmConfig: config }, () => {
    UI.modal.classList.add("hidden");
    log("SUCCESS", "Configuration saved securely.");
  });
}

function loadSettings() {
  chrome.storage.local.get(['llmConfig'], (res) => {
    if (res.llmConfig) {
      UI.inputs.url.value = res.llmConfig.baseUrl || "";
      UI.inputs.key.value = res.llmConfig.apiKey || "";
      UI.inputs.model.value = res.llmConfig.model || "";
    }
  });
}