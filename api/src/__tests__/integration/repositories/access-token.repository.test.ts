import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {RestApi} from '../../..';
import {AccessToken} from '../../../models';
import {AccessTokenRepository, UserRepository} from '../../../repositories';
import {
  createTestUser,
  getTestRepository,
  resetTestDataSource,
  setupRepositoryTestApp,
  teardownRepositoryTestApp,
} from './test-helpers';

describe('AccessTokenRepository (integration)', () => {
  let app: RestApi;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let repository: AccessTokenRepository;
  let userRepository: UserRepository;
  let userId: number;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    userRepository = await getTestRepository<UserRepository>(
      app,
      'UserRepository',
    );
    repository = await getTestRepository<AccessTokenRepository>(
      app,
      'AccessTokenRepository',
    );
  });

  beforeEach(async () => {
    await resetTestDataSource(dataSource);
    const user = await createTestUser(userRepository);
    userId = user.id;
  });

  afterAll(async () => {
    await teardownRepositoryTestApp(app, dataSource);
  });

  const createToken = () =>
    repository.create(
      new AccessToken({
        id: 'token-1',
        userId,
        githubToken: 'github-token',
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        expiresAt: new Date('2026-03-19T10:00:00.000Z'),
        revoked: false,
      }),
    );

  it('creates access tokens', async () => {
    await createToken();

    expect(await repository.count()).toEqual({count: 1});
  });

  it('finds access tokens by id', async () => {
    const created = await createToken();

    expect((await repository.findById(created.id)).githubToken).toBe(
      'github-token',
    );
  });

  it('updates access tokens by id', async () => {
    const created = await createToken();

    await repository.updateById(created.id, {revoked: true});
    expect((await repository.findById(created.id)).revoked).toBe(true);
  });

  it('deletes access tokens by id', async () => {
    const created = await createToken();

    await repository.deleteById(created.id);
    expect(await repository.count()).toEqual({count: 0});
  });

  it('registers the user inclusion resolver', () => {
    expect(repository.inclusionResolvers.has('user')).toBe(true);
  });
});
