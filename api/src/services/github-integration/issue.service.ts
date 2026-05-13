import {BindingScope, injectable, service} from '@loopback/core';
import {Count, DataObject, repository, Where} from '@loopback/repository';
import {AIPredictionExpertiseRecommendation, GithubIssue} from '../../models';
import {
  GithubIssueRepository,
  GithubRepositoryRepository,
  IssueAssignmentRepository,
} from '../../repositories';
import {AIPredictionService} from '../ai-prediction.service';
import {AuditEventService} from '../audit-event.service';

type IssuePredictionWrite = {
  priority: string;
  reason: string;
  estimatedHours?: number | null;
  estimationConfidence?: 'low' | 'medium' | 'high' | null;
  expertiseRecommendations?: AIPredictionExpertiseRecommendation[] | null;
};

type GithubIssueWrite = {
  issue: DataObject<GithubIssue>;
  prediction: IssuePredictionWrite;
};

@injectable({scope: BindingScope.SINGLETON})
export class IssueService {
  private readonly batchSize = 100;

  constructor(
    @repository(GithubIssueRepository)
    private githubIssueRepository: GithubIssueRepository,
    @repository(IssueAssignmentRepository)
    private issueAssignmentRepository: IssueAssignmentRepository,
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @service(AIPredictionService)
    private aiPredictionService: AIPredictionService,
    @service(AuditEventService)
    private auditEventService: AuditEventService,
  ) {}

  public async deleteByRepositoryId(repositoryId: number): Promise<void> {
    const issues = await this.githubIssueRepository.find({
      where: {repositoryId},
    });
    const issueIds = issues.map(issue => issue.id);
    await this.deleteAssociatedData(issueIds);
    await this.githubIssueRepository.deleteAll({repositoryId});
  }

  public async upsertIssue(
    issue: DataObject<GithubIssue>,
    where: Where<GithubIssue>,
    prediction?: IssuePredictionWrite,
  ): Promise<void> {
    const existingIssue = await this.githubIssueRepository.findOne({where});

    if (!existingIssue) {
      const createdIssue = await this.githubIssueRepository.create(issue);
      await this.recordIssueAudit(createdIssue, 'github.issue.created');
      if (prediction) {
        await this.aiPredictionService.syncPrediction(
          buildAIPredictionWrite(createdIssue.id, prediction),
        );
      }
      return;
    }

    await this.githubIssueRepository.updateById(existingIssue.id, issue);
    await this.recordIssueAudit(
      {...existingIssue, ...issue, id: existingIssue.id} as GithubIssue,
      'github.issue.updated',
    );

    if (prediction) {
      await this.aiPredictionService.syncPrediction(
        buildAIPredictionWrite(existingIssue.id, prediction),
      );
    }
  }

  public async deleteOne(where: Where<GithubIssue>): Promise<void> {
    const issues = await this.githubIssueRepository.find({where});
    const issueIds = issues.map(issue => issue.id);
    await this.deleteAssociatedData(issueIds);
    await this.githubIssueRepository.deleteAll(where);
    for (const issue of issues) {
      await this.recordIssueAudit(issue, 'github.issue.deleted');
    }
  }

  public async deleteById(id: number): Promise<void> {
    await this.deleteOne({id});
  }

  public async deleteAll(where: Where<GithubIssue>): Promise<Count> {
    const issues = await this.githubIssueRepository.find({where});
    const issueIds = issues.map(issue => issue.id);
    await this.deleteAssociatedData(issueIds);

    const result = await this.githubIssueRepository.deleteAll(where);
    for (const issue of issues) {
      await this.recordIssueAudit(issue, 'github.issue.deleted');
    }

    return result;
  }

  public async saveIssuesBulk(issues: GithubIssueWrite[]): Promise<void> {
    if (!issues.length) {
      return;
    }

    for (let index = 0; index < issues.length; index += this.batchSize) {
      const batch = issues.slice(index, index + this.batchSize);
      const createdIssues = await createAllWithoutNewsFeedIfSupported(
        this.githubIssueRepository,
        batch.map(entry => entry.issue),
      );
      for (const issue of createdIssues) {
        await this.recordIssueAudit(
          issue as GithubIssue,
          'github.issue.synced',
        );
      }
      await this.aiPredictionService.createPredictionsBulk(
        createdIssues.map((issue, batchIndex) =>
          buildAIPredictionWrite(issue.id, batch[batchIndex].prediction),
        ),
      );
    }
  }

  private async deleteAssociatedData(issueIds: number[]): Promise<void> {
    if (!issueIds.length) {
      return;
    }

    await this.aiPredictionService.deleteForSources(
      'github-issue',
      issueIds,
      'issue-priority',
    );
    await this.issueAssignmentRepository.deleteAll({
      issueId: {inq: issueIds},
    });
  }

  private async recordIssueAudit(
    issue: GithubIssue,
    action: string,
  ): Promise<void> {
    if (!issue.repositoryId) {
      return;
    }

    const repository = await this.githubRepositoryRepository.findById(
      issue.repositoryId,
    );

    await this.auditEventService.record({
      workspaceId: repository.workspaceId,
      action,
      resourceType: 'github-issue',
      resourceId: String(issue.id),
      source: 'github',
      payload: {
        githubIssueNumber: issue.githubIssueNumber,
        repositoryId: repository.id,
        repositoryFullName: repository.fullName,
        status: issue.status,
        title: issue.title,
      },
    });
  }
}

function buildAIPredictionWrite(
  sourceId: number,
  prediction: IssuePredictionWrite,
) {
  return {
    sourceType: 'github-issue' as const,
    sourceId,
    predictionType: 'issue-priority' as const,
    priority: prediction.priority,
    reason: prediction.reason,
    estimatedHours: prediction.estimatedHours,
    estimationConfidence: prediction.estimationConfidence,
    ...(prediction.expertiseRecommendations?.length
      ? {expertiseRecommendations: prediction.expertiseRecommendations}
      : {}),
  };
}

async function createAllWithoutNewsFeedIfSupported<
  Item,
  Created extends {id: number},
  T extends {
    createAll(items: Item[]): Promise<Created[]>;
    withoutNewsFeed?: <Result>(
      callback: () => Promise<Result>,
    ) => Promise<Result>;
  },
>(repository: T, items: Item[]): Promise<Created[]> {
  if (typeof repository.withoutNewsFeed === 'function') {
    return repository.withoutNewsFeed(() => repository.createAll(items));
  }

  return repository.createAll(items);
}
