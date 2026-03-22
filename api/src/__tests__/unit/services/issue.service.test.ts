import {beforeEach, describe, expect, it, vi} from 'vitest';

import {IssueService} from '../../../services';

describe('IssueService (unit)', () => {
  let githubIssueRepository: {
    deleteAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    createAll: ReturnType<typeof vi.fn>;
  };
  let service: IssueService;

  beforeEach(() => {
    githubIssueRepository = {
      deleteAll: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
      updateById: vi.fn().mockResolvedValue(undefined),
      createAll: vi.fn().mockResolvedValue(undefined),
    };

    service = new IssueService(githubIssueRepository as never);
  });

  it('creates an issue when upsert does not find an existing row', async () => {
    githubIssueRepository.findOne.mockResolvedValue(null);

    await service.upsertIssue(
      {
        repositoryId: 1,
        githubId: 2,
        githubIssueNumber: 12,
        title: 'Broken',
        status: 'open',
        description: 'Needs attention',
      },
      {repositoryId: 1, githubId: 2},
    );

    expect(githubIssueRepository.create).toHaveBeenCalledWith({
      repositoryId: 1,
      githubId: 2,
      githubIssueNumber: 12,
      title: 'Broken',
      status: 'open',
      description: 'Needs attention',
    });
    expect(githubIssueRepository.updateById).not.toHaveBeenCalled();
  });

  it('updates an issue when upsert finds an existing row', async () => {
    githubIssueRepository.findOne.mockResolvedValue({id: 9});

    await service.upsertIssue(
      {
        repositoryId: 1,
        githubId: 2,
        githubIssueNumber: 12,
        title: 'Broken',
        status: 'closed',
        description: 'Fixed',
      },
      {repositoryId: 1, githubId: 2},
    );

    expect(githubIssueRepository.updateById).toHaveBeenCalledWith(9, {
      repositoryId: 1,
      githubId: 2,
      githubIssueNumber: 12,
      title: 'Broken',
      status: 'closed',
      description: 'Fixed',
    });
    expect(githubIssueRepository.create).not.toHaveBeenCalled();
  });

  it('deletes a single issue by where clause', async () => {
    await service.deleteOne({repositoryId: 1, githubId: 2});

    expect(githubIssueRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 1,
      githubId: 2,
    });
  });

  it('saves issues in batches of 100', async () => {
    const issues = Array.from({length: 205}, (_, index) => ({
      repositoryId: 1,
      githubId: index + 1,
      githubIssueNumber: index + 1,
      title: `Issue ${index + 1}`,
      status: 'open',
      description: '',
    }));

    await service.saveIssuesBulk(issues);

    expect(githubIssueRepository.createAll).toHaveBeenCalledTimes(3);
    expect(githubIssueRepository.createAll).toHaveBeenNthCalledWith(
      1,
      issues.slice(0, 100),
    );
    expect(githubIssueRepository.createAll).toHaveBeenNthCalledWith(
      2,
      issues.slice(100, 200),
    );
    expect(githubIssueRepository.createAll).toHaveBeenNthCalledWith(
      3,
      issues.slice(200, 205),
    );
  });
});
