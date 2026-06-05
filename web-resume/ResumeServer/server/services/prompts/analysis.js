export const ANALYSIS_SYSTEM = `You are an expert resume strategist and ATS optimization specialist.
Your task is to analyze a job description against a candidate's resume parts and produce a structured analysis document.
Be precise, practical, and output only the analysis markdown — no preamble or closing remarks.`;

export function analysisPrompt(listingContent, partsMap) {
  const partsText = Object.entries(partsMap)
    .map(([filename, content]) => `### ${filename}\n${content}`)
    .join('\n\n');

  return `Analyze this job description against the candidate's resume parts below.

Produce a markdown document with these exact sections:

# Analysis: [Job Title] at [Company]

## Key Requirements
List every concrete requirement extracted from the job description as bullet points.

## Match Analysis
A markdown table with columns: Requirement | Status | Notes
Status values: ✓ Match | ~ Partial | ✗ Gap

## ATS Keywords
List the most important keywords and phrases for ATS optimization. Group by: Required, Preferred, General.

## Tailoring Notes
Concrete, specific instructions for how to tailor the resume. Focus on:
- Which experience bullets to rewrite or emphasize
- Which keywords to add to which sections
- Any skills or achievements to surface that are currently buried

---

## JOB DESCRIPTION
${listingContent}

---

## CANDIDATE RESUME PARTS
${partsText}`;
}
