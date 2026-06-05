/**
 * content.js — extracts job listing details from Indeed and LinkedIn job pages.
 * Responds to messages from the background service worker.
 */

function extractIndeed() {
  const titleEl = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"] h1')
    || document.querySelector('h1[class*="jobTitle"]')
    || document.querySelector('h1');
  const title = titleEl?.innerText?.trim() ?? 'Unknown Title';

  const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"] a')
    || document.querySelector('[data-company-name]')
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
  const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title h1')
    || document.querySelector('.jobs-unified-top-card__job-title h1')
    || document.querySelector('h1.t-24');
  const title = titleEl?.innerText?.trim() ?? 'Unknown Title';

  const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name a')
    || document.querySelector('.jobs-unified-top-card__company-name a')
    || document.querySelector('.topcard__org-name-link');
  const company = companyEl?.innerText?.trim() ?? '';

  const locationEl = document.querySelector('.job-details-jobs-unified-top-card__primary-description-without-modal .tvm__text')
    || document.querySelector('.jobs-unified-top-card__bullet')
    || document.querySelector('.topcard__flavor--bullet');
  const location = locationEl?.innerText?.trim() ?? '';

  const descEl = document.querySelector('.jobs-description-content__text')
    || document.querySelector('.jobs-description__content .jobs-box__html-content')
    || document.querySelector('#job-details');
  const description = descEl?.innerText?.trim() ?? '';

  return { title, company, location, description };
}

function extractJobData() {
  const isLinkedIn = window.location.hostname.includes('linkedin.com');
  const { title, company, location, description } = isLinkedIn ? extractLinkedIn() : extractIndeed();

  if (!description) {
    throw new Error('Could not find job description on this page. Navigate to a specific job posting.');
  }

  const parts = [
    `# ${title}`,
    company ? `**Company:** ${company}` : null,
    location ? `**Location:** ${location}` : null,
    `**Source:** ${window.location.href}`,
    '',
    description,
  ].filter(Boolean);

  return {
    title: company ? `${company} — ${title}` : title,
    content: parts.join('\n'),
  };
}

// Listen for extract requests from the background worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'extractJob') return false;

  try {
    const data = extractJobData();
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }

  return true; // keep channel open for async (not needed here but safe)
});
