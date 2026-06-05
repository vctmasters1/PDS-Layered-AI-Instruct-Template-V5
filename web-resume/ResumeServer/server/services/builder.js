import { spawn } from 'child_process';
import path from 'path';

const REFERENCE_DOC = path.resolve(import.meta.dirname, '../templates/reference.docx');

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim().slice(0, 400)}`));
    });
    proc.on('error', (err) => reject(new Error(`Failed to spawn ${cmd}: ${err.message}`)));
  });
}

export const builder = {
  /**
   * Convert <Name>-001.md → DOCX, then attempt DOCX → PDF via soffice.
   * @param {object} opts
   * @param {string} opts.mdPath
   * @param {string} opts.docxPath
   * @param {string} opts.pdfPath
   * @param {string|null} [opts.referenceDoc] - optional user-supplied reference.docx path
   * Returns { docx: true, pdf: boolean }
   */
  async build({ mdPath, docxPath, pdfPath, referenceDoc = null }) {
    const pandocArgs = [mdPath, '-o', docxPath];

    // Prefer user-supplied template, fall back to bundled reference.docx
    const refDoc = referenceDoc ?? REFERENCE_DOC;
    const { promises: fs } = await import('fs');
    try {
      await fs.access(refDoc);
      pandocArgs.push(`--reference-doc=${refDoc}`);
    } catch {
      // No reference doc — use pandoc defaults
    }

    await run('pandoc', pandocArgs, path.dirname(mdPath));

    // Attempt PDF via LibreOffice (soffice)
    let pdfOk = false;
    try {
      await run('soffice', [
        '--headless',
        '--convert-to', 'pdf:writer_pdf_Export',
        '--outdir', path.dirname(pdfPath),
        docxPath,
      ], path.dirname(docxPath));

      // soffice names the output <stem>.pdf in the outdir
      const stem = path.basename(docxPath, '.docx');
      const sofficePdf = path.join(path.dirname(docxPath), `${stem}.pdf`);
      if (sofficePdf !== pdfPath) {
        await fs.rename(sofficePdf, pdfPath);
      }
      pdfOk = true;
    } catch (err) {
      console.warn('[builder] PDF conversion failed (soffice not available?):', err.message);
    }

    return { docx: true, pdf: pdfOk };
  },
};
