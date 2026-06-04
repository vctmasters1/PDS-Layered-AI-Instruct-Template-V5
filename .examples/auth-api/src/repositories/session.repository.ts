// Sessions: refresh-token tracking and revocation.
// Per auth-api/.ai/instruct.md → Module-Specific Rules → Layering.
// The ONLY place that reads/writes the `sessions` table.

export interface SessionRow {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

// Stub. Real impl would use the data-layer module's repository base class with a pg/Redis backend.
export const sessionRepository = {
  async create(session: Omit<SessionRow, 'revokedAt'>): Promise<void> {
    // INSERT INTO sessions (id, user_id, refresh_token, expires_at) VALUES ($1,$2,$3,$4)
    void session;
  },

  async findByRefreshToken(token: string): Promise<SessionRow | null> {
    // SELECT * FROM sessions WHERE refresh_token = $1 AND revoked_at IS NULL
    void token;
    return null;
  },

  async revoke(refreshToken: string): Promise<void> {
    // UPDATE sessions SET revoked_at = NOW() WHERE refresh_token = $1
    void refreshToken;
  },

  async revokeAllForUser(userId: string): Promise<void> {
    // UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL
    void userId;
  },
};
