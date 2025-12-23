import { extractImports, normalize } from "./utils.js";

const output = document.getElementById("output");
const analyzeBtn = document.getElementById("analyze");
const copyBtn = document.getElementById("copy");

analyzeBtn.onclick = () => {
  output.textContent = "Analyzing...\n";

  chrome.runtime.sendMessage({ type: "START_ANALYSIS" });
};

// Listen for results
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "ANALYSIS_RESULT") {
    output.textContent = msg.result;
  } else if (msg.type === "ANALYSIS_ERROR") {
    output.textContent += `Error: ${msg.error}\n`;
  }
});

function log(msg) {
  console.log(msg);
}


copyBtn.onclick = async () => {
  const text = output.textContent;
  const match = text.match(/=== requirements\.txt ===\n([\s\S]*)/);
  const reqText = match ? match[1].trim() : text;
  await navigator.clipboard.writeText(reqText);
  alert("Copied to clipboard");
};
