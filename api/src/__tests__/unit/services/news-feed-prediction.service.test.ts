import {beforeEach, describe, expect, it, vi} from 'vitest';

import {Expertise, NewsFeedEntry} from '../../../models';
import {NewsFeedPredictionService} from '../../../services/news-feed-prediction.service';

describe('NewsFeedPredictionService (unit)', () => {
  let ollamaService: {
    chatJson: ReturnType<typeof vi.fn>;
  };
  let expertiseRepository: {
    find: ReturnType<typeof vi.fn>;
  };
  let workspaceMemberRepository: {
    find: ReturnType<typeof vi.fn>;
  };
  let userExpertiseAssocRepository: {
    find: ReturnType<typeof vi.fn>;
  };
  let aiPredictionRepository: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let newsFeedEntryRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let newsFeedEntryExpertiseAssocRepository: {
    deleteAll: ReturnType<typeof vi.fn>;
    createAll: ReturnType<typeof vi.fn>;
  };
  let service: NewsFeedPredictionService;

  const job = {
    workspaceId: 7,
    sourceType: 'github-pull-request' as const,
    sourceId: 13,
    eventAction: 'updated' as const,
    happenedAt: '2026-04-16T09:00:00.000Z',
    snapshot: {
      title: 'Refactor auth flow',
      summary: 'Status changed from OPEN to MERGED.',
      sourceDisplayNumber: '#88',
      repositoryName: 'team/api',
    },
  };

  beforeEach(() => {
    ollamaService = {
      chatJson: vi.fn(),
    };
    expertiseRepository = {
      find: vi.fn(),
    };
    workspaceMemberRepository = {
      find: vi.fn(),
    };
    userExpertiseAssocRepository = {
      find: vi.fn(),
    };
    aiPredictionRepository = {
      findOne: vi.fn(),
    };
    newsFeedEntryRepository = {
      findOne: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
    };
    newsFeedEntryExpertiseAssocRepository = {
      deleteAll: vi.fn().mockResolvedValue({count: 0}),
      createAll: vi.fn().mockResolvedValue([]),
    };

    service = new NewsFeedPredictionService(
      ollamaService as never,
      expertiseRepository as never,
      workspaceMemberRepository as never,
      userExpertiseAssocRepository as never,
      aiPredictionRepository as never,
      newsFeedEntryRepository as never,
      newsFeedEntryExpertiseAssocRepository as never,
    );
  });

  it('creates a feed entry with normalized expertise matches and copied source priority', async () => {
    expertiseRepository.find.mockResolvedValue([
      new Expertise({id: 1, workspaceId: 7, name: 'Authentication'}),
      new Expertise({id: 2, workspaceId: 7, name: 'Frontend'}),
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        userId: 101,
        role: 'OWNER',
        user: {fullName: 'Alex Thompson'},
      },
    ]);
    userExpertiseAssocRepository.find.mockResolvedValue([
      {
        userId: 101,
        expertiseId: 1,
        expertise: {id: 1, workspaceId: 7, name: 'Authentication'},
      },
    ]);
    ollamaService.chatJson.mockResolvedValue({
      matchedExpertises: [' authentication ', 'AUTHENTICATION', 'Missing'],
      reason: 'Touches a critical auth workflow. ',
    });
    aiPredictionRepository.findOne.mockResolvedValue({
      priority: 'very-high',
    });
    newsFeedEntryRepository.findOne.mockResolvedValue(null);
    newsFeedEntryRepository.create.mockImplementation(
      async write =>
        new NewsFeedEntry({
          id: 55,
          ...write,
        }),
    );

    await service.processPredictionJob(job);

    expect(ollamaService.chatJson).toHaveBeenCalledWith({
      messages: [
        expect.objectContaining({role: 'system'}),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining(
            'Alex Thompson (OWNER) expertises: Authentication',
          ),
        }),
      ],
    });
    expect(newsFeedEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 7,
        sourceType: 'github-pull-request',
        sourceId: 13,
        sourcePriority: 'very-high',
        aiReason: 'Touches a critical auth workflow.',
        sourceDisplayNumber: '#88',
        repositoryName: 'team/api',
      }),
    );
    expect(
      newsFeedEntryExpertiseAssocRepository.deleteAll,
    ).toHaveBeenCalledWith({newsFeedEntryId: 55});
    expect(
      newsFeedEntryExpertiseAssocRepository.createAll,
    ).toHaveBeenCalledWith([{newsFeedEntryId: 55, expertiseId: 1}]);
  });

  it('updates an existing entry and skips assoc creation when there are no matches', async () => {
    expertiseRepository.find.mockResolvedValue([
      new Expertise({id: 1, workspaceId: 7, name: 'Authentication'}),
    ]);
    workspaceMemberRepository.find.mockResolvedValue([]);
    userExpertiseAssocRepository.find.mockResolvedValue([]);
    ollamaService.chatJson.mockResolvedValue({
      matchedExpertises: [],
      reason: 'General update.',
    });
    aiPredictionRepository.findOne.mockResolvedValue({priority: 'medium'});
    newsFeedEntryRepository.findOne.mockResolvedValue({id: 99});
    newsFeedEntryRepository.findById.mockResolvedValue(
      new NewsFeedEntry({
        id: 99,
        workspaceId: 7,
        sourceType: 'github-pull-request',
        sourceId: 13,
        eventAction: 'updated',
        title: 'Refactor auth flow',
        summary: 'Status changed from OPEN to MERGED.',
        happenedAt: job.happenedAt,
      }),
    );

    await service.processPredictionJob(job);

    expect(newsFeedEntryRepository.updateById).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        eventAction: 'updated',
        aiReason: 'General update.',
      }),
    );
    expect(newsFeedEntryRepository.create).not.toHaveBeenCalled();
    expect(
      newsFeedEntryExpertiseAssocRepository.createAll,
    ).not.toHaveBeenCalled();
  });

  it('creates an entry without matches when there are no workspace expertises', async () => {
    expertiseRepository.find.mockResolvedValue([]);
    aiPredictionRepository.findOne.mockResolvedValue(null);
    newsFeedEntryRepository.findOne.mockResolvedValue(null);
    newsFeedEntryRepository.create.mockImplementation(
      async write =>
        new NewsFeedEntry({
          id: 77,
          ...write,
        }),
    );

    await service.processPredictionJob({
      ...job,
      sourceType: 'capacity-plan',
    });

    expect(ollamaService.chatJson).not.toHaveBeenCalled();
    expect(newsFeedEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'capacity-plan',
        sourcePriority: null,
        aiReason: undefined,
      }),
    );
    expect(
      newsFeedEntryExpertiseAssocRepository.createAll,
    ).not.toHaveBeenCalled();
  });

  it('falls back gracefully when the AI prediction fails', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    expertiseRepository.find.mockResolvedValue([
      new Expertise({id: 1, workspaceId: 7, name: 'Authentication'}),
    ]);
    workspaceMemberRepository.find.mockResolvedValue([]);
    userExpertiseAssocRepository.find.mockResolvedValue([]);
    ollamaService.chatJson.mockRejectedValue(new Error('boom'));
    aiPredictionRepository.findOne.mockResolvedValue(null);
    newsFeedEntryRepository.findOne.mockResolvedValue(null);
    newsFeedEntryRepository.create.mockImplementation(
      async write =>
        new NewsFeedEntry({
          id: 66,
          ...write,
        }),
    );

    await service.processPredictionJob({
      ...job,
      sourceType: 'github-issue',
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'News feed prediction failed, creating entry without matches',
      expect.objectContaining({
        sourceType: 'github-issue',
        sourceId: 13,
      }),
    );
    expect(newsFeedEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        aiReason: undefined,
        sourcePriority: null,
      }),
    );

    consoleWarnSpy.mockRestore();
  });
});
