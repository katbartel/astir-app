export type Env = {
  NODE_ENV: string
  PORT: string
  DATABASE_URL: string
  FRONTEND_ORIGIN: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_CALLBACK_URL: string
  GOOGLE_CALENDAR_CALLBACK_URL: string
  CALENDAR_TOKEN_ENCRYPTION_KEY: string
  JWT_SECRET: string
  JOB_INGESTION_ENABLED: string
  ADZUNA_APP_ID: string
  ADZUNA_APP_KEY: string
  // Comma-separated allow-list of admin emails. Admins see the Preferences →
  // Admin Panel and can curate the global Remote Job Board company list.
  ADMIN_EMAILS: string
}

export function validateEnv(config: Record<string, unknown>): Env {
  return {
    NODE_ENV: String(config.NODE_ENV ?? 'development'),
    PORT: String(config.PORT ?? '3000'),
    DATABASE_URL: String(
      config.DATABASE_URL ?? 'postgresql://astir:astir@localhost:5432/astir?schema=public',
    ),
    FRONTEND_ORIGIN: String(config.FRONTEND_ORIGIN ?? 'http://localhost:5173'),
    GOOGLE_CLIENT_ID: String(config.GOOGLE_CLIENT_ID ?? ''),
    GOOGLE_CLIENT_SECRET: String(config.GOOGLE_CLIENT_SECRET ?? ''),
    GOOGLE_CALLBACK_URL: String(
      config.GOOGLE_CALLBACK_URL ?? 'http://localhost:5173/api/auth/google/callback',
    ),
    GOOGLE_CALENDAR_CALLBACK_URL: String(
      config.GOOGLE_CALENDAR_CALLBACK_URL ?? 'http://localhost:5173/api/calendar/callback',
    ),
    // Required in production by CalendarTokenCipher. Development may derive a
    // local key from JWT_SECRET, so the existing local stack remains bootable.
    CALENDAR_TOKEN_ENCRYPTION_KEY: String(config.CALENDAR_TOKEN_ENCRYPTION_KEY ?? ''),
    JWT_SECRET: String(config.JWT_SECRET ?? 'dev-only-jwt-secret'),
    JOB_INGESTION_ENABLED: String(config.JOB_INGESTION_ENABLED ?? 'true'),
    ADZUNA_APP_ID: String(config.ADZUNA_APP_ID ?? ''),
    ADZUNA_APP_KEY: String(config.ADZUNA_APP_KEY ?? ''),
    ADMIN_EMAILS: String(config.ADMIN_EMAILS ?? 'bartel.katarzyna@gmail.com'),
  }
}
