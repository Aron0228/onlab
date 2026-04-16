import {Getter, inject, service} from '@loopback/core';
import {
  BelongsToAccessor,
  DataObject,
  HasManyRepositoryFactory,
  InclusionResolver,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  AIPrediction,
  GithubIssue,
  GithubIssueRelations,
  GithubRepository,
  IssueAssignment,
} from '../../models';
import {
  createAIPredictionInclusionResolver,
  registerInclusionResolvers,
} from '../../utils';
import {QueueService} from '../../services/queue.service';
import {IssueAssignmentRepository} from '../planning';
import {AIPredictionRepository, NewsFeedAwareCrudRepository} from '../system';
import {GithubRepositoryRepository} from './repository.repository';

export class GithubIssueRepository extends NewsFeedAwareCrudRepository<
  GithubIssue,
  typeof GithubIssue.prototype.id,
  GithubIssueRelations
> {
  public readonly repository: BelongsToAccessor<
    GithubRepository,
    typeof GithubIssue.prototype.id
  >;
  public readonly aiPrediction: {
    inclusionResolver: InclusionResolver<GithubIssue, AIPrediction>;
  };
  public readonly issueAssignments: HasManyRepositoryFactory<
    IssueAssignment,
    typeof GithubIssue.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @service(QueueService) queueService: QueueService,
    @repository.getter('GithubRepositoryRepository')
    githubRepositoryGetter: Getter<GithubRepositoryRepository>,
    @repository.getter('AIPredictionRepository')
    aiPredictionRepositoryGetter: Getter<AIPredictionRepository>,
    @repository.getter('IssueAssignmentRepository')
    issueAssignmentRepositoryGetter: Getter<IssueAssignmentRepository>,
  ) {
    super(GithubIssue, dataSource, queueService);

    this.repository = this.createBelongsToAccessorFor(
      'repository',
      githubRepositoryGetter,
    );
    this.aiPrediction = {
      inclusionResolver: createAIPredictionInclusionResolver(
        'github-issue',
        'issue-priority',
        aiPredictionRepositoryGetter,
      ),
    };
    this.issueAssignments = this.createHasManyRepositoryFactoryFor(
      'issueAssignments',
      issueAssignmentRepositoryGetter,
    );

    registerInclusionResolvers(GithubIssue, this);
  }

  protected async resolveNewsFeedWorkspaceId(
    entity: GithubIssue,
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
    previous?: GithubIssue;
    current: GithubIssue;
  }) {
    const repository = await this.repository(current.id);

    return {
      title: current.title,
      summary:
        eventAction === 'updated'
          ? summarizeIssueChanges(previous, current)
          : current.description?.trim() || 'No description was provided.',
      sourceDisplayNumber: `#${current.githubIssueNumber}`,
      repositoryName: repository.fullName,
    };
  }

  protected async shouldEnqueueNewsFeedUpdate(
    previous: GithubIssue,
    current: GithubIssue,
    patch: DataObject<GithubIssue>,
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

function summarizeIssueChanges(
  previous: GithubIssue | undefined,
  current: GithubIssue,
): string {
  if (!previous) {
    return current.description?.trim() || 'Issue updated.';
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

  return changes.join(' ') || 'Issue updated.';
}
