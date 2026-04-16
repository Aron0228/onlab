import {juggler, model, property} from '@loopback/repository';
import {describe, expect, it, vi} from 'vitest';

import {AIPredictable} from '../../../models';
import {NewsFeedAwareCrudRepository} from '../../../repositories';

@model({
  settings: {
    newsFeedPredictable: {
      enabled: true,
      sourceType: 'github-issue',
    },
  },
})
class PredictableEntity extends AIPredictable {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @property({
    type: 'string',
  })
  title?: string;

  @property({
    type: 'number',
  })
  workspaceId?: number;
}

@model()
class PlainEntity extends AIPredictable {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;
}

class PredictableRepository extends NewsFeedAwareCrudRepository<
  PredictableEntity,
  typeof PredictableEntity.prototype.id
> {
  public shouldCreate = true;
  public shouldUpdate = true;
  public workspaceId: number | null = 7;
  public delayMs = 250;

  protected async resolveNewsFeedWorkspaceId(): Promise<number | null> {
    return this.workspaceId;
  }

  protected async buildNewsFeedPredictionSnapshot({
    current,
  }: {
    eventAction: 'created' | 'updated';
    previous?: PredictableEntity;
    current: PredictableEntity;
  }) {
    return {
      title: current.title ?? 'Untitled',
      summary: 'Snapshot summary',
    };
  }

  protected override async shouldEnqueueNewsFeedCreate(): Promise<boolean> {
    return this.shouldCreate;
  }

  protected override async shouldEnqueueNewsFeedUpdate(): Promise<boolean> {
    return this.shouldUpdate;
  }

  protected override getNewsFeedDelayMs(): number {
    return this.delayMs;
  }
}

class PlainRepository extends NewsFeedAwareCrudRepository<
  PlainEntity,
  typeof PlainEntity.prototype.id
> {
  protected async resolveNewsFeedWorkspaceId(): Promise<number | null> {
    return 7;
  }

  protected async buildNewsFeedPredictionSnapshot() {
    return {
      title: 'Ignored',
      summary: 'Ignored',
    };
  }
}

describe('NewsFeedAwareCrudRepository (unit)', () => {
  const dataSource = new juggler.DataSource({
    name: 'db',
    connector: 'memory',
  });

  const buildPredictableEntity = (data: Partial<PredictableEntity> = {}) => {
    const entity = new PredictableEntity();
    Object.assign(entity, data);
    return entity;
  };

  it('enqueues a created event for predictable models', async () => {
    const queueService = {
      enqueueNewsFeedPrediction: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new PredictableRepository(
      PredictableEntity,
      dataSource,
      queueService as never,
    );

    const entity = await repository.create(
      buildPredictableEntity({
        title: 'Created title',
        workspaceId: 7,
      }) as never,
    );

    expect(queueService.enqueueNewsFeedPrediction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 7,
        sourceType: 'github-issue',
        sourceId: entity.id,
        eventAction: 'created',
        snapshot: {
          title: 'Created title',
          summary: 'Snapshot summary',
        },
      }),
      {delay: 250},
    );
  });

  it('suppresses queueing inside withoutNewsFeed', async () => {
    const queueService = {
      enqueueNewsFeedPrediction: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new PredictableRepository(
      PredictableEntity,
      dataSource,
      queueService as never,
    );

    await repository.withoutNewsFeed(() =>
      repository.create(
        buildPredictableEntity({
          title: 'Suppressed',
          workspaceId: 7,
        }) as never,
      ),
    );

    expect(queueService.enqueueNewsFeedPrediction).not.toHaveBeenCalled();
  });

  it('does not enqueue when the model metadata is not news-feed predictable', async () => {
    const queueService = {
      enqueueNewsFeedPrediction: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new PlainRepository(
      PlainEntity,
      dataSource,
      queueService as never,
    );

    await repository.create(new PlainEntity() as never);

    expect(queueService.enqueueNewsFeedPrediction).not.toHaveBeenCalled();
  });

  it('only enqueues updates when the subclass marks them as meaningful', async () => {
    const queueService = {
      enqueueNewsFeedPrediction: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new PredictableRepository(
      PredictableEntity,
      dataSource,
      queueService as never,
    );
    const entity = await repository.create(
      buildPredictableEntity({
        title: 'Before',
        workspaceId: 7,
      }) as never,
    );
    queueService.enqueueNewsFeedPrediction.mockClear();

    repository.shouldUpdate = false;
    await repository.updateById(entity.id, {title: 'Ignored'} as never);
    expect(queueService.enqueueNewsFeedPrediction).not.toHaveBeenCalled();

    repository.shouldUpdate = true;
    await repository.replaceById(
      entity.id,
      buildPredictableEntity({
        id: entity.id,
        title: 'After',
        workspaceId: 7,
      }) as never,
    );

    expect(queueService.enqueueNewsFeedPrediction).toHaveBeenCalledOnce();
    expect(queueService.enqueueNewsFeedPrediction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventAction: 'updated',
        sourceId: entity.id,
      }),
      {delay: 250},
    );
  });

  it('skips queueing when create should be ignored or no workspace can be resolved', async () => {
    const queueService = {
      enqueueNewsFeedPrediction: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new PredictableRepository(
      PredictableEntity,
      dataSource,
      queueService as never,
    );

    repository.shouldCreate = false;
    await repository.create(
      buildPredictableEntity({
        title: 'No enqueue',
        workspaceId: 7,
      }) as never,
    );

    repository.shouldCreate = true;
    repository.workspaceId = null;
    await repository.create(
      buildPredictableEntity({
        title: 'Still no enqueue',
        workspaceId: 7,
      }) as never,
    );

    expect(queueService.enqueueNewsFeedPrediction).not.toHaveBeenCalled();
  });
});
