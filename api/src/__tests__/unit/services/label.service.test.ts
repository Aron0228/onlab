import {beforeEach, describe, expect, it, vi} from 'vitest';

import {LabelService} from '../../../services';

describe('LabelService (unit)', () => {
  let githubLabelRepository: {
    deleteAll: ReturnType<typeof vi.fn>;
    createAll: ReturnType<typeof vi.fn>;
  };
  let service: LabelService;

  beforeEach(() => {
    githubLabelRepository = {
      deleteAll: vi.fn().mockResolvedValue(undefined),
      createAll: vi.fn().mockResolvedValue(undefined),
    };

    service = new LabelService(githubLabelRepository as never);
  });

  it('replaces labels for a repository', async () => {
    const labels = [
      {
        repositoryId: 5,
        githubLabelId: 11,
        name: 'Priority: High',
        color: 'f97316',
      },
    ];

    await service.replaceRepositoryLabels(5, labels);

    expect(githubLabelRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 5,
    });
    expect(githubLabelRepository.createAll).toHaveBeenCalledWith(labels);
  });

  it('does not recreate labels when the replacement list is empty', async () => {
    await service.replaceRepositoryLabels(5, []);

    expect(githubLabelRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 5,
    });
    expect(githubLabelRepository.createAll).not.toHaveBeenCalled();
  });
});
