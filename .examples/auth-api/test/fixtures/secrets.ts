// Test-only secrets. Per auth-api/.ai/instruct.md → Testing Rules:
// "Tests never use production-shaped secrets."
//
// NEVER import this file from production code. It is deliberately weak.

export const TEST_JWT_SECRET = 'test-only-do-not-use';
