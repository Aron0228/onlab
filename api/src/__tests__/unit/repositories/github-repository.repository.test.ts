import {beforeEach, describe, expect, it} from 'vitest';
import {juggler} from '@loopback/repository';

import {GithubIssue, GithubRepository, User, Workspace} from '../../../models';
import {
  GithubIssueRepository,
  GithubRepositoryRepository,
} from '../../../repositories';
import {buildSystemRepositories, createMemoryDataSource} from './test-helpers';

describe('GithubRepositoryRepository (unit)', () => {
  let dataSource: juggler.DataSource;
  let githubIssueRepository: GithubIssueRepository;
  let githubRepositoryRepository: GithubRepositoryRepository;
  let workspaceId: number;

  beforeEach(async () => {
    dataSource = createMemoryDataSource();
    const {userRepository, workspaceRepository} =
      buildSystemRepositories(dataSource);

    githubIssueRepository = new GithubIssueRepository(
      dataSource as never,
      async () => githubRepositoryRepository,
    );
    githubRepositoryRepository = new GithubRepositoryRepository(
      dataSource as never,
      async () => workspaceRepository,
      async () => githubIssueRepository,
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
    const workspace = await workspaceRepository.create(
      new Workspace({
        name: 'Demo Workspace',
        ownerId: user.id,
      }),
    );

    workspaceId = workspace.id;
  });

  it('deleteCascade deletes repository issues before deleting the repository', async () => {
    const repository = await githubRepositoryRepository.create(
      new GithubRepository({
        workspaceId,
        githubRepoId: 123,
        name: 'onlab',
        fullName: 'aron0228/onlab',
      }),
    );

    await githubIssueRepository.create(
      new GithubIssue({
        repositoryId: repository.id,
        githubId: 456,
        title: 'Issue 1',
        description: 'Needs attention',
      }),
    );

    await githubRepositoryRepository.deleteCascade(repository.id);

    expect(await githubIssueRepository.count()).toEqual({count: 0});
    expect(await githubRepositoryRepository.count()).toEqual({count: 0});
  });
});
