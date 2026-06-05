import '@testing-library/jest-dom';

// Mock environment variables for API testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.PORT = '3001';