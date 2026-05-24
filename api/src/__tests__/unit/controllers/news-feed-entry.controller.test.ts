import {beforeEach, describe, expect, it, vi} from 'vitest';
import {HttpErrors} from '@loopback/rest';

import {NewsFeedEntryController} from '../../../controllers';
import {NewsFeedEntry} from '../../../models';

describe('NewsFeedEntryController (unit)', () => {
  let repository: {
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    replaceById: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
    findPersonalizedFeed: ReturnType<typeof vi.fn>;
    findWorkspaceFeed: ReturnType<typeof vi.fn>;
  };
  let authorization: {
    getAuthenticatedUserId: ReturnType<typeof vi.fn>;
    accessibleWorkspaceIds: ReturnType<typeof vi.fn>;
    assertWorkspaceMember: ReturnType<typeof vi.fn>;
    assertWorkspaceAdminOrOwner: ReturnType<typeof vi.fn>;
  };
  let controller: NewsFeedEntryController;

  beforeEach(() => {
    repository = {
      find: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
      replaceById: vi.fn(),
      deleteById: vi.fn(),
      findPersonalizedFeed: vi.fn(),
      findWorkspaceFeed: vi.fn(),
    };
    authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(9),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([3, 4]),
      assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
      assertWorkspaceAdminOrOwner: vi.fn().mockResolvedValue('ADMIN'),
    };
    controller = new NewsFeedEntryController(
      repository as never,
      authorization as never,
    );
  });

  const entry = new NewsFeedEntry({
    id: 20,
    workspaceId: 3,
    sourceType: 'github-pull-request',
    sourceId: 31,
    eventAction: 'updated',
    title: 'PR updated',
    summary: 'PR updated',
    happenedAt: '2026-04-16T09:00:00.000Z',
  });

  it('scopes list queries to accessible workspaces', async () => {
    repository.find.mockResolvedValue([entry]);

    await expect(
      controller.find({id: 9} as never, {where: {workspaceId: 999}}),
    ).resolves.toEqual([entry]);

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        and: [{workspaceId: 999}, {workspaceId: {inq: [3, 4]}}],
      },
    });
  });

  it('scopes count queries to accessible workspaces', async () => {
    repository.count.mockResolvedValue({count: 1});

    await expect(
      controller.count({id: 9} as never, {workspaceId: 999}),
    ).resolves.toEqual({count: 1});

    expect(repository.count).toHaveBeenCalledWith({
      and: [{workspaceId: 999}, {workspaceId: {inq: [3, 4]}}],
    });
  });

  it('returns the personalized feed for the authenticated user', async () => {
    repository.findPersonalizedFeed.mockResolvedValue([entry]);

    await expect(controller.feed({id: 9} as never, 3)).resolves.toEqual([
      entry,
    ]);

    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 9);
    expect(repository.findPersonalizedFeed).toHaveBeenCalledWith(3, 9);
  });

  it('paginates personalized feed results', async () => {
    const entries = [
      entry,
      new NewsFeedEntry({
        ...entry,
        id: 21,
        title: 'Second update',
      }),
      new NewsFeedEntry({
        ...entry,
        id: 22,
        title: 'Third update',
      }),
    ];
    repository.findPersonalizedFeed.mockResolvedValue(entries);

    await expect(controller.feed({id: 9} as never, 3, 1, 1)).resolves.toEqual([
      entries[1],
    ]);
  });

  it('returns the full workspace feed when personalization is disabled', async () => {
    repository.findWorkspaceFeed.mockResolvedValue([entry]);

    await expect(
      controller.feed({id: 9} as never, 3, undefined, undefined, false),
    ).resolves.toEqual([entry]);

    expect(repository.findWorkspaceFeed).toHaveBeenCalledWith(3);
    expect(repository.findPersonalizedFeed).not.toHaveBeenCalled();
  });

  it('derives the feed user from the authenticated session', async () => {
    authorization.getAuthenticatedUserId.mockReturnValueOnce(42);
    repository.findPersonalizedFeed.mockResolvedValue([entry]);

    await expect(controller.feed({id: 42} as never, 3)).resolves.toEqual([
      entry,
    ]);

    expect(authorization.getAuthenticatedUserId).toHaveBeenCalledWith({
      id: 42,
    });
    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 42);
    expect(repository.findPersonalizedFeed).toHaveBeenCalledWith(3, 42);
    expect(repository.findPersonalizedFeed).not.toHaveBeenCalledWith(3, 9);
  });

  it('does not load personalized feed entries for non-members', async () => {
    authorization.assertWorkspaceMember.mockRejectedValueOnce(
      new HttpErrors.Forbidden('You are not a member of this workspace.'),
    );

    await expect(controller.feed({id: 9} as never, 3)).rejects.toBeInstanceOf(
      HttpErrors.Forbidden,
    );

    expect(repository.findPersonalizedFeed).not.toHaveBeenCalled();
  });

  it('requires workspace membership before returning a single entry', async () => {
    repository.findById.mockResolvedValue(entry);

    await expect(controller.findById({id: 9} as never, 20)).resolves.toEqual(
      entry,
    );

    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 9);
  });

  it('requires admin or owner permission before creating entries', async () => {
    repository.create.mockResolvedValue(entry);

    await expect(
      controller.create({id: 9} as never, {
        workspaceId: 3,
        sourceType: 'github-issue',
        sourceId: 21,
        eventAction: 'created',
        title: 'Broken auth',
        summary: 'Broken auth',
        happenedAt: '2026-04-16T09:00:00.000Z',
      }),
    ).resolves.toEqual(entry);

    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      9,
    );
    expect(repository.create).toHaveBeenCalled();
  });

  it('requires admin or owner permission before updating entries', async () => {
    repository.findById.mockResolvedValue(entry);
    repository.updateById.mockResolvedValue(undefined);

    await expect(
      controller.updateById({id: 9} as never, 20, {summary: 'Updated'}),
    ).resolves.toBeUndefined();

    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      9,
    );
    expect(repository.updateById).toHaveBeenCalledWith(20, {
      summary: 'Updated',
    });
  });

  it('requires admin or owner permission before deleting entries', async () => {
    repository.findById.mockResolvedValue(entry);
    repository.deleteById.mockResolvedValue(undefined);

    await expect(
      controller.deleteById({id: 9} as never, 20),
    ).resolves.toBeUndefined();

    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      9,
    );
    expect(repository.deleteById).toHaveBeenCalledWith(20);
  });
});
