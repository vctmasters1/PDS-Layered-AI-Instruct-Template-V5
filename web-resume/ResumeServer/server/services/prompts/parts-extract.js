/**
 * Prompt templates and manifest for the build-parts workflow step.
 * The manifest defines every standard Part: filename, human name, and extraction guidance.
 */

export const PARTS_MANIFEST = [
  {
    filename: 'contact.md',
    name: 'Contact Information',
    description:
      'Full name, email address, phone number, LinkedIn profile URL, GitHub/portfolio URL if present, and city/state. Do not include a full street address.',
  },
  {
    filename: 'professional-summary.md',
    name: 'Professional Summary',
    description:
      'A concise 2–4 sentence career summary: years of experience, core domain, key strengths, and professional goal. Keep it punchy and ATS-friendly.',
  },
  {
    filename: 'professional-experience.md',
    name: 'Professional Experience',
    description:
      'Full work history in reverse chronological order. For each role: company name, job title, employment dates (Month YYYY – Month YYYY or Present), optional location, and 3–6 bullet-point achievements with quantified outcomes wherever possible.',
  },
  {
    filename: 'technical-skills.md',
    name: 'Technical Skills',
    description:
      'Programming languages, frameworks, libraries, databases, cloud platforms, DevOps/CI tools, and other hard technical competencies. Group by category (e.g. Languages, Frameworks, Cloud, Tools).',
  },
  {
    filename: 'field-skills.md',
    name: 'Field / Domain Skills',
    description:
      'Industry-specific or domain knowledge: protocols, standards, methodologies, hardware, and expertise not covered by generic technical skills (e.g. embedded systems, SCADA, NLP, fin-tech regulations).',
  },
  {
    filename: 'key-achievements.md',
    name: 'Key Achievements',
    description:
      'Top 5–8 standout career accomplishments with measurable impact — percentages, dollar amounts, time saved, users affected, awards received. Draw the most impressive metrics from all experience.',
  },
  {
    filename: 'education.md',
    name: 'Education',
    description:
      'Degrees in reverse chronological order: institution, degree/field, graduation year. Include GPA only if ≥3.5. Include notable awards, thesis titles, or relevant coursework if present.',
  },
  {
    filename: 'additional-skills.md',
    name: 'Additional Skills',
    description:
      'Soft skills, leadership qualities, spoken languages (with proficiency level), professional certifications, methodologies (Agile, Scrum, Lean, etc.), and competencies not listed elsewhere.',
  },
  {
    filename: 'hobbies-projects.md',
    name: 'Hobbies & Projects',
    description:
      'Personal or side projects (include URLs/GitHub links if available), open-source contributions, technical hobbies, and non-technical interests that demonstrate character or transferable skills.',
  },
  {
    filename: 'cover-letter.md',
    name: 'Cover Letter Template',
    description:
      'A professional general-purpose cover letter with [Company] and [Role Title] as placeholders. Three to four paragraphs: hook/introduction, relevant experience highlights, enthusiasm + culture fit, and call to action. Tailor the tone to the candidate\'s background.',
  },
];

export const PARTS_EXTRACT_SYSTEM = `You are a professional resume writer. Your task is to extract and write a specific resume section from source documents provided by the user.

Rules:
- Respond with ONLY the section content in clean markdown format.
- Do NOT include the section heading/title — that is added by the template.
- Preserve all factual information exactly: dates, company names, job titles, technologies, metrics, and achievements from the sources.
- If an existing version of the section is provided, treat it as a high-quality baseline. Preserve its structure and wording; only add, correct, or improve based on additional information found in the new sources.
- Do not invent, embellish, or fabricate any information. If a detail is not in the sources, omit it.
- Write in a professional, concise tone suitable for a resume.
- Use markdown bullet points (- ) for lists; use **bold** for emphasis only where it adds clarity.`;

/**
 * Build the user message for extracting one Part from source documents.
 *
 * @param {string} partName
 * @param {string} partDescription
 * @param {Record<string,string>} sources  - { filename: content }
 * @param {string|null} existingContent    - current Part content, or null
 */
export function partsExtractPrompt(partName, partDescription, sources, existingContent) {
  const lines = [
    `## Target Section: ${partName}`,
    '',
    `**What to extract:** ${partDescription}`,
    '',
  ];

  if (existingContent?.trim()) {
    lines.push('## Existing Version — use as baseline, preserve and improve');
    lines.push('');
    lines.push(existingContent.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Source Documents');
  lines.push('');

  for (const [name, content] of Object.entries(sources)) {
    lines.push(`### Source: ${name}`);
    lines.push('');
    lines.push(content.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`Extract and write the **${partName}** section based on the source documents above.`);

  return lines.join('\n');
}
