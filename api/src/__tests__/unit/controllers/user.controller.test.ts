import {describe, expect, it, vi} from 'vitest';

import {UserController} from '../../../controllers/auth/user.controller';
import {User} from '../../../models';

describe('UserController (unit)', () => {
  it('scopes users to the current user and shared workspaces', async () => {
    const user = new User({
      id: 8,
      githubId: 2,
      username: 'teammate',
      fullName: 'Team Mate',
      email: 'team@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    });
    const userRepository = {
      find: vi.fn().mockResolvedValue([user]),
      count: vi.fn(),
      findById: vi.fn(),
    };
    const workspaceRepository = {
      find: vi
        .fn()
        .mockResolvedValueOnce([{id: 12, ownerId: 7}])
        .mockResolvedValueOnce([
          {id: 11, ownerId: 9},
          {id: 12, ownerId: 7},
        ]),
    };
    const workspaceMemberRepository = {
      find: vi.fn().mockResolvedValue([
        {workspaceId: 11, userId: 7},
        {workspaceId: 11, userId: 8},
      ]),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([11]),
    };
    const controller = new UserController(
      userRepository as never,
      workspaceRepository as never,
      workspaceMemberRepository as never,
      authorization as never,
    );

    await expect(
      controller.find({id: 7} as never, {where: {username: 'teammate'}}),
    ).resolves.toEqual([user]);
    expect(workspaceRepository.find).toHaveBeenNthCalledWith(2, {
      where: {id: {inq: [11, 12]}},
    });
    expect(userRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{username: 'teammate'}, {id: {inq: [7, 9, 8]}}],
      },
    });
  });

  it('allows reading an owner of an accessible workspace', async () => {
    const owner = new User({
      id: 9,
      githubId: 3,
      username: 'owner',
      fullName: 'Workspace Owner',
      email: 'owner@example.com',
      avatarUrl: 'https://example.com/owner.png',
    });
    const userRepository = {
      find: vi.fn(),
      count: vi.fn(),
      findById: vi.fn().mockResolvedValue(owner),
    };
    const workspaceRepository = {
      find: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{id: 11, ownerId: 9}]),
    };
    const workspaceMemberRepository = {
      find: vi.fn().mockResolvedValue([{workspaceId: 11, userId: 7}]),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([11]),
    };
    const controller = new UserController(
      userRepository as never,
      workspaceRepository as never,
      workspaceMemberRepository as never,
      authorization as never,
    );

    await expect(controller.findById({id: 7} as never, 9)).resolves.toEqual(
      owner,
    );
  });

  it('returns the placeholder delete profile response', async () => {
    const controller = new UserController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(controller.deleteProfile()).resolves.toEqual({
      message: 'Not implemented',
    });
  });
});
