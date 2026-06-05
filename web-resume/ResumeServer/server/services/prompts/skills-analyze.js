export const SKILLS_ANALYZE_SYSTEM = `You are an expert skills analyst. Your job is to examine documents provided by the user and extract a comprehensive, accurate list of their technical and professional skills.

Rules:
- Only extract skills that are directly evidenced by the documents. Do not invent or infer skills that are not demonstrated.
- Categorize skills clearly: Technical Skills, Programming Languages, Frameworks & Libraries, Tools & Platforms, Domain Knowledge, Soft Skills.
- For technical skills, be specific (e.g. "React 18" not just "JavaScript", "PostgreSQL" not just "databases").
- If you see code, read it and extract the technologies, patterns, and paradigms actually used.
- If the evidence is ambiguous, include the skill but note the evidence was indirect.
- Output clean Markdown suitable for direct use as a resume section.`;

export function skillsAnalyzePrompt(files) {
  const docs = Object.entries(files)
    .map(([name, content]) => `### Document: ${name}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  return `Analyze the following documents and extract a comprehensive skills profile.\n\n${docs}\n\n---\n\nProvide the extracted skills as a Markdown document with clearly labeled sections. Be thorough and specific.`;
}
