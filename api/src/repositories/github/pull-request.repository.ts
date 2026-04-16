import {Getter, inject, service} from '@loopback/core';
import {
  BelongsToAccessor,
  DataObject,
  InclusionResolver,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  AIPrediction,
  GithubPullRequest,
  GithubPullRequestRelations,
  GithubRepository,
  User,
} from '../../models';
import {
  createAIPredictionInclusionResolver,
  registerInclusionResolvers,
} from '../../utils';
import {UserRepository} from '../auth';
import {QueueService} from '../../services/queue.service';
import {AIPredictionRepository, NewsFeedAwareCrudRepository} from '../system';
import {GithubRepositoryRepository} from './repository.repository';

export class GithubPullRequestRepository extends NewsFeedAwareCrudRepository<
  GithubPullRequest,
  typeof GithubPullRequest.prototype.id,
  GithubPullRequestRelations
> {
  public readonly repository: BelongsToAccessor<
    GithubRepository,
    typeof GithubPullRequest.prototype.id
  >;
  public readonly author: BelongsToAccessor<
    User,
    typeof GithubPullRequest.prototype.id
  >;
  public readonly aiPrediction: {
    inclusionResolver: InclusionResolver<GithubPullRequest, AIPrediction>;
  };

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @service(QueueService) queueService: QueueService,
    @repository.getter('GithubRepositoryRepository')
    githubRepositoryGetter: Getter<GithubRepositoryRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('AIPredictionRepository')
    aiPredictionRepositoryGetter: Getter<AIPredictionRepository>,
  ) {
    super(GithubPullRequest, dataSource, queueService);

    this.repository = this.createBelongsToAccessorFor(
      'repository',
      githubRepositoryGetter,
    );
    this.author = this.createBelongsToAccessorFor(
      'author',
      userRepositoryGetter,
    );
    this.aiPrediction = {
      inclusionResolver: createAIPredictionInclusionResolver(
        'github-pull-request',
        'pull-request-merge-risk',
        aiPredictionRepositoryGetter,
      ),
    };

    registerInclusionResolvers(GithubPullRequest, this);
  }

  protected async resolveNewsFeedWorkspaceId(
    entity: GithubPullRequest,
  ): Promise<number | null> {
    const repository = await this.repository(entity.id);
    return repository.workspaceId;
  }

  protected async buildNewsFeedPredictionSnapshot({
    eventAction,
    previous,
    current,
  }: {
    eventAction: 'created' | 'updated';
    previous?: GithubPullRequest;
    current: GithubPullRequest;
  }) {
    const repository = await this.repository(current.id);

    return {
      title: current.title,
      summary:
        eventAction === 'updated'
          ? summarizePullRequestChanges(previous, current)
          : current.description?.trim() || 'No description was provided.',
      sourceDisplayNumber: `#${current.githubPrNumber}`,
      repositoryName: repository.fullName,
    };
  }

  protected async shouldEnqueueNewsFeedUpdate(
    previous: GithubPullRequest,
    current: GithubPullRequest,
    patch: DataObject<GithubPullRequest>,
  ): Promise<boolean> {
    void patch;
    return (
      previous.title !== current.title ||
      (previous.description ?? '') !== (current.description ?? '') ||
      previous.status !== current.status
    );
  }

  protected override getNewsFeedDelayMs(): number {
    return 2_000;
  }
}

function summarizePullRequestChanges(
  previous: GithubPullRequest | undefined,
  current: GithubPullRequest,
): string {
  if (!previous) {
    return current.description?.trim() || 'Pull request updated.';
  }

  const changes: string[] = [];

  if (previous.title !== current.title) {
    changes.push(`Title changed to "${current.title}".`);
  }

  if (previous.status !== current.status) {
    changes.push(
      `Status changed from ${previous.status.toUpperCase()} to ${current.status.toUpperCase()}.`,
    );
  }

  const previousDescription = previous.description?.trim() || '';
  const currentDescription = current.description?.trim() || '';

  if (previousDescription !== currentDescription) {
    if (!previousDescription && currentDescription) {
      changes.push('Description was added.');
    } else if (previousDescription && !currentDescription) {
      changes.push('Description was removed.');
    } else {
      changes.push('Description was updated.');
    }
  }

  return changes.join(' ') || 'Pull request updated.';
}
