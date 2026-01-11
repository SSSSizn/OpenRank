document.getElementById('save').addEventListener('click', () => {
  const baseUrl = document.getElementById('baseUrl').value;
  const apiKey = document.getElementById('apiKey').value;
  const model = document.getElementById('model').value;
  const githubToken = document.getElementById('githubToken').value;

  chrome.storage.local.set({
    llmConfig: { baseUrl, apiKey, model },
    githubToken
  }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => status.textContent = '', 1500);
  });
});

// Restore state
chrome.storage.local.get(['llmConfig', 'githubToken'], (result) => {
  if (result.llmConfig) {
    document.getElementById('baseUrl').value = result.llmConfig.baseUrl || '';
    document.getElementById('apiKey').value = result.llmConfig.apiKey || '';
    document.getElementById('model').value = result.llmConfig.model || '';
  }

  if (result.githubToken) {
    document.getElementById('githubToken').value = result.githubToken;
  }
});
