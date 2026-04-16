import {ValueOrPromise} from '@loopback/core';
import {
  DataObject,
  DefaultCrudRepository,
  Entity,
  juggler,
  ModelDefinition,
  ModelMetadataHelper,
  Options,
} from '@loopback/repository';
import {NewsFeedEventAction, NewsFeedPredictableSettings} from '../../models';
import {
  NewsFeedPredictionJobSnapshot,
  QueueService,
} from '../../services/queue.service';

type BuildNewsFeedPredictionSnapshotContext<T extends Entity> = {
  eventAction: NewsFeedEventAction;
  previous?: T;
  current: T;
  patch?: DataObject<T>;
};

export abstract class NewsFeedAwareCrudRepository<
  T extends Entity,
  ID,
  Relations extends object = object,
> extends DefaultCrudRepository<T, ID, Relations> {
  private newsFeedSuppressionDepth = 0;

  constructor(
    entityClass: typeof Entity & {prototype: T},
    dataSource: juggler.DataSource,
    protected queueService: QueueService,
  ) {
    super(entityClass, dataSource);
  }

  public async withoutNewsFeed<Result>(
    callback: () => ValueOrPromise<Result>,
  ): Promise<Result> {
    this.newsFeedSuppressionDepth += 1;

    try {
      return await callback();
    } finally {
      this.newsFeedSuppressionDepth -= 1;
    }
  }

  public override async create(
    data: DataObject<T>,
    options?: Options,
  ): Promise<T> {
    const entity = await super.create(data, options);
    await this.enqueueNewsFeedEvent({
      current: entity,
      eventAction: 'created',
    });
    return entity;
  }

  public override async createAll(
    dataObjects: DataObject<T>[],
    options?: Options,
  ): Promise<T[]> {
    const entities = await super.createAll(dataObjects, options);

    for (const entity of entities) {
      await this.enqueueNewsFeedEvent({
        current: entity,
        eventAction: 'created',
      });
    }

    return entities;
  }

  public override async updateById(
    id: ID,
    data: DataObject<T>,
    options?: Options,
  ): Promise<void> {
    const previous = await this.findById(id);
    await super.updateById(id, data, options);
    const current = await this.findById(id);

    if (await this.shouldEnqueueNewsFeedUpdate(previous, current, data)) {
      await this.enqueueNewsFeedEvent({
        previous,
        current,
        patch: data,
        eventAction: 'updated',
      });
    }
  }

  public override async replaceById(
    id: ID,
    data: DataObject<T>,
    options?: Options,
  ): Promise<void> {
    const previous = await this.findById(id);
    await super.replaceById(id, data, options);
    const current = await this.findById(id);

    if (await this.shouldEnqueueNewsFeedUpdate(previous, current, data)) {
      await this.enqueueNewsFeedEvent({
        previous,
        current,
        patch: data,
        eventAction: 'updated',
      });
    }
  }

  protected async shouldEnqueueNewsFeedCreate(entity: T): Promise<boolean> {
    void entity;
    return true;
  }

  protected async shouldEnqueueNewsFeedUpdate(
    previous: T,
    current: T,
    patch: DataObject<T>,
  ): Promise<boolean> {
    void previous;
    void current;
    void patch;
    return true;
  }

  protected getNewsFeedDelayMs(
    entity: T,
    eventAction: NewsFeedEventAction,
  ): number {
    void entity;
    void eventAction;
    return 0;
  }

  protected abstract resolveNewsFeedWorkspaceId(
    entity: T,
  ): Promise<number | null>;

  protected abstract buildNewsFeedPredictionSnapshot(
    context: BuildNewsFeedPredictionSnapshotContext<T>,
  ): Promise<NewsFeedPredictionJobSnapshot>;

  private async enqueueNewsFeedEvent(
    context: BuildNewsFeedPredictionSnapshotContext<T>,
  ): Promise<void> {
    if (this.newsFeedSuppressionDepth > 0) {
      return;
    }

    const predictableSettings = this.getNewsFeedPredictableSettings();
    if (!predictableSettings?.enabled) {
      return;
    }

    const shouldEnqueue =
      context.eventAction === 'created'
        ? await this.shouldEnqueueNewsFeedCreate(context.current)
        : true;

    if (!shouldEnqueue) {
      return;
    }

    const workspaceId = await this.resolveNewsFeedWorkspaceId(context.current);
    if (!workspaceId) {
      return;
    }

    const snapshot = await this.buildNewsFeedPredictionSnapshot(context);

    await this.queueService.enqueueNewsFeedPrediction(
      {
        workspaceId,
        sourceType: predictableSettings.sourceType,
        sourceId: Number(context.current.getId()),
        eventAction: context.eventAction,
        happenedAt: new Date().toISOString(),
        snapshot,
      },
      {
        delay: this.getNewsFeedDelayMs(context.current, context.eventAction),
      },
    );
  }

  private getNewsFeedPredictableSettings():
    | NewsFeedPredictableSettings
    | undefined {
    const metadata = ModelMetadataHelper.getModelMetadata(this.entityClass);

    if (!(metadata instanceof ModelDefinition)) {
      return undefined;
    }

    return metadata.settings?.newsFeedPredictable as
      | NewsFeedPredictableSettings
      | undefined;
  }
}
