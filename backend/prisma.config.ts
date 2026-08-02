import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';
dotenv.config();

function resolveDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (configuredUrl && !configuredUrl.includes('${')) {
    return configuredUrl;
  }

  const requiredVariables = [
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_HOST',
    'POSTGRES_DB',
  ] as const;
  const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable],
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing database configuration: ${missingVariables.join(', ')}`,
    );
  }

  const user = encodeURIComponent(process.env.POSTGRES_USER!);
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD!);
  const host = process.env.POSTGRES_HOST!;
  const port = process.env.POSTGRES_PORT || '5432';
  const database = process.env.POSTGRES_DB!;

  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public`;
}

export default defineConfig({
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
