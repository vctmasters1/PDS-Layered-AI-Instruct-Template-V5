// Domain errors. Routes translate these to HTTP at the boundary.
// Services and repositories NEVER throw HTTP-shaped errors.
// Per auth-api/.ai/instruct.md → Module-Specific Rules → Layering.

export class InvalidCredentialsError extends Error {
  constructor() {
    super('invalid credentials');
  }
}

export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`user not found: ${userId}`);
  }
}

export class EmailTakenError extends Error {
  constructor(public readonly email: string) {
    super(`email already registered: ${email}`);
  }
}
