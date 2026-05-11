import {existsSync} from 'fs';
import path from 'path';
import {runTestMigrations} from './test-database';

export default async function globalSetup() {
  if (!shouldRunTestMigrations()) {
    return;
  }

  await runTestMigrations();
}

function shouldRunTestMigrations(): boolean {
  if (process.env.SKIP_TEST_MIGRATIONS === 'true') {
    return false;
  }

  if (process.env.RUN_TEST_MIGRATIONS === 'true') {
    return true;
  }

  if (!existsSync(path.resolve(process.cwd(), 'src/__tests__'))) {
    return false;
  }

  const testFileFilters = getExplicitTestFilters();

  if (!testFileFilters.length) {
    return true;
  }

  return testFileFilters.some(argument => argument.includes('integration'));
}

function getExplicitTestFilters(): string[] {
  const runIndex = process.argv.lastIndexOf('run');
  const candidateArgs =
    runIndex >= 0 ? process.argv.slice(runIndex + 1) : process.argv.slice(2);

  return candidateArgs.filter(
    argument => argument.length > 0 && !argument.startsWith('-'),
  );
}
