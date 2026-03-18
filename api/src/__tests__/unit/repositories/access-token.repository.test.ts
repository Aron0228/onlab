import {beforeEach, describe, expect, it} from 'vitest';
import {juggler} from '@loopback/repository';

import {AccessToken, User} from '../../../models';
import {AccessTokenRepository} from '../../../repositories';
import {UserRepository} from '../../../repositories';
import {createMemoryDataSource} from './test-helpers';

describe('AccessTokenRepository (unit)', () => {
  let dataSource: juggler.DataSource;
  let repository: AccessTokenRepository;
  let userRepository: UserRepository;
  let userId: number;

  beforeEach(async () => {
    dataSource = createMemoryDataSource();
    userRepository = new UserRepository(dataSource as never);
    repository = new AccessTokenRepository(
      dataSource as never,
      async () => userRepository,
    );
    const user = await userRepository.create(
      new User({
        githubId: 1,
        username: 'aron0228',
        fullName: 'Reszegi Aron',
        email: 'aron@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    );
    userId = user.id;
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
