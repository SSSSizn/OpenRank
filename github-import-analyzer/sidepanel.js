document.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM ----------
  const el = {
    btnScan: document.getElementById("btn-scan"),
    btnAi: document.getElementById("btn-ai"),
    btnCopy: document.getElementById("btn-copy"),
    btnDownload: document.getElementById("btn-download"),

    repoDisplay: document.querySelector("#repo-display .value"),
    resultSection: document.getElementById("result-section"),
    codeReq: document.getElementById("code-req"),
    codeDock: document.getElementById("code-dock"),
    lineNumbers: document.querySelector(".line-numbers"),
    terminal: document.getElementById("terminal-output"),

    aiInsightBox: document.getElementById("ai-insight-box"),
    aiExplanation: document.getElementById("ai-explanation"),
    tabs: document.querySelectorAll(".tab"),

    agentTrace: document.getElementById("agent-trace"),
    traceSteps: document.getElementById("trace-steps"),

    perceptionSummary: document.getElementById("perception-summary"),
    pcType: document.getElementById("pc-type"),
    pcPy: document.getElementById("pc-py"),
    pcImports: document.getElementById("pc-imports"),
    pcManifest: document.getElementById("pc-manifest"),
    pcExtra: document.getElementById("pc-extra"),

    evidenceSection: document.getElementById("evidence-section"),
    evidenceBreakdown: document.getElementById("evidence-breakdown"),
    evidenceTable: document.getElementById("evidence-table"),
    evidenceAvg: document.getElementById("evidence-avg"),

    verifyBox: document.getElementById("verify-box"),
    verifyContent: document.getElementById("verify-content"),

    btnSettings: document.getElementById("btn-settings"),
    btnCloseSettings: document.getElementById("close-settings"),
    btnSaveSettings: document.getElementById("save-settings"),
    modal: document.getElementById("settings-modal"),
    inputs: {
      url: document.getElementById("cfg-url"),
      key: document.getElementById("cfg-key"),
      model: document.getElementById("cfg-model"),
      githubToken: document.getElementById("cfg-github-token"),
    },
  };

  let scanData = null;

  loadSettings();
  initLineNumbers();

  // ---------- 行号同步 ----------
  function updateLineNumbers(text) {
    if (!text) {
      el.lineNumbers.innerHTML = "<span>1</span>";
      return;
    }
    const lines = text.split("\n").length;
    let html = "";
    for (let i = 1; i <= lines; i++) html += `<span>${i}</span>`;
    el.lineNumbers.innerHTML = html;
  }

  function syncScrollPositions() {
    const activeCode = document.querySelector(".code-content:not(.hidden)");
    if (activeCode && el.lineNumbers) {
      if (activeCode._scrollHandler) {
        activeCode.removeEventListener("scroll", activeCode._scrollHandler);
      }
      const newHandler = () => (el.lineNumbers.scrollTop = activeCode.scrollTop);
      activeCode._scrollHandler = newHandler;
      activeCode.addEventListener("scroll", newHandler);
    }
  }

  // ---------- Actions ----------
  el.btnScan.addEventListener("click", () => {
    resetState();
    el.btnScan.disabled = true;
    el.btnScan.querySelector(".btn-text").textContent = "RUNNING...";
    log("🚀 Initializing agent...", "info");
    el.agentTrace.classList.remove("hidden");
    chrome.runtime.sendMessage({ type: "SCAN_REPO" });
  });

  el.btnAi.addEventListener("click", () => {
    if (!scanData) return;
    el.btnAi.disabled = true;
    el.btnAi.querySelector(".btn-text").textContent = "SYNTHESIZING...";
    el.aiInsightBox.classList.remove("hidden");
    el.aiExplanation.textContent = "🤖 LLM is synthesizing evidence into final output...";
    log("Sending evidence bundle to LLM...", "info");
    chrome.runtime.sendMessage({ type: "ANALYZE_WITH_LLM", payload: scanData });
  });

  // ---------- Message Dispatcher ----------
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case "GITHUB_USER":
        renderGitHubUser(msg.user);
        break;

      case "UPDATE_STATUS":
        log(msg.text, msg.isError ? "error" : "info");
        if (msg.isError) {
          el.btnScan.disabled = false;
          el.btnScan.querySelector(".btn-text").textContent = "RE-RUN AGENT";
          if (el.btnAi) {
            el.btnAi.disabled = false;
            el.btnAi.querySelector(".btn-text").textContent = "✨ RETRY LLM";
          }
        }
        break;

      case "AGENT_START":
        if (msg.repoInfo) {
          el.repoDisplay.textContent = `${msg.repoInfo.owner}/${msg.repoInfo.repo}`;
          el.repoDisplay.style.color = "var(--neon-blue)";
        }
        break;

      case "AGENT_TRACE":
        renderTraceStep(msg.trace);
        break;

      case "PERCEPTION_DONE":
        renderPerception(msg.summary);
        break;

      case "RESOLVE_DONE":
        renderEvidence(msg.evidence, msg.sourceBreakdown, msg.avgConfidence);
        break;

      case "SCAN_COMPLETE":
        handleScanComplete(msg.data);
        break;

      case "AGENT_RESULT":
        handleAgentResult(msg.data);
        break;
    }
  });

  // ---------- Render: Trace ----------
  function renderTraceStep(t) {
    const li = document.createElement("li");
    li.className = `trace-step trace-${t.status || "ok"}`;
    li.dataset.step = t.step;

    // 若已有同 step 的节点，则更新而非新增
    const existing = el.traceSteps.querySelector(`[data-step="${t.step}"]`);
    const target = existing || li;

    target.innerHTML = `
      <div class="trace-step-head">
        <span class="trace-num">${t.step}</span>
        <span class="trace-action">${t.action}</span>
        <span class="trace-status">${t.status === "running" ? "…" : "✓"}</span>
      </div>
      ${
        t.observation
          ? `<div class="trace-obs">${formatObs(t.observation)}</div>`
          : ""
      }
    `;
    target.className = `trace-step trace-${t.status || "ok"}`;

    if (!existing) el.traceSteps.appendChild(li);
  }

  function formatObs(obs) {
    if (!obs) return "";
    return Object.entries(obs)
      .map(([k, v]) => {
        let val = v;
        if (Array.isArray(v)) val = v.slice(0, 4).join(", ") + (v.length > 4 ? `… +${v.length - 4}` : "");
        else if (typeof v === "object" && v !== null) val = JSON.stringify(v);
        return `<span class="trace-kv"><em>${k}</em>: ${val}</span>`;
      })
      .join(" · ");
  }

  // ---------- Render: Perception ----------
  function renderPerception(s) {
    el.perceptionSummary.classList.remove("hidden");
    el.pcType.textContent = s.projectType;
    el.pcPy.textContent = s.pythonVersion || "auto";
    el.pcImports.textContent = s.imports;
    el.pcManifest.textContent =
      s.manifestFound && s.manifestFound.length ? s.manifestFound.length : "0";

    let extra = "";
    if (s.cuda) extra += `<span class="chip cuda">CUDA ${s.cuda}</span>`;
    if (s.baseImage) extra += `<span class="chip">Base: ${s.baseImage}</span>`;
    if (s.entrypoint) extra += `<span class="chip">Entry: ${s.entrypoint}</span>`;
    if (s.osDeps && s.osDeps.length)
      extra += `<span class="chip apt">apt: ${s.osDeps.slice(0, 4).join(", ")}</span>`;
    if (s.manifestFound && s.manifestFound.length)
      extra += `<span class="chip ok">${s.manifestFound.join(" · ")}</span>`;
    el.pcExtra.innerHTML = extra;
  }

  // ---------- Render: Evidence ----------
  function renderEvidence(evidence, breakdown, avgConf) {
    el.evidenceSection.classList.remove("hidden");
    el.evidenceAvg.textContent = `avg ${(avgConf * 100).toFixed(0)}%`;

    el.evidenceBreakdown.innerHTML = Object.entries(breakdown || {})
      .map(
        ([src, count]) =>
          `<span class="src-badge src-${src.replace(/[^a-z]/gi, "")}">${src}: ${count}</span>`
      )
      .join(" ");

    el.evidenceTable.innerHTML = evidence
      .map((e) => {
        const confPct = (e.confidence * 100).toFixed(0);
        const bar = `<div class="conf-bar"><div class="conf-fill conf-L${e.level}" style="width:${confPct}%"></div></div>`;
        return `
          <div class="ev-row ev-L${e.level}">
            <span class="ev-pkg">${e.package}</span>
            <span class="ev-ver">${e.version || "UNKNOWN"}</span>
            <span class="ev-src">${e.source}</span>
            <span class="ev-conf">${bar}<em>${confPct}%</em></span>
          </div>
        `;
      })
      .join("");
  }

  // ---------- Render: Scan Complete ----------
  function handleScanComplete(data) {
    const { candidates, repoInfo, draftRequirements, draftDockerfile } = data;
    scanData = { candidates, repoInfo };

    log(`Scan completed — ${candidates.length} imports resolved.`, "success");

    el.btnScan.disabled = false;
    el.btnScan.classList.add("secondary");
    el.btnScan.querySelector(".btn-text").textContent = "RE-RUN AGENT";

    el.resultSection.classList.remove("hidden");
    el.btnAi.classList.remove("hidden");
    el.btnAi.disabled = false;

    el.codeReq.textContent = draftRequirements || "# No imports detected.";
    el.codeDock.textContent = draftDockerfile || "# Dockerfile draft unavailable.";
    updateLineNumbers(el.codeReq.textContent);
    syncScrollPositions();
    scrollToBottom();
  }

  // ---------- Render: AGENT_RESULT（LLM 后的最终结果 + 校验报告）----------
  function handleAgentResult(data) {
    el.codeReq.textContent = data.requirements || "# Error";
    el.codeDock.textContent = data.dockerfile || "# Error";

    el.aiInsightBox.classList.remove("hidden");
    el.aiExplanation.textContent = data.explanation || "No explanation provided.";

    // 校验报告
    if (data.verification) {
      el.verifyBox.classList.remove("hidden");
      el.verifyContent.innerHTML = renderVerification(data.verification);
    }

    log("✅ Final output synthesized & verified.", "success");

    el.btnAi.disabled = false;
    el.btnAi.querySelector(".btn-text").textContent = "✨ RE-SYNTHESIZE";

    const activeTab = document.querySelector(".tab.active").dataset.target;
    const activeText =
      activeTab === "req" ? el.codeReq.textContent : el.codeDock.textContent;
    updateLineNumbers(activeText);
    syncScrollPositions();
    scrollToBottom();
  }

  function renderVerification(v) {
    const halluc = v.hallucinated || [];
    const conflicts = v.compatibility?.conflicts || [];

    let html = "";
    if (halluc.length === 0 && conflicts.length === 0) {
      html += `<div class="verify-ok">✅ All ${v.existenceReport.length} packages verified on PyPI. No compatibility conflicts detected.</div>`;
    }
    if (halluc.length > 0) {
      html += `<div class="verify-warn">⚠️ Hallucinated versions auto-fixed (${halluc.length}):</div>`;
      html += `<ul class="verify-list">`;
      halluc.forEach((h) => {
        html += `<li><code>${h.name}==${h.version || "?"}</code> — <em>${h.reason}</em></li>`;
      });
      html += `</ul>`;
    }
    if (conflicts.length > 0) {
      html += `<div class="verify-warn">⚠️ Compatibility conflicts (${conflicts.length}):</div>`;
      html += `<ul class="verify-list">`;
      conflicts.forEach((c) => {
        html += `<li><code>${c.root}</code> requires <code>${c.requires}</code>, but got <code>${c.actual}</code></li>`;
      });
      html += `</ul>`;
    }
    return html;
  }

  function renderGitHubUser(user) {
    const ghEl = document.getElementById("github-user");
    if (user) {
      ghEl.innerHTML = `<img src="${user.avatar}" class="gh-avatar"><span>${user.login}</span>`;
      ghEl.classList.add("ok");
    } else {
      ghEl.textContent = "GitHub: Anonymous";
      ghEl.classList.remove("ok");
    }
  }

  // ---------- Tabs / Copy / Download ----------
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".code-content").forEach((c) => c.classList.add("hidden"));
      tab.classList.add("active");
      const targetId = tab.dataset.target;
      const targetEl = document.getElementById(`code-${targetId}`);
      targetEl.classList.remove("hidden");
      updateLineNumbers(targetEl.textContent);
      syncScrollPositions();
    });
  });

  el.btnCopy.addEventListener("click", () => {
    const activeTab = document.querySelector(".tab.active").dataset.target;
    const text = activeTab === "req" ? el.codeReq.textContent : el.codeDock.textContent;
    navigator.clipboard.writeText(text).then(() => {
      const original = el.btnCopy.textContent;
      el.btnCopy.textContent = "OK!";
      setTimeout(() => (el.btnCopy.textContent = original), 1500);
    });
  });

  el.btnDownload.addEventListener("click", () => {
    const activeTab = document.querySelector(".tab.active").dataset.target;
    const content = activeTab === "req" ? el.codeReq.textContent : el.codeDock.textContent;
    const filename = activeTab === "req" ? "requirements.txt" : "Dockerfile";
    if (!content) return;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---------- Settings ----------
  el.btnSettings.onclick = () => el.modal.classList.remove("hidden");
  el.btnCloseSettings.onclick = () => el.modal.classList.add("hidden");
  el.btnSaveSettings.onclick = () => {
    chrome.storage.local.set(
      {
        llmConfig: {
          baseUrl: el.inputs.url.value,
          apiKey: el.inputs.key.value,
          model: el.inputs.model.value,
        },
        githubToken: el.inputs.githubToken.value.trim(),
      },
      () => {
        el.modal.classList.add("hidden");
        log("Config saved.", "success");
      }
    );
  };

  function log(text, type = "info") {
    const div = document.createElement("div");
    div.className = `log-line ${type}`;
    div.textContent = text;
    el.terminal.appendChild(div);
    el.terminal.scrollTop = el.terminal.scrollHeight;
  }

  function resetState() {
    scanData = null;
    el.terminal.innerHTML = "";
    el.repoDisplay.textContent = "Waiting...";
    el.repoDisplay.style.color = "var(--text-main)";
    el.resultSection.classList.add("hidden");
    el.btnAi.classList.add("hidden");
    el.aiInsightBox.classList.add("hidden");
    el.verifyBox.classList.add("hidden");
    el.perceptionSummary.classList.add("hidden");
    el.evidenceSection.classList.add("hidden");
    el.agentTrace.classList.add("hidden");
    el.traceSteps.innerHTML = "";
    el.btnScan.classList.remove("secondary");
    updateLineNumbers("");
  }

  function scrollToBottom() {
    const main = document.querySelector("main");
    main.scrollTop = main.scrollHeight;
  }

  function loadSettings() {
    chrome.storage.local.get(["llmConfig", "githubToken"], (res) => {
      if (res.llmConfig) {
        el.inputs.url.value = res.llmConfig.baseUrl || "";
        el.inputs.key.value = res.llmConfig.apiKey || "";
        el.inputs.model.value = res.llmConfig.model || "";
      }
      el.inputs.githubToken.value = res.githubToken || "";
    });
  }

  function initLineNumbers() {
    let resizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const activeCode = document.querySelector(".code-content:not(.hidden)");
        if (activeCode && el.lineNumbers) {
          updateLineNumbers(activeCode.textContent);
          syncScrollPositions();
        }
      }, 300);
    });

    requestAnimationFrame(() => {
      const activeCode = document.querySelector(".code-content:not(.hidden)");
      if (activeCode && el.lineNumbers) {
        updateLineNumbers(activeCode.textContent);
        syncScrollPositions();
      }
    });
  }
});
