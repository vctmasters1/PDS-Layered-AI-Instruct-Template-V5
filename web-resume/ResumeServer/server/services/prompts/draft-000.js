export const DRAFT_000_SYSTEM = `You are an expert resume writer specializing in ATS-optimized technical resumes.
Your task is to produce a complete, tailored resume in markdown format.
Output ONLY the resume markdown — no preamble, no commentary, no code fences.
The resume must be ATS-friendly: standard section headings, no tables, no icons, consistent date formats (Month YYYY – Month YYYY or Present).`;

export function draft000Prompt(listingContent, partsMap, analysisContent, templateNotes = null) {
  const partsText = Object.entries(partsMap)
    .map(([filename, content]) => `### ${filename}\n${content}`)
    .join('\n\n');

  const styleSection = templateNotes
    ? `---\n\n## STYLE GUIDE (follow this formatting exactly)\n${templateNotes}\n\n`
    : '';

  return `Write a complete, tailored, ATS-optimized resume for this job application.

Use the analysis to guide keyword placement and emphasis.
Draw all experience, skills, and achievements exclusively from the candidate's Parts — do not fabricate anything.

Required markdown structure (use these exact heading levels):
# [Full Name]
[Contact line]

## Professional Summary
[3-4 sentences tailored to this specific role]

## Professional Experience
[Each role as: ### Job Title — Company (Location) | Month YYYY – Month YYYY or Present]
[Bullet points starting with strong action verbs, quantified where data exists in the Parts]

## Technical Skills
[Grouped by category, inline format, no bullets for individual skills]

## Key Achievements
[3-5 bullets, quantified, most relevant to this role first]

## Education
[Standard format]

## Additional Skills
[Optional — only if relevant and space allows]

${styleSection}---

## JOB DESCRIPTION
${listingContent}

---

## ANALYSIS
${analysisContent}

---

## CANDIDATE PARTS
${partsText}`;
}
