import { spawn } from 'child_process';
import path from 'path';
import { env } from '../config/env.js';

const SCRIPT_PATH = path.resolve(import.meta.dirname, '../scripts/ats_multi_score.py');

export const atsScorer = {
  /**
   * @param {object} opts
   * @param {string} opts.listing  - listing slug (e.g. "Acme-Engineer")
   * @param {string} opts.userRoot - absolute path to user's data dir
   * @param {string} opts.pass     - "000" or "001"
   * @param {string} opts.name     - user's full name slug (e.g. "VictorMasters")
   */
  score({ listing, userRoot, pass, name }) {
    return new Promise((resolve, reject) => {
      const args = [
        SCRIPT_PATH,
        '--listing', listing,
        '--root',    userRoot,
        '--pass',    pass,
        '--name',    name,
      ];

      const proc = spawn(env.pythonCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`ATS scorer exited ${code}: ${stderr.trim().slice(0, 400)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Python: ${err.message}`));
      });
    });
  },
};
