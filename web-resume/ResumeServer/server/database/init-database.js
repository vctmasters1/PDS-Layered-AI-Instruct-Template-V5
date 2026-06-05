import { readFileSync } from 'fs';
import path from 'path';
import { db } from './database.js';

export async function initDatabase() {
  const schemaPath = path.join(import.meta.dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');
  await db.query(sql);
  console.log('[db] Schema initialized.');

  // Reset any jobs that were left in 'running' state from a previous server instance
  const reset = await db.query(
    `UPDATE workflow_jobs SET status = 'error', error = 'Server restarted while job was running — click Run Workflow to retry.'
     WHERE status = 'running'`
  );
  if (reset.rowCount > 0) {
    console.log(`[db] Reset ${reset.rowCount} stuck running job(s) to error.`);
  }
}
