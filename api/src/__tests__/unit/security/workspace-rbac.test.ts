import {HttpErrors} from '@loopback/rest';
import {describe, expect, it, vi} from 'vitest';

import {AuthorizationController} from '../../../controllers/system/authorization.controller';
import {WORKSPACE_PERMISSION, WORKSPACE_ROLE} from '../../../constants';
import {FileController} from '../../../controllers/system/file.controller';
import {GithubIssueController} from '../../../controllers/github/issue.controller';
import {NewsFeedEntryController} from '../../../controllers/system/news-feed-entry.controller';
import {NewsFeedEntryExpertiseAssocController} from '../../../controllers/system/news-feed-entry-expertise-assoc.controller';
import {UserController} from '../../../controllers/auth/user.controller';
import {WorkspaceAuthorizationService} from '../../../services';

describe('Workspace RBAC security contract (unit)', () => {
  const createAuthorizationService = () => {
    const workspaceRepository = {
      findById: vi.fn(),
      find: vi.fn(),
    };
    const workspaceMemberRepository = {
      findOne: vi.fn(),
      find: vi.fn(),
    };

    return {
      workspaceRepository,
      workspaceMemberRepository,
      service: new WorkspaceAuthorizationService(
        workspaceRepository as never,
        workspaceMemberRepository as never,
      ),
    };
  };

  it('denies outsiders from route permission checks', async () => {
    const {service, workspaceRepository, workspaceMemberRepository} =
      createAuthorizationService();
    workspaceRepository.findById.mockResolvedValue({id: 4, ownerId: 1});
    workspaceMemberRepository.findOne.mockResolvedValue(null);
    const controller = new AuthorizationController(service);

    await expect(
      controller.check({id: 99} as never, {
        workspaceId: 4,
        permission: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
      }),
    ).resolves.toEqual({
      allowed: false,
      permission: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
      workspaceId: 4,
      role: null,
    });
  });

  it('allows members to view workspaces but not manage protected settings', async () => {
    const {service, workspaceRepository, workspaceMemberRepository} =
      createAuthorizationService();
    workspaceRepository.findById.mockResolvedValue({id: 4, ownerId: 1});
    workspaceMemberRepository.findOne.mockResolvedValue({
      workspaceId: 4,
      userId: 12,
      role: 'MEMBER',
    });

    await expect(
      service.checkPermission(4, 12, WORKSPACE_PERMISSION.WORKSPACE_VIEW),
    ).resolves.toMatchObject({
      allowed: true,
      role: WORKSPACE_ROLE.MEMBER,
    });
    await expect(
      service.checkPermission(
        4,
        12,
        WORKSPACE_PERMISSION.WORKSPACE_SETTINGS_MANAGE,
      ),
    ).resolves.toMatchObject({
      allowed: false,
      role: WORKSPACE_ROLE.MEMBER,
    });
  });

  it('keeps GitHub issue queries scoped to accessible repository ids', async () => {
    const issueRepository = {
      find: vi.fn().mockResolvedValue([]),
    };
    const repositoryRepository = {
      find: vi.fn().mockResolvedValue([{id: 10, workspaceId: 4}]),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(12),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([4]),
    };
    const controller = new GithubIssueController(
      issueRepository as never,
      repositoryRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      authorization as never,
    );

    await controller.find({id: 12} as never, {
      where: {
        repositoryId: 999,
      },
    });

    expect(issueRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{repositoryId: 999}, {repositoryId: {inq: [10]}}],
      },
    });
  });

  it('throws 403 when an outsider assertion reaches an API mutation', async () => {
    const {service, workspaceRepository, workspaceMemberRepository} =
      createAuthorizationService();
    workspaceRepository.findById.mockResolvedValue({id: 4, ownerId: 1});
    workspaceMemberRepository.findOne.mockResolvedValue(null);

    await expect(
      service.assertWorkspaceAdminOrOwner(4, 99),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);
  });

  it('keeps user lookups scoped to self and shared workspace members', async () => {
    const userRepository = {
      find: vi.fn().mockResolvedValue([]),
    };
    const workspaceRepository = {
      find: vi.fn().mockResolvedValue([{id: 4, ownerId: 12}]),
    };
    const workspaceMemberRepository = {
      find: vi.fn().mockResolvedValue([{workspaceId: 4, userId: 14}]),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(12),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([4]),
    };
    const controller = new UserController(
      userRepository as never,
      workspaceRepository as never,
      workspaceMemberRepository as never,
      authorization as never,
    );

    await controller.find({id: 12} as never, {where: {id: 99}});

    expect(userRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{id: 99}, {id: {inq: [12, 14]}}],
      },
    });
  });

  it('checks workspace membership before serving file previews', async () => {
    const fileRepository = {
      findById: vi.fn().mockResolvedValue({id: 22, workspaceId: 4}),
      preview: vi.fn().mockResolvedValue({}),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(12),
      accessibleWorkspaceIds: vi.fn(),
      assertWorkspaceMember: vi
        .fn()
        .mockRejectedValue(new HttpErrors.Forbidden()),
    };
    const controller = new FileController(
      fileRepository as never,
      authorization as never,
      {record: vi.fn()} as never,
    );

    await expect(
      controller.preview({id: 12} as never, 22, {} as never),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);
    expect(fileRepository.preview).not.toHaveBeenCalled();
  });

  it('scopes news feed expertise associations through accessible entries', async () => {
    const assocRepository = {
      find: vi.fn().mockResolvedValue([]),
    };
    const entryRepository = {
      find: vi.fn().mockResolvedValue([{id: 31, workspaceId: 4}]),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(12),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([4]),
    };
    const controller = new NewsFeedEntryExpertiseAssocController(
      assocRepository as never,
      entryRepository as never,
      {} as never,
      authorization as never,
    );

    await controller.find({id: 12} as never, {where: {expertiseId: 99}});

    expect(assocRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{expertiseId: 99}, {newsFeedEntryId: {inq: [31]}}],
      },
    });
  });

  it('keeps news feed entries scoped to accessible workspaces', async () => {
    const newsFeedEntryRepository = {
      find: vi.fn().mockResolvedValue([]),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(12),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([4]),
    };
    const controller = new NewsFeedEntryController(
      newsFeedEntryRepository as never,
      authorization as never,
    );

    await controller.find({id: 12} as never, {where: {workspaceId: 999}});

    expect(newsFeedEntryRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{workspaceId: 999}, {workspaceId: {inq: [4]}}],
      },
    });
  });
});
