import {describe, expect, it, vi} from 'vitest';

import {GithubRepositoryController} from '../../../controllers/github/repository.controller';
import {ExpertiseController} from '../../../controllers/system/expertise.controller';
import {NewsFeedEntryExpertiseAssocController} from '../../../controllers/system/news-feed-entry-expertise-assoc.controller';
import {UserExpertiseAssocController} from '../../../controllers/system/user-expertise-assoc.controller';
import {
  Expertise,
  GithubRepository,
  NewsFeedEntry,
  NewsFeedEntryExpertiseAssoc,
  UserExpertiseAssoc,
} from '../../../models';

const userProfile = {id: 7} as never;

const createAuthorization = () => ({
  getAuthenticatedUserId: vi.fn().mockReturnValue(7),
  accessibleWorkspaceIds: vi.fn().mockResolvedValue([3]),
  assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
  assertWorkspaceAdminOrOwner: vi.fn().mockResolvedValue('ADMIN'),
});

describe('RBAC-managed explicit controllers (unit)', () => {
  it('covers expertise scoped reads and admin mutations', async () => {
    const expertise = new Expertise({
      id: 12,
      workspaceId: 3,
      name: 'Frontend',
      description: 'UI work',
    });
    const repository = {
      find: vi.fn().mockResolvedValue([expertise]),
      count: vi.fn().mockResolvedValue({count: 1}),
      findById: vi.fn().mockResolvedValue({
        ...expertise,
        workspace: {id: 3},
      }),
      create: vi.fn().mockResolvedValue(expertise),
      updateById: vi.fn().mockResolvedValue(undefined),
      replaceById: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    const expertiseCatalogService = {
      createExpertise: vi.fn().mockResolvedValue(expertise),
      updateExpertise: vi.fn().mockResolvedValue(undefined),
      replaceExpertise: vi.fn().mockResolvedValue(undefined),
    };
    const authorization = createAuthorization();
    const controller = new ExpertiseController(
      repository as never,
      authorization as never,
      expertiseCatalogService as never,
    );

    await expect(
      controller.find(userProfile, {where: {name: 'Frontend'}}),
    ).resolves.toEqual([expertise]);
    await expect(
      controller.count(userProfile, {name: 'Frontend'}),
    ).resolves.toEqual({count: 1});
    await expect(controller.findById(userProfile, 12)).resolves.toMatchObject({
      id: 12,
    });
    await expect(
      controller.getRelation(userProfile, 12, 'workspace'),
    ).resolves.toEqual({id: 3});
    await expect(
      controller.create(userProfile, {
        workspaceId: 3,
        name: 'Frontend',
        description: 'UI work',
      }),
    ).resolves.toEqual(expertise);
    await expect(
      controller.updateById(userProfile, 12, {description: 'Design systems'}),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById(userProfile, 12, {
        workspaceId: 3,
        name: 'Frontend',
        description: 'Design systems',
      }),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteById(userProfile, 12),
    ).resolves.toBeUndefined();

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        and: [{name: 'Frontend'}, {workspaceId: {inq: [3]}}],
      },
    });
    expect(repository.count).toHaveBeenCalledWith({
      and: [{name: 'Frontend'}, {workspaceId: {inq: [3]}}],
    });
    expect(expertiseCatalogService.createExpertise).toHaveBeenCalledWith({
      workspaceId: 3,
      name: 'Frontend',
      description: 'UI work',
    });
    expect(expertiseCatalogService.updateExpertise).toHaveBeenCalledWith(12, {
      description: 'Design systems',
    });
    expect(expertiseCatalogService.replaceExpertise).toHaveBeenCalledWith(12, {
      workspaceId: 3,
      name: 'Frontend',
      description: 'Design systems',
    });
    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 7);
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      7,
    );
  });

  it('covers user expertise association scoping and admin mutations', async () => {
    const assoc = new UserExpertiseAssoc({
      id: 14,
      userId: 9,
      expertiseId: 12,
    });
    const assocRepository = {
      find: vi.fn().mockResolvedValue([assoc]),
      count: vi.fn().mockResolvedValue({count: 1}),
      findById: vi.fn().mockResolvedValue({
        ...assoc,
        expertise: {id: 12},
      }),
      create: vi.fn().mockResolvedValue(assoc),
      updateById: vi.fn().mockResolvedValue(undefined),
      replaceById: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    const expertiseCatalogService = {
      assignExpertise: vi.fn().mockResolvedValue(assoc),
      updateAssignment: vi.fn().mockResolvedValue(undefined),
      removeAssignment: vi.fn().mockResolvedValue(undefined),
    };
    const expertiseRepository = {
      find: vi
        .fn()
        .mockResolvedValue([new Expertise({id: 12, workspaceId: 3})]),
      findById: vi
        .fn()
        .mockResolvedValue(new Expertise({id: 12, workspaceId: 3})),
    };
    const authorization = createAuthorization();
    const controller = new UserExpertiseAssocController(
      assocRepository as never,
      expertiseRepository as never,
      authorization as never,
      expertiseCatalogService as never,
    );

    await expect(
      controller.find(userProfile, {where: {userId: 9}}),
    ).resolves.toEqual([assoc]);
    await expect(controller.count(userProfile, {userId: 9})).resolves.toEqual({
      count: 1,
    });
    await expect(controller.findById(userProfile, 14)).resolves.toMatchObject({
      id: 14,
    });
    await expect(
      controller.getRelation(userProfile, 14, 'expertise'),
    ).resolves.toEqual({id: 12});
    await expect(
      controller.create(userProfile, {userId: 9, expertiseId: 12}),
    ).resolves.toEqual(assoc);
    await expect(
      controller.updateById(userProfile, 14, {userId: 10}),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById(userProfile, 14, {userId: 10, expertiseId: 12}),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteById(userProfile, 14),
    ).resolves.toBeUndefined();

    expect(assocRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{userId: 9}, {expertiseId: {inq: [12]}}],
      },
    });
    expect(expertiseCatalogService.assignExpertise).toHaveBeenCalledWith({
      userId: 9,
      expertiseId: 12,
    });
    expect(expertiseCatalogService.updateAssignment).toHaveBeenCalledWith(14, {
      userId: 10,
    });
    expect(expertiseCatalogService.updateAssignment).toHaveBeenCalledWith(14, {
      userId: 10,
      expertiseId: 12,
    });
    expect(expertiseCatalogService.removeAssignment).toHaveBeenCalledWith(14);
    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 7);
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      7,
    );
  });

  it('covers GitHub repository scoped reads and admin mutations', async () => {
    const githubRepository = new GithubRepository({
      id: 4,
      workspaceId: 3,
      githubRepoId: 100,
      name: 'api',
      fullName: 'team/api',
    });
    const repository = {
      find: vi.fn().mockResolvedValue([githubRepository]),
      count: vi.fn().mockResolvedValue({count: 1}),
      findById: vi.fn().mockResolvedValue({
        ...githubRepository,
        workspace: {id: 3},
      }),
      create: vi.fn().mockResolvedValue(githubRepository),
      updateById: vi.fn().mockResolvedValue(undefined),
      replaceById: vi.fn().mockResolvedValue(undefined),
      deleteCascade: vi.fn().mockResolvedValue(undefined),
    };
    const authorization = createAuthorization();
    const controller = new GithubRepositoryController(
      repository as never,
      authorization as never,
    );

    await expect(
      controller.find(userProfile, {where: {name: 'api'}}),
    ).resolves.toEqual([githubRepository]);
    await expect(controller.count(userProfile, {name: 'api'})).resolves.toEqual(
      {
        count: 1,
      },
    );
    await expect(controller.findById(userProfile, 4)).resolves.toMatchObject({
      id: 4,
    });
    await expect(
      controller.getRelation(userProfile, 4, 'workspace'),
    ).resolves.toEqual({id: 3});
    await expect(
      controller.create(userProfile, {
        workspaceId: 3,
        githubRepoId: 100,
        name: 'api',
        fullName: 'team/api',
      }),
    ).resolves.toEqual(githubRepository);
    await expect(
      controller.updateById(userProfile, 4, {name: 'backend'}),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById(userProfile, 4, {
        workspaceId: 3,
        githubRepoId: 100,
        name: 'backend',
        fullName: 'team/backend',
      }),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteById(userProfile, 4),
    ).resolves.toBeUndefined();

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        and: [{name: 'api'}, {workspaceId: {inq: [3]}}],
      },
    });
    expect(repository.deleteCascade).toHaveBeenCalledWith(4);
  });

  it('covers news feed expertise association scoping and workspace checks', async () => {
    const assoc = new NewsFeedEntryExpertiseAssoc({
      id: 19,
      newsFeedEntryId: 21,
      expertiseId: 12,
    });
    const assocRepository = {
      find: vi.fn().mockResolvedValue([assoc]),
      count: vi.fn().mockResolvedValue({count: 1}),
      findById: vi.fn().mockResolvedValue({
        ...assoc,
        expertise: {id: 12},
      }),
      create: vi.fn().mockResolvedValue(assoc),
      updateById: vi.fn().mockResolvedValue(undefined),
      replaceById: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    const entryRepository = {
      find: vi
        .fn()
        .mockResolvedValue([new NewsFeedEntry({id: 21, workspaceId: 3})]),
      findById: vi
        .fn()
        .mockResolvedValue(new NewsFeedEntry({id: 21, workspaceId: 3})),
    };
    const expertiseRepository = {
      findById: vi
        .fn()
        .mockResolvedValue(new Expertise({id: 12, workspaceId: 3})),
    };
    const authorization = createAuthorization();
    const controller = new NewsFeedEntryExpertiseAssocController(
      assocRepository as never,
      entryRepository as never,
      expertiseRepository as never,
      authorization as never,
    );

    await expect(
      controller.find(userProfile, {where: {expertiseId: 12}}),
    ).resolves.toEqual([assoc]);
    await expect(
      controller.count(userProfile, {expertiseId: 12}),
    ).resolves.toEqual({count: 1});
    await expect(controller.findById(userProfile, 19)).resolves.toMatchObject({
      id: 19,
    });
    await expect(
      controller.getRelation(userProfile, 19, 'expertise'),
    ).resolves.toEqual({id: 12});
    await expect(
      controller.create(userProfile, {newsFeedEntryId: 21, expertiseId: 12}),
    ).resolves.toEqual(assoc);
    await expect(
      controller.updateById(userProfile, 19, {expertiseId: 12}),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById(userProfile, 19, {
        newsFeedEntryId: 21,
        expertiseId: 12,
      }),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteById(userProfile, 19),
    ).resolves.toBeUndefined();

    expect(assocRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{expertiseId: 12}, {newsFeedEntryId: {inq: [21]}}],
      },
    });
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      7,
    );
  });
});
