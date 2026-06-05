export const DRAFT_001_SYSTEM = `You are an expert resume writer specializing in ATS-optimized technical resumes.
Your task is to revise an existing resume draft based on ATS scoring feedback to close identified gaps.
Output ONLY the revised resume markdown — no preamble, no commentary, no code fences.
Preserve all truthful content from the draft; only improve and add — do not remove accurate information.`;

export function draft001Prompt(listingContent, partsMap, analysisContent, draft000Content, atsScore000, templateNotes = null) {
  const partsText = Object.entries(partsMap)
    .map(([filename, content]) => `### ${filename}\n${content}`)
    .join('\n\n');

  // Summarize the most impactful ATS gaps
  const missing = atsScore000?.missing_keywords ?? [];
  const failures = atsScore000?.format?.failed ?? [];
  const criticalFailures = atsScore000?.critical_failures_v2026 ?? [];

  const gapSummary = [
    missing.length ? `Missing keywords (prioritized): ${missing.slice(0, 8).map((m) => `${m.skill} (${m.bucket})`).join(', ')}` : null,
    failures.length ? `Format issues to fix: ${failures.join('; ')}` : null,
    criticalFailures.length ? `Critical failures: ${criticalFailures.join('; ')}` : null,
  ].filter(Boolean).join('\n');

  const styleSection = templateNotes
    ? `\n---\n\n## STYLE GUIDE (maintain this formatting)\n${templateNotes}\n`
    : '';

  return `Revise this resume draft to close the ATS scoring gaps identified below.

REVISION PRIORITIES:
${gapSummary || 'Improve keyword density and strengthen achievement bullets.'}

Instructions:
1. Add the missing required keywords naturally in context — in bullets, not as keyword stuffing.
2. Fix all format issues listed above.
3. Strengthen the weakest bullets with more specific language drawn from the candidate's Parts.
4. Do not add skills or experience not present in the original Parts.
5. Maintain all required ATS headings: Professional Summary, Professional Experience, Technical Skills, Key Achievements, Education.

---

## ORIGINAL DRAFT (Pass 000)
${draft000Content}

---

## ATS SCORE GAPS (from pass 000)
${gapSummary || 'See full score below.'}

## FULL ATS SCORE JSON
${JSON.stringify(atsScore000, null, 2)}

---

## JOB DESCRIPTION
${listingContent}

---

## ANALYSIS
${analysisContent}

---

## CANDIDATE PARTS (for additional detail)
${partsText}${styleSection}`;
}
