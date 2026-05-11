import {HttpErrors} from '@loopback/rest';
import {describe, expect, it, vi} from 'vitest';

import {AuthorizationController} from '../../../controllers/system/authorization.controller';
import {WORKSPACE_PERMISSION, WORKSPACE_ROLE} from '../../../constants';
import {GithubIssueController} from '../../../controllers/github/issue.controller';
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
});
