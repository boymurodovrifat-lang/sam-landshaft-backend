import { ConfigService } from '@nestjs/config';

export function requireJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET') ?? '';
  if (
    secret.length < 32 ||
    /^(dev-secret|change-me|replace-me)/i.test(secret) ||
    new Set(secret).size < 8
  ) {
    throw new Error(
      'JWT_SECRET must be a unique random secret of at least 32 characters.',
    );
  }
  return secret;
}

export function requireSeedCredentials(env: NodeJS.ProcessEnv) {
  const email = env.SEED_ADMIN_EMAIL?.trim();
  const password = env.SEED_ADMIN_PASSWORD ?? '';
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 16 || new Set(password).size < 8 ||
    /^(ChangeMe|replace-me)/i.test(password)
  ) {
    throw new Error(
      'Set SEED_ADMIN_EMAIL and a unique SEED_ADMIN_PASSWORD of at least 16 characters.',
    );
  }
  return { email, password };
}
