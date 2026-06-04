// The ONLY place that touches the database. Throws domain errors, not HTTP.
// Per auth-api/.ai/instruct.md → Module-Specific Rules → Layering.

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
}

// Stub. Real impl would use the data-layer module's repository base class.
export const userRepository = {
  async findByEmail(email: string): Promise<UserRow | null> {
    // SELECT id, email, password_hash FROM users WHERE email = $1
    void email;
    return null;
  },

  async create(user: Omit<UserRow, 'id'>): Promise<UserRow> {
    // INSERT INTO users (id, email, password_hash) VALUES (gen_random_uuid(), $1, $2) RETURNING *
    void user;
    return { id: 'stub-uuid', email: user.email, passwordHash: user.passwordHash };
  },
};
