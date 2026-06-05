// reimport-listings.js
// One-shot script: scans UserData/<user>/Current/ folders and re-creates
// missing DB listings from the Listings/ markdown files on disk.
// Run: docker exec -i resumeserver-app-1 node admin/scripts/reimport-listings.js
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const userdataPath = process.env.USERDATA_PATH || '/app/userdata';

function slugToTitle(slug) {
  return slug
    .replace(/,/g, ', ')
    .replace(/-—-/g, ' — ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(content, slug) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    const h1 = match[1].trim();
    if (!h1.toLowerCase().startsWith('unknown title')) return h1;
  }
  return slugToTitle(slug);
}

async function main() {
  const client = await pool.connect();
  try {
    // Get all users
    const { rows: users } = await client.query('SELECT id, username FROM users');

    for (const user of users) {
      const currentDir = path.join(userdataPath, user.username, 'Current');
      const listingsDir = path.join(userdataPath, user.username, 'Listings');

      if (!fs.existsSync(currentDir)) {
        console.log(`[${user.username}] No Current/ directory, skipping.`);
        continue;
      }

      const folders = fs.readdirSync(currentDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const folderName of folders) {
        // Strip leading number prefix (e.g. "0001-") to get slug
        const slug = folderName.replace(/^\d+-/, '');

        // Check if already in DB
        const existing = await client.query(
          'SELECT id FROM listings WHERE user_id=$1 AND folder_name=$2',
          [user.id, folderName]
        );
        if (existing.rows.length) {
          console.log(`[${user.username}] Skipping ${folderName} — already in DB (id=${existing.rows[0].id})`);
          continue;
        }

        // Read listing content from Listings/<slug>.md
        const listingFile = path.join(listingsDir, `${slug}.md`);
        let content = '';
        if (fs.existsSync(listingFile)) {
          content = fs.readFileSync(listingFile, 'utf8');
        } else {
          console.warn(`[${user.username}] No listing file for ${slug}, inserting with empty content.`);
        }

        const title = extractTitle(content, slug);

        // Ensure slug is unique for this user (shouldn't be an issue here)
        const inserted = await client.query(
          `INSERT INTO listings (user_id, title, slug, folder_name, content)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [user.id, title, slug, folderName, content]
        );
        console.log(`[${user.username}] Imported "${title}" → folder ${folderName} (id=${inserted.rows[0].id})`);
      }
    }

    // Delete any DB listings whose folder_name doesn't exist on disk
    const { rows: allListings } = await client.query(
      'SELECT l.id, l.folder_name, l.title, u.username FROM listings l JOIN users u ON u.id = l.user_id'
    );
    for (const listing of allListings) {
      const folderPath = path.join(userdataPath, listing.username, 'Current', listing.folder_name);
      if (!fs.existsSync(folderPath)) {
        await client.query('DELETE FROM listings WHERE id=$1', [listing.id]);
        console.log(`[${listing.username}] Removed stale listing "${listing.title}" (folder not on disk: ${listing.folder_name})`);
      }
    }

    console.log('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
