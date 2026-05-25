import {execFile} from 'child_process';
import {config as loadDotenv} from 'dotenv';
import path from 'path';
import {promisify} from 'util';

const API_ROOT = path.resolve(__dirname, '../..');

loadDotenv({path: path.resolve(API_ROOT, '.env')});

const TEST_POSTGRES_HOST =
  process.env.TEST_POSTGRES_HOST ??
  process.env.POSTGRES_TEST_HOST ??
  process.env.POSTGRES_HOST ??
  'localhost';
const TEST_POSTGRES_PORT = Number(
  process.env.TEST_POSTGRES_PORT ??
    process.env.POSTGRES_TEST_PORT ??
    process.env.POSTGRES_PORT ??
    5432,
);
const TEST_POSTGRES_USER =
  process.env.TEST_POSTGRES_USER ??
  process.env.POSTGRES_TEST_USER ??
  process.env.POSTGRES_USER ??
  'postgres';
const TEST_POSTGRES_PASSWORD =
  process.env.TEST_POSTGRES_PASSWORD ??
  process.env.POSTGRES_TEST_PASSWORD ??
  process.env.POSTGRES_PASSWORD ??
  'postgres';
const TEST_POSTGRES_DATABASE =
  process.env.TEST_POSTGRES_DATABASE ??
  process.env.POSTGRES_TEST_DATABASE ??
  getDefaultTestDatabase() ??
  'onlab_test';

export const TEST_DATASOURCE_CONFIG = {
  name: 'postgresDB',
  connector: 'postgresql' as const,
  url:
    process.env.TEST_POSTGRES_URL ??
    process.env.POSTGRES_TEST_URL ??
    `postgres://${TEST_POSTGRES_USER}:${TEST_POSTGRES_PASSWORD}@${TEST_POSTGRES_HOST}:${TEST_POSTGRES_PORT}/${TEST_POSTGRES_DATABASE}`,
  host: TEST_POSTGRES_HOST,
  port: TEST_POSTGRES_PORT,
  user: TEST_POSTGRES_USER,
  password: TEST_POSTGRES_PASSWORD,
  database: TEST_POSTGRES_DATABASE,
  connectionTimeoutMillis: 3000,
};

const execFileAsync = promisify(execFile);
let migrationsPromise: Promise<void> | undefined;

function getDefaultTestDatabase(): string | undefined {
  if (!process.env.POSTGRES_DATABASE) {
    return undefined;
  }

  return `${process.env.POSTGRES_DATABASE.replace(/_?test$/i, '')}_test`;
}

export const runTestMigrations = async () => {
  migrationsPromise ??= runMigrations();
  await migrationsPromise;
};

const runMigrations = async () => {
  try {
    const {stdout, stderr} = await execFileAsync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'db-migrate', 'up', '--env', 'test'],
      {
        cwd: API_ROOT,
        env: {
          ...process.env,
          TEST_POSTGRES_HOST,
          TEST_POSTGRES_PORT: String(TEST_POSTGRES_PORT),
          TEST_POSTGRES_USER,
          TEST_POSTGRES_PASSWORD,
          TEST_POSTGRES_DATABASE,
        },
      },
    );

    if (stdout) {
      console.log(stdout);
    }

    if (stderr) {
      console.error(stderr);
    }
  } catch (error) {
    console.error('Migration failed:', error);

    throw error;
  }
};
