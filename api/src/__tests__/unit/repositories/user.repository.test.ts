import {beforeEach, describe, expect, it} from 'vitest';
import {juggler} from '@loopback/repository';

import {User} from '../../../models';
import {UserRepository} from '../../../repositories';
import {createMemoryDataSource} from './test-helpers';

describe('UserRepository (unit)', () => {
  let dataSource: juggler.DataSource;
  let repository: UserRepository;

  beforeEach(() => {
    dataSource = createMemoryDataSource();
    repository = new UserRepository(dataSource as never);
  });

  const createUser = () =>
    repository.create(
      new User({
        githubId: 1,
        username: 'aron0228',
        fullName: 'Reszegi Aron',
        email: 'aron@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    );

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
