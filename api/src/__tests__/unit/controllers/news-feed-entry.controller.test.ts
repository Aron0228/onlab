import {beforeEach, describe, expect, it, vi} from 'vitest';

import {NewsFeedEntryController} from '../../../controllers';
import {NewsFeedEntry} from '../../../models';
import {describeCrudController} from './test-helpers';

describe('NewsFeedEntryController (unit)', () => {
  describeCrudController({
    controllerName: 'NewsFeedEntryController',
    createController: repository =>
      new NewsFeedEntryController(
        repository as never,
        {
          getAuthenticatedUserId: vi.fn().mockReturnValue(9),
          assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
        } as never,
      ),
    id: 14,
    filter: {where: {workspaceId: 3}},
    where: {workspaceId: 3},
    entityFactory: () =>
      new NewsFeedEntry({
        id: 14,
        workspaceId: 3,
        sourceType: 'github-issue',
        sourceId: 21,
        eventAction: 'created',
        title: 'Broken auth',
        summary: 'Broken auth',
        happenedAt: '2026-04-16T09:00:00.000Z',
      }),
    createPayloadFactory: () => ({
      workspaceId: 3,
      sourceType: 'github-issue',
      sourceId: 21,
      eventAction: 'created',
      title: 'Broken auth',
      summary: 'Broken auth',
      happenedAt: '2026-04-16T09:00:00.000Z',
    }),
    updatePayloadFactory: () => ({
      summary: 'Updated summary',
    }),
    relationName: 'expertiseAssocs',
    relationValueFactory: () => [{id: 5, expertiseId: 6}],
  });

  let repository: {
    findPersonalizedFeed: ReturnType<typeof vi.fn>;
  };
  let authorization: {
    getAuthenticatedUserId: ReturnType<typeof vi.fn>;
    assertWorkspaceMember: ReturnType<typeof vi.fn>;
  };
  let controller: NewsFeedEntryController;

  beforeEach(() => {
    repository = {
      findPersonalizedFeed: vi.fn(),
    };
    authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(9),
      assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
    };
    controller = new NewsFeedEntryController(
      repository as never,
      authorization as never,
    );
  });

  it('returns the personalized feed for a workspace and user', async () => {
    const entries = [
      new NewsFeedEntry({
        id: 20,
        workspaceId: 3,
        sourceType: 'github-pull-request',
        sourceId: 31,
        eventAction: 'updated',
        title: 'PR updated',
        summary: 'PR updated',
        happenedAt: '2026-04-16T09:00:00.000Z',
      }),
    ];
    repository.findPersonalizedFeed.mockResolvedValue(entries);

    await expect(controller.feed({id: 9} as never, 3)).resolves.toEqual(
      entries,
    );
    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 9);
    expect(repository.findPersonalizedFeed).toHaveBeenCalledWith(3, 9);
  });
});
