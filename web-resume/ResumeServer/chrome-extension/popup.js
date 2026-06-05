const statusEl = document.getElementById('status');
const configWarning = document.getElementById('config-warning');
const btnSend = document.getElementById('btn-send');
const btnDownload = document.getElementById('btn-download');
const btnSettings = document.getElementById('btn-settings');
const btnProfile = document.getElementById('btn-profile');
const profileDivider = document.getElementById('profile-divider');

// Show the Import Indeed Profile button when on profile.indeed.com
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url ?? '';
  if (url.includes('profile.indeed.com')) {
    btnProfile.style.display = 'block';
    profileDivider.style.display = 'block';
  }
});

function showStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = type;
}

// Check if server is configured
chrome.storage.local.get(['rs_server_url', 'rs_api_token'], (storage) => {
  if (!storage.rs_server_url || !storage.rs_api_token) {
    configWarning.style.display = 'block';
    btnSend.disabled = true;
  }
});

btnSend.addEventListener('click', () => {
  btnSend.disabled = true;
  btnDownload.disabled = true;
  showStatus('Extracting and sending…', 'info');

  chrome.runtime.sendMessage({ action: 'extractAndSend' }, (response) => {
    btnSend.disabled = false;
    btnDownload.disabled = false;
    if (response?.success) {
      showStatus(`✓ Saved as "${response.data.title}"`, 'success');
    } else {
      showStatus(response?.error ?? 'Unknown error.', 'error');
    }
  });
});

btnDownload.addEventListener('click', () => {
  btnSend.disabled = true;
  btnDownload.disabled = true;
  showStatus('Extracting…', 'info');

  chrome.runtime.sendMessage({ action: 'extractAndDownload' }, (response) => {
    btnSend.disabled = false;
    btnDownload.disabled = false;
    if (response?.success) {
      showStatus(`✓ Downloaded as ${response.data.filename}`, 'success');
    } else {
      showStatus(response?.error ?? 'Unknown error.', 'error');
    }
  });
});

btnSettings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage
    ? chrome.runtime.openOptionsPage()
    : window.open(chrome.runtime.getURL('settings.html'));
});

btnProfile.addEventListener('click', () => {
  btnProfile.disabled = true;
  showStatus('Reading your Indeed profile…', 'info');

  chrome.runtime.sendMessage({ action: 'importIndeedProfile' }, (response) => {
    btnProfile.disabled = false;
    if (response?.success) {
      showStatus(`✓ Profile saved to Sources as "${response.data.filename}"`, 'success');
    } else {
      showStatus(response?.error ?? 'Unknown error.', 'error');
    }
  });
});
