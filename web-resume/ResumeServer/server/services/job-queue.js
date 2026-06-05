import path from 'path';
import { db } from '../database/database.js';
import { fileStore } from './file-store.js';
import { llm } from './llm-client.js';
import { env } from '../config/env.js';
import { atsScorer } from './ats-scorer.js';
import { builder } from './builder.js';
import { extractText } from './text-extractor.js';
import { ANALYSIS_SYSTEM, analysisPrompt } from './prompts/analysis.js';
import { DRAFT_000_SYSTEM, draft000Prompt } from './prompts/draft-000.js';
import { DRAFT_001_SYSTEM, draft001Prompt } from './prompts/draft-001.js';
import { PARTS_MANIFEST, PARTS_EXTRACT_SYSTEM, partsExtractPrompt } from './prompts/parts-extract.js';
import { SKILLS_ANALYZE_SYSTEM, skillsAnalyzePrompt } from './prompts/skills-analyze.js';
import { TEMPLATE_ANALYZE_SYSTEM, templateAnalyzePrompt } from './prompts/template-analyze.js';

const STEPS = ['analyze', 'draft-000', 'score-000', 'draft-001', 'score-001', 'build'];

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueJob(userId, listingId, step, autoChain = false) {
  // Don't queue a duplicate pending/running job for the same step
  const existing = await db.getLatestJobForStep(listingId, step);
  if (existing && (existing.status === 'pending' || existing.status === 'running')) {
    return existing.id;
  }
  const r = await db.query(
    `INSERT INTO workflow_jobs (user_id, listing_id, step, status, auto_chain)
     VALUES ($1, $2, $3, 'pending', $4) RETURNING id`,
    [userId, listingId, step, autoChain]
  );
  return r.rows[0].id;
}

// Enqueue a user-scoped job (no listing_id) — used for build-parts
export async function enqueueUserJob(userId, step) {
  const existing = await db.getLatestUserJobForStep(userId, step);
  if (existing && (existing.status === 'pending' || existing.status === 'running')) {
    return existing.id;
  }
  const r = await db.query(
    `INSERT INTO workflow_jobs (user_id, listing_id, step, status, auto_chain)
     VALUES ($1, NULL, $2, 'pending', false) RETURNING id`,
    [userId, step]
  );
  return r.rows[0].id;
}

export async function runAll(userId, listingId) {
  // Always restart from the beginning
  return enqueueJob(userId, listingId, 'analyze', true);
}

export async function getJobStatus(jobId) {
  const r = await db.query('SELECT * FROM workflow_jobs WHERE id = $1', [jobId]);
  return r.rows[0] ?? null;
}

export async function getPipelineStatus(listingId) {
  const artifacts = await db.getArtifactsByListing(listingId);
  const artifactNames = new Set(artifacts.map((a) => a.filename));

  const status = {};
  for (const step of STEPS) {
    const latestJob = await db.getLatestJobForStep(listingId, step);
    const expectedFiles = expectedArtifacts(step, null);

    let stepStatus = 'locked';
    if (latestJob?.status === 'running' || latestJob?.status === 'pending') {
      stepStatus = latestJob.status === 'running' ? 'running' : 'pending';
    } else if (expectedFiles.length > 0 && expectedFiles.every((f) => artifactNames.has(f))) {
      stepStatus = 'done';
    } else if (latestJob?.status === 'error') {
      stepStatus = 'error';
    } else if (isStepUnlocked(step, artifactNames)) {
      stepStatus = 'ready';
    }

    status[step] = {
      status: stepStatus,
      jobId: latestJob?.id ?? null,
      error: latestJob?.status === 'error' ? latestJob.error : null,
      artifacts: artifacts.filter((a) =>
        a.step === step &&
        !a.filename.endsWith('.json') &&
        !a.filename.match(/^ats-score-\d{3}\.md$/)
      ).map((a) => a.filename),
    };
  }
  return status;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

function getSlotConfig(job) {
  const urls     = env.llmApiUrls;
  const modelIds = env.llmModelIds;
  // Number of parallel slots = number of named model instances (if set) or number of URLs
  const numSlots = modelIds ? modelIds.length : urls.length;
  if (numSlots === 1) {
    return { url: urls[0], modelId: modelIds ? modelIds[0] : null };
  }
  const slot = job.listing_id != null ? job.listing_id % numSlots : 0;
  return {
    url:     urls[slot % urls.length],
    modelId: modelIds ? modelIds[slot] : null,
  };
}

let workersStarted = false;

export function startWorker() {
  if (workersStarted) return;
  workersStarted = true;
  const numSlots = env.llmModelIds ? env.llmModelIds.length : env.llmApiUrls.length;
  console.log(`[worker] Starting ${numSlots} worker slot(s).`);
  for (let slot = 0; slot < numSlots; slot++) {
    runWorkerLoop(slot, numSlots);
  }
}

async function runWorkerLoop(slot, numSlots) {
  while (true) {
    try {
      const processed = await processNextJob(slot, numSlots);
      if (!processed) {
        await sleep(2000);
      }
    } catch (err) {
      console.error(`[worker:${slot}] Unexpected loop error:`, err.message);
      await sleep(5000);
    }
  }
}

async function processNextJob(slot, numSlots) {
  // Each slot handles a partition of listings so workflows never share an LLM instance
  const r = numSlots === 1
    ? await db.query(
        `SELECT * FROM workflow_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1`
      )
    : await db.query(
        `SELECT * FROM workflow_jobs WHERE status = 'pending'
         AND ((listing_id IS NOT NULL AND (listing_id % $1) = $2)
              OR (listing_id IS NULL AND $2 = 0))
         ORDER BY created_at LIMIT 1`,
        [numSlots, slot]
      );
  if (!r.rows.length) return false;

  const job = r.rows[0];
  await db.query(
    `UPDATE workflow_jobs SET status = 'running', updated_at = NOW() WHERE id = $1`,
    [job.id]
  );

  const { url: slotUrl, modelId } = getSlotConfig(job);

  try {
    // Auto-retry once on transient errors (LLM timeouts, subprocess crashes)
    try {
      await runStep(job, slotUrl, modelId);
    } catch (firstErr) {
      console.warn(`[worker:${slot}] Job ${job.id} (${job.step}) attempt 1 failed — retrying in 6s: ${firstErr.message.slice(0, 200)}`);
      await sleep(6000);
      await runStep(job, slotUrl, modelId);
    }
    await db.query(
      `UPDATE workflow_jobs SET status = 'done', updated_at = NOW() WHERE id = $1`,
      [job.id]
    );
    console.log(`[worker:${slot}] Job ${job.id} (${job.step}) completed.`);

    // Auto-chain: enqueue the next step if this job requested it
    if (job.auto_chain) {
      const nextStep = STEPS[STEPS.indexOf(job.step) + 1];
      if (nextStep) {
        await enqueueJob(job.user_id, job.listing_id, nextStep, true);
        console.log(`[worker:${slot}] Auto-chaining → ${nextStep}`);
      } else {
        console.log(`[worker:${slot}] Auto-chain complete — full pipeline finished.`);
      }
    }
  } catch (err) {
    console.error(`[worker:${slot}] Job ${job.id} (${job.step}) failed:`, err.message);
    await db.query(
      `UPDATE workflow_jobs SET status = 'error', error = $2, updated_at = NOW() WHERE id = $1`,
      [job.id, err.message.slice(0, 2000)]
    );
  }
  return true;
}

// ─── Step runners ─────────────────────────────────────────────────────────────

async function runStep(job, slotUrl, modelId) {
  const user    = await db.getUserById(job.user_id);
  const userRoot = fileStore.userRoot(user.username);
  const nameSlug = user.full_name.replace(/\s+/g, '');

  // User-scoped steps (no listing required)
  if (job.step === 'build-parts')       return runBuildParts(job, user, userRoot, slotUrl, modelId);
  if (job.step === 'analyze-skills')    return runAnalyzeSkills(job, user, userRoot, slotUrl, modelId);
  if (job.step === 'analyze-template')  return runAnalyzeTemplate(job, user, userRoot, slotUrl, modelId);

  const listing = await db.getListingById(job.listing_id);

  switch (job.step) {
    case 'analyze':    return runAnalyze(job, user, listing, userRoot, nameSlug, slotUrl, modelId);
    case 'draft-000':  return runDraft000(job, user, listing, userRoot, nameSlug, slotUrl, modelId);
    case 'score-000':  return runScore(job, listing, userRoot, nameSlug, '000');
    case 'draft-001':  return runDraft001(job, user, listing, userRoot, nameSlug, slotUrl, modelId);
    case 'score-001':  return runScore(job, listing, userRoot, nameSlug, '001');
    case 'build':      return runBuild(job, listing, userRoot, nameSlug);
    default: throw new Error(`Unknown step: ${job.step}`);
  }
}

async function loadParts(userRoot) {
  const files = await fileStore.listDir(userRoot, 'Parts');
  const parts = {};
  for (const f of files) {
    if (f.endsWith('.md') || f.endsWith('.txt')) {
      parts[f] = await fileStore.readFile(userRoot, `Parts/${f}`);
    }
  }
  return parts;
}

async function loadTemplateNotes(userRoot) {
  try {
    return await fileStore.readFile(userRoot, 'Sources/template-notes.md');
  } catch {
    return null;
  }
}

async function runAnalyzeTemplate(_job, _user, userRoot, slotUrl, modelId) {
  const templateFiles = await fileStore.listDir(userRoot, 'Sources/template');
  if (templateFiles.length === 0) {
    throw new Error('No template files found. Upload at least one example resume first.');
  }

  const files = {};
  for (const f of templateFiles) {
    try {
      if (f.endsWith('.docx') || f.endsWith('.pdf')) {
        const buf = await fileStore.readFileBuffer(userRoot, `Sources/template/${f}`);
        files[f] = await extractText(buf, f);
      } else {
        files[f] = await fileStore.readFile(userRoot, `Sources/template/${f}`);
      }
    } catch {
      // skip unreadable files
    }
  }

  if (Object.keys(files).length === 0) {
    throw new Error('Could not read any template files.');
  }

  const result = await llm.completeQueue(TEMPLATE_ANALYZE_SYSTEM, templateAnalyzePrompt(files), slotUrl, modelId);
  await fileStore.writeFile(userRoot, 'Sources/template-notes.md', result);
  console.log('[worker] analyze-template: wrote Sources/template-notes.md');
}

async function runAnalyzeSkills(_job, _user, userRoot, slotUrl, modelId) {
  const otherFiles = await fileStore.listDir(userRoot, 'Sources/other');
  if (otherFiles.length === 0) {
    throw new Error('No files found in Sources/other. Upload documents first.');
  }

  const files = {};
  for (const f of otherFiles) {
    try {
      files[f] = await fileStore.readFile(userRoot, `Sources/other/${f}`);
    } catch {
      // skip unreadable files
    }
  }
  if (Object.keys(files).length === 0) {
    throw new Error('Could not read any files from Sources/other.');
  }

  const result = await llm.completeQueue(SKILLS_ANALYZE_SYSTEM, skillsAnalyzePrompt(files), slotUrl, modelId);
  await fileStore.writeFile(userRoot, 'Sources/skills-analysis.md', result);
  console.log('[worker] analyze-skills: wrote Sources/skills-analysis.md');
}

async function runBuildParts(_job, _user, userRoot, slotUrl, modelId) {
  const sourceFiles = await fileStore.listDir(userRoot, 'Sources');
  const otherFiles  = await fileStore.listDir(userRoot, 'Sources/other');

  if (sourceFiles.length === 0 && otherFiles.length === 0) {
    throw new Error('No source documents found in Sources/. Upload documents first.');
  }

  const sources = {};
  for (const f of sourceFiles) {
    if (f.endsWith('.md') || f.endsWith('.txt')) {
      sources[f] = await fileStore.readFile(userRoot, `Sources/${f}`);
    }
  }
  // Also include uploaded text/markdown files from Sources/other/
  for (const f of otherFiles) {
    if (f.endsWith('.md') || f.endsWith('.txt')) {
      sources[`other/${f}`] = await fileStore.readFile(userRoot, `Sources/other/${f}`);
    }
  }
  if (Object.keys(sources).length === 0) {
    throw new Error('No readable source documents (.md/.txt) found. Upload documents first.');
  }

  for (const part of PARTS_MANIFEST) {
    let existing = null;
    try {
      existing = await fileStore.readFile(userRoot, `Parts/${part.filename}`);
    } catch {
      // No existing file — generate from scratch
    }

    const userMsg = partsExtractPrompt(part.name, part.description, sources, existing);
    const result = await llm.completeQueue(PARTS_EXTRACT_SYSTEM, userMsg, slotUrl, modelId);
    await fileStore.writeFile(userRoot, `Parts/${part.filename}`, result);
    console.log(`[worker] build-parts: wrote Parts/${part.filename}`);
  }
}

async function runAnalyze(job, _user, listing, userRoot, _nameSlug, slotUrl, modelId) {
  const parts = await loadParts(userRoot);
  const system = ANALYSIS_SYSTEM;
  const user_msg = analysisPrompt(listing.content, parts);
  const result = await llm.completeQueue(system, user_msg, slotUrl, modelId);

  await fileStore.writeFile(userRoot, `Current/${listing.folder_name}/analysis.md`, result);
  await db.upsertArtifact(listing.id, 'analysis.md', 'analyze');
}

async function runDraft000(job, _user, listing, userRoot, nameSlug, slotUrl, modelId) {
  const parts    = await loadParts(userRoot);
  const analysis = await fileStore.readFile(userRoot, `Current/${listing.folder_name}/analysis.md`);
  const templateNotes = await loadTemplateNotes(userRoot);
  const user_msg = draft000Prompt(listing.content, parts, analysis, templateNotes);
  const result = await llm.completeQueue(DRAFT_000_SYSTEM, user_msg, slotUrl, modelId);

  const filename = `${nameSlug}-000.md`;
  await fileStore.writeFile(userRoot, `Current/${listing.folder_name}/${filename}`, result);
  await db.upsertArtifact(listing.id, filename, 'draft-000');
}

async function runScore(job, listing, userRoot, nameSlug, pass) {
  await atsScorer.score({
    listing: listing.slug,
    userRoot,
    pass,
    name: nameSlug,
  });
  // Always register the JSON (used by draft-001 and build prereq checks)
  await db.upsertArtifact(listing.id, `ats-score-${pass}.json`, `score-${pass}`);

  if (pass === '001') {
    // After both passes exist, generate a unified side-by-side summary
    await generateAtsSummary(listing, userRoot);
    await db.upsertArtifact(listing.id, 'ATS-SCORE-SUMMARY.md', 'score-001');
  }
}

async function generateAtsSummary(listing, userRoot) {
  const folder = listing.folder_name;
  let s000 = null, s001 = null;
  try {
    s000 = JSON.parse(await fileStore.readFile(userRoot, `Current/${folder}/ats-score-000.json`));
  } catch { /* pass 000 score not available */ }
  try {
    s001 = JSON.parse(await fileStore.readFile(userRoot, `Current/${folder}/ats-score-001.json`));
  } catch { /* pass 001 score not available */ }

  const v0 = s000?.scores_v2026 ?? {};
  const v1 = s001?.scores_v2026 ?? {};
  const l0 = s000?.scores ?? {};
  const l1 = s001?.scores ?? {};

  const cell = (v) => v !== undefined ? String(v) : '—';
  const delta = (a, b) => (a !== undefined && b !== undefined)
    ? (b - a >= 0 ? ` ▲ +${(b - a).toFixed(1)}` : ` ▼ ${(b - a).toFixed(1)}`)
    : '';

  const finalDelta = delta(v0.final, v1.final);
  const headline = v1.final !== undefined
    ? `**v2026 Final: ${v1.final}/100**${finalDelta}`
    : '';

  const missing001 = s001?.missing_keywords ?? [];
  const missingText = missing001.length
    ? missing001.slice(0, 10).map((m) => `- **${m.skill}** *(${m.bucket})*`).join('\n')
    : '- None remaining — good coverage!';

  const critFail001 = s001?.critical_failures_v2026 ?? [];
  const critText = critFail001.length
    ? critFail001.map((f) => `- ⚠ ${f}`).join('\n')
    : '- None';

  const matched001 = s001?.matched_keywords ?? [];
  const matchedText = matched001.length
    ? matched001.map((k) => `\`${k}\``).join(', ')
    : '—';

  const col1 = 26; // metric label column width
  const col2 = 10; // Pass 000
  const col3 = 10; // Pass 001

  const pad  = (s, w) => String(s).padEnd(w);
  const cpad = (s, w) => { const str = String(s); const p = Math.max(0, w - str.length); return ' '.repeat(Math.floor(p/2)) + str + ' '.repeat(Math.ceil(p/2)); };

  const row = (label, v0, v1) =>
    `| ${pad(label, col1)} | ${cpad(cell(v0), col2)} | ${cpad(cell(v1), col3)} |`;

  const md = [
    `# ATS Score Summary`,
    ``,
    headline,
    ``,
    `## Score Comparison`,
    ``,
    `| ${'Metric'.padEnd(col1)} | ${'Pass 000'.padEnd(col2)} | ${'Pass 001'.padEnd(col3)} |`,
    `| ${'-'.repeat(col1)} | ${'-'.repeat(col2)} | ${'-'.repeat(col3)} |`,
    row('**v2026 Final**',      v0.final,       `**${cell(v1.final)}**`),
    row('Relevance',            v0.relevance,   v1.relevance),
    row('Parseability',         v0.parseability, v1.parseability),
    row('Evidence Quality',     v0.evidence,    v1.evidence),
    row('Platform Fit',         v0.platform,    v1.platform),
    row('Legacy Ensemble',      l0.ensemble,    l1.ensemble),
    row('Keyword Coverage',     l0.keyword,     l1.keyword),
    row('Semantic Similarity',  l0.semantic,    l1.semantic),
    row('Format Compliance',    l0.format,      l1.format),
    ``,
    `## Matched Keywords (Pass 001)`,
    ``,
    matchedText,
    ``,
    `## Remaining Missing Keywords`,
    ``,
    missingText,
    ``,
    `## Critical Failures (Pass 001)`,
    ``,
    critText,
  ].join('\n');

  await fileStore.writeFile(userRoot, `Current/${folder}/ATS-SCORE-SUMMARY.md`, md);
  console.log('[worker] generateAtsSummary: wrote ATS-SCORE-SUMMARY.md');

  // Persist the best available fit score to the listing row so the UI can show it
  const fitScore = v1.final ?? v0.final ?? null;
  if (fitScore !== null) {
    await db.query('UPDATE listings SET fit_score = $1 WHERE id = $2', [Math.round(fitScore), listing.id]);
  }
}

async function runDraft001(job, _user, listing, userRoot, nameSlug, slotUrl, modelId) {
  const parts    = await loadParts(userRoot);
  const analysis = await fileStore.readFile(userRoot, `Current/${listing.folder_name}/analysis.md`);
  const draft000 = await fileStore.readFile(userRoot, `Current/${listing.folder_name}/${nameSlug}-000.md`);
  const templateNotes = await loadTemplateNotes(userRoot);

  let atsScore000 = null;
  try {
    const raw = await fileStore.readFile(userRoot, `Current/${listing.folder_name}/ats-score-000.json`);
    atsScore000 = JSON.parse(raw);
  } catch {
    // Score not available — proceed without it
  }

  const user_msg = draft001Prompt(listing.content, parts, analysis, draft000, atsScore000, templateNotes);
  const result = await llm.completeQueue(DRAFT_001_SYSTEM, user_msg, slotUrl, modelId);

  const filename = `${nameSlug}-001.md`;
  await fileStore.writeFile(userRoot, `Current/${listing.folder_name}/${filename}`, result);
  await db.upsertArtifact(listing.id, filename, 'draft-001');
}

async function runBuild(job, listing, userRoot, nameSlug) {
  const folder   = listing.folder_name;
  const mdPath   = fileStore.fullPath(userRoot, `Current/${folder}/${nameSlug}-001.md`);
  const docxPath = fileStore.fullPath(userRoot, `Current/${folder}/${nameSlug}-001.docx`);
  const pdfPath  = fileStore.fullPath(userRoot, `Current/${folder}/${nameSlug}-001.pdf`);

  // Use user's template .docx if one has been uploaded
  let referenceDoc = null;
  try {
    const templateFiles = await fileStore.listDir(userRoot, 'Sources/template');
    const userDocx = templateFiles.find((f) => f.endsWith('.docx'));
    if (userDocx) referenceDoc = fileStore.fullPath(userRoot, `Sources/template/${userDocx}`);
  } catch { /* ignore — fall back to bundled template */ }

  const { docx, pdf } = await builder.build({ mdPath, docxPath, pdfPath, referenceDoc });

  if (docx) await db.upsertArtifact(listing.id, `${nameSlug}-001.docx`, 'build');
  if (pdf)  await db.upsertArtifact(listing.id, `${nameSlug}-001.pdf`,  'build');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expectedArtifacts(step, nameSlug) {
  // nameSlug is unknown at status-check time — we check by step column in artifacts table
  const map = {
    'analyze':   ['analysis.md'],
    'score-000': ['ats-score-000.json'],
    'score-001': ['ATS-SCORE-SUMMARY.md'],
  };
  return map[step] ?? [];
}

function isStepUnlocked(step, artifactNames) {
  const prereqs = {
    'analyze':   [],
    'draft-000': ['analysis.md'],
    'score-000': [],  // checked by step name match below
    'draft-001': ['ats-score-000.json'],
    'score-001': [],
    'build':     ['ats-score-001.json'],
  };

  // For draft-000: need analysis.md
  // For score-000: need a -000.md (we check by artifact step)
  // For score-001: need a -001.md

  const req = prereqs[step] ?? [];
  return req.every((f) => artifactNames.has(f));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
