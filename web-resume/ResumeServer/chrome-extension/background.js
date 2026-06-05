// ─── Shared extraction function (runs inside the page via executeScript) ──────
// Must be self-contained: no closures over background-scope variables.
function extractJobFromPage() {
  function extractIndeed() {
    const titleEl = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"] h1')
      || document.querySelector('h1[class*="jobTitle"]')
      || document.querySelector('h1');
    const title = titleEl?.innerText?.trim() ?? 'Unknown Title';
    const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"] a')
      || document.querySelector('[class*="companyName"]');
    const company = companyEl?.innerText?.trim() ?? '';
    const locationEl = document.querySelector('[data-testid="job-location"]')
      || document.querySelector('[class*="companyLocation"]');
    const location = locationEl?.innerText?.trim() ?? '';
    const descEl = document.querySelector('#jobDescriptionText')
      || document.querySelector('[class*="jobDescription"]');
    const description = descEl?.innerText?.trim() ?? '';
    return { title, company, location, description };
  }

  function extractLinkedIn() {
    // Click "See more" / "Show more" so the full description is in the DOM
    const seeMoreBtn =
      document.querySelector('.jobs-description__footer-button') ||
      document.querySelector('button[aria-label*="see more" i]') ||
      document.querySelector('button[class*="see-more"]') ||
      Array.from(document.querySelectorAll('button')).find(
        (b) => /^\s*(see more|show more)\s*$/i.test(b.innerText)
      );
    try { if (seeMoreBtn) seeMoreBtn.click(); } catch (_) {}

    // Title
    const titleEl =
      document.querySelector('h1[class*="job-title"]') ||
      document.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
      document.querySelector('[class*="topcard__title"]') ||
      document.querySelector('[class*="jobs-unified-top-card__job-title"] h1') ||
      document.querySelector('h1');
    const title = titleEl?.innerText?.trim() ?? 'Unknown Title';

    // Company
    const companyEl =
      document.querySelector('[class*="job-details-jobs-unified-top-card__company-name"] a') ||
      document.querySelector('[class*="jobs-unified-top-card__company-name"] a') ||
      document.querySelector('[class*="topcard__org-name"] a') ||
      document.querySelector('[class*="company-name"] a') ||
      document.querySelector('[class*="topcard__org-name"]');
    const company = companyEl?.innerText?.trim() ?? '';

    // Location
    const locationEl =
      document.querySelector('[class*="jobs-unified-top-card__bullet"]') ||
      document.querySelector('[class*="job-details-jobs-unified-top-card__bullet"]') ||
      document.querySelector('[class*="topcard__flavor--bullet"]') ||
      document.querySelector('[class*="primary-description"] span');
    const location = locationEl?.innerText?.trim() ?? '';

    // Description: cascade through increasingly broad strategies
    let description = '';

    // 1. Stable ID — most reliable when present
    const byId = document.querySelector('#job-details');
    if (byId) description = byId.innerText?.trim() ?? '';

    // 2. Known class patterns (LinkedIn cycles through these)
    if (!description) {
      const knownEl =
        document.querySelector('.jobs-description-content__text--stretch') ||
        document.querySelector('.jobs-description-content__text') ||
        document.querySelector('[class*="jobs-description__content"]') ||
        document.querySelector('[class*="jobs-description-content"]') ||
        document.querySelector('[class*="jobs-box__html-content"]') ||
        document.querySelector('[class*="description__text"]') ||
        document.querySelector('[class*="decorated-job-posting__details"]');
      if (knownEl) description = knownEl.innerText?.trim() ?? '';
    }

    // 3. aria-label / section-based search
    if (!description) {
      const sections = Array.from(document.querySelectorAll('section[aria-label], div[aria-label]'));
      const descSection = sections.find((s) =>
        /job description|about the job|about this role/i.test(s.getAttribute('aria-label') ?? '')
      );
      if (descSection) description = descSection.innerText?.trim() ?? '';
    }

    // 4. Heading-based: find "About the job" etc. and grab its containing block
    if (!description) {
      const allHeadings = Array.from(document.querySelectorAll('h2, h3, h4, [role="heading"]'));
      const descHeading = allHeadings.find((h) =>
        /about the job|job description|about this role|responsibilities|the role/i.test(h.innerText)
      );
      if (descHeading) {
        const container =
          descHeading.closest('section') ||
          descHeading.closest('article') ||
          descHeading.parentElement?.parentElement;
        description = container?.innerText?.trim() ?? '';
      }
    }

    // 5. article tag
    if (!description) {
      const articleEl = document.querySelector('article');
      if (articleEl) description = articleEl.innerText?.trim() ?? '';
    }

    // 6. Last resort: largest text block (skip nav/header/footer, skip huge/tiny)
    if (!description) {
      const skip = new Set(['SCRIPT', 'STYLE', 'NAV', 'HEADER', 'FOOTER', 'ASIDE']);
      let best = null;
      let maxLen = 0;
      document.querySelectorAll('div, section, article').forEach((el) => {
        if (skip.has(el.tagName)) return;
        if (el.closest('nav, header, footer, aside')) return;
        const txt = el.innerText?.trim() ?? '';
        if (txt.length > maxLen && txt.length >= 300 && txt.length <= 25000) {
          maxLen = txt.length;
          best = el;
        }
      });
      if (best) description = best.innerText?.trim() ?? '';
    }

    return { title, company, location, description };
  }

  const isLinkedIn = window.location.hostname.includes('linkedin.com');
  const { title, company, location, description } = isLinkedIn ? extractLinkedIn() : extractIndeed();

  if (!description) return {
    success: false,
    error: isLinkedIn
      ? 'Could not find job description. Make sure the full job posting is loaded (scroll down so the description is visible), then try again.'
      : 'No job description found on this page.',
  };

  const parts = [
    `# ${title}`,
    company   ? `**Company:** ${company}`   : null,
    location  ? `**Location:** ${location}` : null,
    `**Source:** ${window.location.href}`,
    '',
    description,
  ].filter(Boolean);

  return {
    success: true,
    data: {
      title: company ? `${company} — ${title}` : title,
      content: parts.join('\n'),
    },
  };
}

// ─── Indeed profile extraction (runs inside profile.indeed.com via executeScript) ───
function extractIndeedProfileFromPage() {
  function t(el) { return el?.innerText?.trim() ?? ''; }

  const nameEl =
    document.querySelector('[data-testid="resume-header-name"]') ||
    document.querySelector('[class*="ResumeHeader"] h1') ||
    document.querySelector('h1');
  const name = t(nameEl) || 'My Indeed Profile';

  const sectionData = [];
  // Indeed wraps each profile section in a <section> with data-testid or aria-label
  const sections = document.querySelectorAll(
    'section[data-testid], section[aria-label], [data-testid$="Section"]'
  );
  const seen = new Set();
  sections.forEach((sec) => {
    const id = sec.getAttribute('data-testid') || sec.getAttribute('aria-label') || '';
    if (seen.has(id)) return;
    seen.add(id);
    const heading = t(sec.querySelector('h2, h3, [role="heading"]')) || id;
    const content = t(sec);
    if (content && content.length > 10) sectionData.push({ heading, content });
  });

  // Fallback: grab visible main content
  if (sectionData.length === 0) {
    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    const content = t(main || document.body);
    if (!content) return { success: false, error: 'Could not extract profile. Make sure you are logged in to your Indeed profile.' };
    sectionData.push({ heading: 'Profile', content });
  }

  const lines = [
    `# ${name} — Indeed Profile`,
    `**Source:** ${window.location.href}`,
    `**Captured:** ${new Date().toLocaleDateString()}`,
    '',
  ];
  for (const { heading, content } of sectionData) {
    lines.push(`## ${heading}`);
    lines.push(content);
    lines.push('');
  }

  return {
    success: true,
    data: { filename: 'indeed-profile.md', content: lines.join('\n') },
  };
}

// ─── Run extraction in the given tab ─────────────────────────────────────────
async function extractFromTab(tabId) {
  let result;
  try {
    [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractJobFromPage,
    });
  } catch (err) {
    throw new Error(err.message);
  }
  const res = result?.result;
  if (!res?.success) throw new Error(res?.error ?? 'Extraction failed.');
  return res.data;
}

// ─── Extract + Download ───────────────────────────────────────────────────────
async function handleDownload(tabId, sendResponse) {
  let data;
  try {
    data = await extractFromTab(tabId);
  } catch (err) {
    sendResponse({ success: false, error: err.message });
    return;
  }

  const { title, content } = data;
  const slug = title.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '-').replace(/-{2,}/g, '-').slice(0, 100);
  const filename = `${slug}.res.md`;

  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false });
  URL.revokeObjectURL(url);

  sendResponse({ success: true, data: { filename } });
}

// ─── Extract + Send to Server ─────────────────────────────────────────────────
async function handleSendToServer(tabId, sendResponse) {
  const storage = await chrome.storage.local.get(['rs_server_url', 'rs_api_token']);
  const serverUrl = storage.rs_server_url?.trim().replace(/\/$/, '');
  const apiToken  = storage.rs_api_token?.trim();

  if (!serverUrl || !apiToken) {
    sendResponse({ success: false, error: 'Server URL or API token not configured. Open extension settings.' });
    return;
  }

  let data;
  try {
    data = await extractFromTab(tabId);
  } catch (err) {
    sendResponse({ success: false, error: err.message });
    return;
  }

  try {
    const response = await fetch(`${serverUrl}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ title: data.title, content: data.content }),
    });
    const json = await response.json();
    if (!json.success) {
      sendResponse({ success: false, error: json.error ?? 'Server returned an error.' });
      return;
    }
    sendResponse({ success: true, data: json.data });
  } catch (err) {
    sendResponse({ success: false, error: `Failed to reach server: ${err.message}` });
  }
}

// ─── Send Indeed profile to server as Sources/indeed-profile.md ─────────────────
async function handleSendIndeedProfile(tabId, sendResponse) {
  const storage = await chrome.storage.local.get(['rs_server_url', 'rs_api_token']);
  const serverUrl = storage.rs_server_url?.trim().replace(/\/$/, '');
  const apiToken  = storage.rs_api_token?.trim();

  if (!serverUrl || !apiToken) {
    sendResponse({ success: false, error: 'Server URL or API token not configured. Open extension settings.' });
    return;
  }

  let result;
  try {
    [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractIndeedProfileFromPage,
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
    return;
  }

  const res = result?.result;
  if (!res?.success) {
    sendResponse({ success: false, error: res?.error ?? 'Profile extraction failed.' });
    return;
  }

  const { filename, content } = res.data;
  try {
    const response = await fetch(`${serverUrl}/api/sources/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ content }),
    });
    const json = await response.json();
    if (!json.success) {
      sendResponse({ success: false, error: json.error ?? 'Server error.' });
      return;
    }
    sendResponse({ success: true, data: { filename } });
  } catch (err) {
    sendResponse({ success: false, error: `Failed to reach server: ${err.message}` });
  }
}

// ─── Context menu + install setup ──────────────────────────────────────────────────────
// Recreate on every service-worker startup (removeAll first avoids duplicate-ID
// errors if the worker woke up and the menu already existed).
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'rs-capture',
    title: 'Capture Job to Resume Suite',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'rs-capture-profile',
    title: 'Import Indeed Profile to Resume Suite',
    contexts: ['page'],
    documentUrlPatterns: ['https://profile.indeed.com/*'],
  });
});

// On install/update: recreate menu and pre-populate server URL from bundled config.json.
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'rs-capture',
      title: 'Capture Job to Resume Suite',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'rs-capture-profile',
      title: 'Import Indeed Profile to Resume Suite',
      contexts: ['page'],
      documentUrlPatterns: ['https://profile.indeed.com/*'],
    });
  });

  // config.json is injected into the ZIP at download time with the correct
  // server URL and a pre-issued auth token — fully self-configuring.
  // Only set values that aren't already customised by the user.
  try {
    const existing = await chrome.storage.local.get(['rs_server_url', 'rs_api_token']);
    const r = await fetch(chrome.runtime.getURL('config.json'));
    const cfg = await r.json();
    const updates = {};
    if (!existing.rs_server_url && cfg.serverUrl) updates.rs_server_url = cfg.serverUrl;
    if (!existing.rs_api_token  && cfg.token)     updates.rs_api_token  = cfg.token;
    if (Object.keys(updates).length) {
      await chrome.storage.local.set(updates);
      console.log('[RS] Auto-configured from config.json:', Object.keys(updates).join(', '));
    }
  } catch { /* config.json missing — user must configure manually */ }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'rs-capture-profile') {
    handleSendIndeedProfile(tab.id, (response) => {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Resume Suite',
        message: response?.success
          ? `✓ Indeed profile saved as "${response.data?.filename}" in Sources`
          : response?.error ?? 'Profile import failed.',
      });
    });
    return;
  }

  if (info.menuItemId !== 'rs-capture' || !tab?.id) return;
  handleSendToServer(tab.id, (response) => {
    if (response?.success) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Resume Suite',
        message: `✓ Captured: "${response.data?.title ?? 'Job listing'}"`,
      });
    } else {
      const err = response?.error ?? 'Unknown error';
      const isNotConfigured = err.includes('not configured');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Resume Suite — Capture Failed',
        message: isNotConfigured
          ? 'Extension not configured. Click the extension icon → Settings to add your server URL and token.'
          : err,
      });
    }
  });
});

// ─── Message router (from popup) ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No active tab.' });
      return;
    }
    if (message.action === 'extractAndDownload') {
      handleDownload(tabId, sendResponse);
    } else if (message.action === 'extractAndSend') {
      handleSendToServer(tabId, sendResponse);
    } else if (message.action === 'importIndeedProfile') {
      handleSendIndeedProfile(tabId, sendResponse);
    }
  });
  return true; // keep message channel open for async response
});
