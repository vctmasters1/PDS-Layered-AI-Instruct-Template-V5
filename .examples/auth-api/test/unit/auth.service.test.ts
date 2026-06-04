import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../../src/services/auth.service.js';
import { InvalidCredentialsError, EmailTakenError } from '../../src/lib/errors.js';

// Demonstrates the rule: unit tests mock the repository.
// vi.mock is hoisted, so the mock objects must use vi.hoisted() to be accessible in tests.
const mockUserRepository = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../src/repositories/user.repository.js', () => ({
  userRepository: mockUserRepository,
}));

// Token service is a collaborator — mock it to keep tests focused on authService logic.
vi.mock('../../src/services/token.service.js', () => ({
  issueAccessToken: vi.fn(() => 'test-access-token'),
  issueRefreshToken: vi.fn(async () => 'test-refresh-token'),
  verifyAccessToken: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authService.login', () => {
  it('throws InvalidCredentialsError when user does not exist', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    await expect(authService.login('nobody@example.com', 'correct-horse-battery-staple'))
      .rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe('authService.signup', () => {
  it('returns tokens when email is not taken', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    mockUserRepository.create.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      passwordHash: 'hashed',
    });
    const tokens = await authService.signup('new@example.com', 'correct-horse-battery-staple');
    expect(tokens).toHaveProperty('access');
    expect(tokens).toHaveProperty('refresh');
  });

  it('throws EmailTakenError when email is already registered', async () => {
    mockUserRepository.findByEmail.mockResolvedValue({
      id: 'existing-user',
      email: 'taken@example.com',
      passwordHash: 'hashed',
    });
    await expect(authService.signup('taken@example.com', 'password12345'))
      .rejects.toBeInstanceOf(EmailTakenError);
    expect(mockUserRepository.create).not.toHaveBeenCalled();
  });
});

describe('authService.requestPasswordReset', () => {
  it('returns silently when email does not exist', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    await expect(authService.requestPasswordReset('nobody@example.com'))
      .resolves.toBeUndefined();
  });

  it('returns silently when email exists (prevents enumeration)', async () => {
    mockUserRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'hashed',
    });
    await expect(authService.requestPasswordReset('user@example.com'))
      .resolves.toBeUndefined();
  });
});
