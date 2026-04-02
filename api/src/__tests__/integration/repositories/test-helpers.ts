import {AuthenticationBindings} from '@loopback/authentication';
import {juggler} from '@loopback/repository';
import {securityId, UserProfile} from '@loopback/security';
import {RestApi} from '../../..';
import {PostgresDbDataSource} from '../../../datasources';
import {User, Workspace} from '../../../models';
import {UserRepository, WorkspaceRepository} from '../../../repositories';
import * as repositoryExports from '../../../repositories';

const TEST_TABLES = [
  'github."label"',
  'github."pull_request"',
  'github."issue"',
  'github."repository"',
  '"system"."file"',
  '"system"."invitation"',
  '"system"."workspace_member"',
  '"system".workspace',
  'auth.access_token',
  'auth."user"',
];

const TEST_POSTGRES_HOST = process.env.POSTGRES_TEST_HOST ?? 'localhost';
const TEST_POSTGRES_PORT = Number(process.env.POSTGRES_TEST_PORT ?? 5432);
const TEST_POSTGRES_USER = process.env.POSTGRES_TEST_USER ?? 'postgres';
const TEST_POSTGRES_PASSWORD = process.env.POSTGRES_TEST_PASSWORD ?? 'postgres';
const TEST_POSTGRES_DATABASE =
  process.env.POSTGRES_TEST_DATABASE ?? 'onlab_test';

const TEST_DATASOURCE_CONFIG = {
  name: 'postgresDB',
  connector: 'postgresql' as const,
  url:
    process.env.POSTGRES_TEST_URL ??
    `postgres://${TEST_POSTGRES_USER}:${TEST_POSTGRES_PASSWORD}@${TEST_POSTGRES_HOST}:${TEST_POSTGRES_PORT}/${TEST_POSTGRES_DATABASE}`,
  host: TEST_POSTGRES_HOST,
  port: TEST_POSTGRES_PORT,
  user: TEST_POSTGRES_USER,
  password: TEST_POSTGRES_PASSWORD,
  database: TEST_POSTGRES_DATABASE,
  connectionTimeoutMillis: 3000,
};

export const createTestDataSource = () =>
  new PostgresDbDataSource(TEST_DATASOURCE_CONFIG);

export const resetTestDataSource = async (dataSource: juggler.DataSource) => {
  await dataSource.execute(
    `TRUNCATE TABLE ${TEST_TABLES.join(', ')} RESTART IDENTITY CASCADE;`,
  );
};

const registerRepositories = (app: RestApi) => {
  for (const exportedValue of Object.values(repositoryExports)) {
    if (
      typeof exportedValue === 'function' &&
      exportedValue.name.endsWith('Repository')
    ) {
      app.repository(exportedValue as never);
    }
  }
};

export const setupRepositoryTestApp = async (
  options: {
    currentUser?: UserProfile | undefined;
  } = {},
) => {
  let currentUser: UserProfile | undefined =
    options.currentUser ?? givenCurrentUser();
  const app = new RestApi();
  const dataSource = createTestDataSource();

  app.bind('datasources.config.postgres').to(dataSource.settings);
  app.bind('datasources.config.postgresDB').to(dataSource.settings);
  app.unbind('datasources.postgresDB');
  app.bind('datasources.postgresDB').to(dataSource);
  app
    .bind(AuthenticationBindings.CURRENT_USER)
    .toDynamicValue(async () => currentUser);
  registerRepositories(app);

  return {
    app,
    dataSource,
    setCurrentUser: (nextCurrentUser?: UserProfile) => {
      currentUser = nextCurrentUser;
    },
  };
};

export const getTestRepository = async <T>(
  app: RestApi,
  repositoryName: string,
): Promise<T> => app.get<T>(`repositories.${repositoryName}`);

export const teardownRepositoryTestApp = async (
  app?: RestApi,
  dataSource?: juggler.DataSource,
) => {
  await dataSource?.disconnect();
  await app?.stop();
};

export const givenCurrentUser = (id = 1): UserProfile => ({
  id,
  [securityId]: String(id),
});

export const createTestUser = async (
  userRepository: UserRepository,
  overrides: Partial<User> = {},
) =>
  userRepository.create(
    new User({
      githubId: 1,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      ...overrides,
    }),
  );

export const createTestWorkspace = async (
  workspaceRepository: WorkspaceRepository,
  ownerId: number,
  overrides: Partial<Workspace> = {},
) =>
  workspaceRepository.create(
    new Workspace({
      name: 'Demo Workspace',
      ownerId,
      ...overrides,
    }),
  );
