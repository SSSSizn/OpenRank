const analyzeBtn = document.getElementById("analyze");
const statusDiv = document.getElementById("status");
const resultsDiv = document.getElementById("results");
const openOptionsBtn = document.getElementById("openOptions");

openOptionsBtn.onclick = () => chrome.runtime.openOptionsPage();

analyzeBtn.onclick = () => {
  analyzeBtn.disabled = true;
  statusDiv.textContent = "Initializing...";
  resultsDiv.style.display = "none";
  chrome.runtime.sendMessage({ type: "START_ANALYSIS" });
};

// Tab 切换逻辑
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = (e) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    const target = e.target.dataset.target;
    document.getElementById('output-req').style.display = target === 'req' ? 'block' : 'none';
    document.getElementById('output-dock').style.display = target === 'dock' ? 'block' : 'none';
  };
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "UPDATE_STATUS") {
    statusDiv.textContent = msg.text;
  }
  
  if (msg.type === "ANALYSIS_RESULT") {
    analyzeBtn.disabled = false;
    statusDiv.textContent = "✔ Analysis Complete";
    resultsDiv.style.display = "block";
    
    const data = msg.data;
    document.getElementById("output-req").textContent = data.requirements || "# No requirements generated";
    document.getElementById("output-dock").textContent = data.dockerfile || "# No Dockerfile generated";
    document.getElementById("explanation").textContent = data.explanation || "";
  }
});