import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {RestApi} from '../../..';
import {UserRepository} from '../../../repositories';
import {
  createTestUser,
  getTestRepository,
  resetTestDataSource,
  setupRepositoryTestApp,
  teardownRepositoryTestApp,
} from './test-helpers';

describe('UserRepository (integration)', () => {
  let app: RestApi;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let repository: UserRepository;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    repository = await getTestRepository<UserRepository>(
      app,
      'UserRepository',
    );
  });

  beforeEach(async () => {
    await resetTestDataSource(dataSource);
  });

  afterAll(async () => {
    await teardownRepositoryTestApp(app, dataSource);
  });

  const createUser = () => createTestUser(repository);

  it('creates users', async () => {
    await createUser();

    expect(await repository.count()).toEqual({count: 1});
  });

  it('finds users', async () => {
    await createUser();

    expect((await repository.find()).map(user => user.username)).toEqual([
      'aron0228',
    ]);
  });

  it('updates users by id', async () => {
    const created = await createUser();

    await repository.updateById(created.id, {fullName: 'Updated Name'});
    const found = await repository.findById(created.id);

    expect(found.username).toBe('aron0228');
    expect(found.fullName).toBe('Updated Name');
  });

  it('deletes users by id', async () => {
    const created = await createUser();

    await repository.deleteById(created.id);

    expect(await repository.count()).toEqual({count: 0});
  });
});
