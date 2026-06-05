export const TEMPLATE_ANALYZE_SYSTEM = `You are a resume formatting and style expert.
The user has provided one or more example resume documents.
Your task is to analyze those examples and write a concise style guide that an AI resume writer should follow.
Output ONLY the style guide markdown — no preamble, no code fences.`;

export function templateAnalyzePrompt(files) {
  const filesText = Object.entries(files)
    .map(([name, content]) => `### ${name}\n${content}`)
    .join('\n\n---\n\n');

  return `Analyze the following resume example(s) and produce a concise style guide titled "## Resume Style Guide".

Focus on:
1. Section names and ordering
2. Bullet point style (length, verb usage, quantification approach)
3. Tone and writing style (formal, punchy, detailed, brief, etc.)
4. Date and location formatting conventions
5. Any structural or layout preferences evident in the text

Keep the guide under 600 words. Be specific and actionable — write it as instructions for an AI that will be generating a resume.

---

## EXAMPLE RESUME(S)
${filesText}`;
}
