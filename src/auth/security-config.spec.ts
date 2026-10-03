import { ConfigService } from '@nestjs/config';
import { requireJwtSecret, requireSeedCredentials } from './security-config';
describe('Security configuration', () => {
  it.each([
    undefined,
    '',
    'dev-secret',
    'change-me-to-random-long-string',
    'x'.repeat(64),
  ])('rejects unsafe JWT secret %s', (value) => {
    expect(() =>
      requireJwtSecret(new ConfigService({ JWT_SECRET: value })),
    ).toThrow();
  });
  it('accepts a random-looking secret', () => {
    expect(
      requireJwtSecret(
        new ConfigService({ JWT_SECRET: '0123456789abcdef'.repeat(4) }),
      ),
    ).toHaveLength(64);
  });
  it.each([
    {},
    {
      SEED_ADMIN_EMAIL: 'admin@example.org',
      SEED_ADMIN_PASSWORD: 'ChangeMe123!',
    },
  ])('rejects missing or default seed credentials', (env) => {
    expect(() => requireSeedCredentials(env)).toThrow();
  });
});
