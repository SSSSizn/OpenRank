// sidepanel.js

const analyzeBtn = document.getElementById("analyze");
const statusContainer = document.getElementById("status-container");
const statusMsg = document.getElementById("status-msg");
const resultsDiv = document.getElementById("results");
const openOptionsBtn = document.getElementById("openOptions");
const copyBtn = document.getElementById("copyBtn");
const toast = document.getElementById("toast");

// 打开设置页
openOptionsBtn.onclick = () => chrome.runtime.openOptionsPage();

// 开始分析
analyzeBtn.onclick = () => {
  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = `<span>⏳ Analyzing...</span>`;
  statusContainer.style.display = "block";
  resultsDiv.style.display = "none";

  chrome.runtime.sendMessage({ type: "START_ANALYSIS" });
};

// 监听消息
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "UPDATE_STATUS") {
    statusMsg.textContent = msg.text;
    if (msg.isError) {
      statusContainer.style.background = "#ffebe9";
      statusContainer.style.borderColor = "#ff818266";
      statusContainer.style.color = "#cf222e";
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = `<span>🚀 Retry Analysis</span>`;
    }
  }

  if (msg.type === "ANALYSIS_RESULT") {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = `<span>🚀 Analyze Again</span>`;
    statusContainer.style.display = "none";
    resultsDiv.style.display = "block";

    const data = msg.data;
    document.getElementById("output-req").textContent = data.requirements || "# No requirements generated";
    document.getElementById("output-dock").textContent = data.dockerfile || "# No Dockerfile generated";
    document.getElementById("explanation").textContent = data.explanation || "Analysis complete.";
  }
});

// Tab 切换逻辑
const tabs = document.querySelectorAll('.tab-btn');
tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    // 移除所有 active
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.code-block').forEach(b => {
      b.style.display = 'none';
      b.classList.remove('active');
    });

    // 激活当前
    btn.classList.add('active');
    const targetId = `output-${btn.dataset.target}`;
    const targetBlock = document.getElementById(targetId);
    targetBlock.style.display = 'block';
    targetBlock.classList.add('active');
  });
});

// 修复后的复制功能
copyBtn.onclick = async () => {
  try {
    // 找到当前显示的 code block
    const activeBlock = document.querySelector('.code-block.active');
    if (!activeBlock) return;

    const text = activeBlock.textContent;
    await navigator.clipboard.writeText(text);

    // 显示 Toast
    showToast();
  } catch (err) {
    console.error('Failed to copy: ', err);
    statusMsg.textContent = "Copy failed";
  }
};

function showToast() {
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2000);
}