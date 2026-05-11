import {AuthenticationBindings} from '@loopback/authentication';
import {juggler} from '@loopback/repository';
import {securityId, UserProfile} from '@loopback/security';
import {RestApi} from '../../..';
import {PostgresDbDataSource} from '../../../datasources';
import {User, Workspace} from '../../../models';
import {UserRepository, WorkspaceRepository} from '../../../repositories';
import * as repositoryExports from '../../../repositories';
import {TEST_DATASOURCE_CONFIG} from '../../test-database';

const TEST_SCHEMAS = ['auth', 'system', 'github', 'planning', 'communication'];

export const createTestDataSource = () =>
  new PostgresDbDataSource(TEST_DATASOURCE_CONFIG);

export const resetTestDataSource = async (dataSource: juggler.DataSource) => {
  const tables = await getTestTableNames(dataSource);

  if (!tables.length) {
    return;
  }

  await dataSource.execute(
    `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE;`,
  );
};

const getTestTableNames = async (
  dataSource: juggler.DataSource,
): Promise<string[]> => {
  const rows = await dataSource.execute(
    `
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname = ANY($1)
      ORDER BY schemaname, tablename;
    `,
    [TEST_SCHEMAS],
  );

  return rows.map(
    (row: {schemaname: string; tablename: string}) =>
      `"${row.schemaname}"."${row.tablename}"`,
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
