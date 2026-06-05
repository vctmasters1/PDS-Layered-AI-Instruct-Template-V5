const serverUrlInput = document.getElementById('server-url');
const apiTokenInput  = document.getElementById('api-token');
const form           = document.getElementById('settings-form');
const msgEl          = document.getElementById('msg');

// Load saved values
chrome.storage.local.get(['rs_server_url', 'rs_api_token'], (storage) => {
  if (storage.rs_server_url) serverUrlInput.value = storage.rs_server_url;
  if (storage.rs_api_token)  apiTokenInput.value  = storage.rs_api_token;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const url   = serverUrlInput.value.trim().replace(/\/$/, '');
  const token = apiTokenInput.value.trim();

  if (!url || !token) {
    msgEl.textContent = 'Both server URL and API token are required.';
    msgEl.className = 'error';
    return;
  }

  // Basic URL validation
  try { new URL(url); }
  catch { msgEl.textContent = 'Invalid URL.'; msgEl.className = 'error'; return; }

  chrome.storage.local.set({ rs_server_url: url, rs_api_token: token }, () => {
    msgEl.textContent = '✓ Settings saved.';
    msgEl.className = 'success';
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
  });
});
