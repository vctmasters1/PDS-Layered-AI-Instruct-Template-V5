// See server/AI-INSTRUCT.md — all file I/O must go through this service
import { promises as fs } from 'fs';
import path from 'path';

function base() {
  // USERDATA_PATH env var, or fall back to ../../UserData relative to this file
  return process.env.USERDATA_PATH
    || path.resolve(import.meta.dirname, '../../../UserData');
}

function sanitizeFilename(name) {
  return path.basename(name)
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '-');
}

export const fileStore = {
  userRoot(username) {
    return path.join(base(), username);
  },

  async ensureUserDirs(username) {
    const root = this.userRoot(username);
    await fs.mkdir(path.join(root, 'Parts'),          { recursive: true });
    await fs.mkdir(path.join(root, 'Listings'),       { recursive: true });
    await fs.mkdir(path.join(root, 'Current'),        { recursive: true });
    await fs.mkdir(path.join(root, 'Sources'),        { recursive: true });
    await fs.mkdir(path.join(root, 'Sources', 'other'), { recursive: true });
    return root;
  },

  async writeFile(userRoot, relPath, content) {
    const full = path.join(userRoot, relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (typeof content === 'string') {
      await fs.writeFile(full, content, 'utf8');
    } else {
      await fs.writeFile(full, content);
    }
  },

  async readFile(userRoot, relPath) {
    return fs.readFile(path.join(userRoot, relPath), 'utf8');
  },

  async readFileBuffer(userRoot, relPath) {
    return fs.readFile(path.join(userRoot, relPath));
  },

  async listDir(userRoot, relDir) {
    const dir = path.join(userRoot, relDir);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      return [];
    }
  },

  async deleteFile(userRoot, relPath) {
    await fs.unlink(path.join(userRoot, relPath));
  },

  async exists(userRoot, relPath) {
    try {
      await fs.access(path.join(userRoot, relPath));
      return true;
    } catch {
      return false;
    }
  },

  async deleteDir(userRoot, relPath) {
    await fs.rm(path.join(userRoot, relPath), { recursive: true, force: true });
  },

  fullPath(userRoot, relPath) {
    return path.join(userRoot, relPath);
  },

  sanitizeFilename,
};
