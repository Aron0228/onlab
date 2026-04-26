import {BindingScope, injectable, service} from '@loopback/core';
import {Count, DataObject, repository, Where} from '@loopback/repository';
import {GithubIssue} from '../../models';
import {
  GithubIssueRepository,
  IssueAssignmentRepository,
} from '../../repositories';
import {AIPredictionService} from '../ai-prediction.service';

type IssuePredictionWrite = {
  priority: string;
  reason: string;
  estimatedHours?: number | null;
  estimationConfidence?: 'low' | 'medium' | 'high' | null;
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
    @service(AIPredictionService)
    private aiPredictionService: AIPredictionService,
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
      if (prediction) {
        await this.aiPredictionService.syncPrediction({
          sourceType: 'github-issue',
          sourceId: createdIssue.id,
          predictionType: 'issue-priority',
          priority: prediction.priority,
          reason: prediction.reason,
          estimatedHours: prediction.estimatedHours,
          estimationConfidence: prediction.estimationConfidence,
        });
      }
      return;
    }

    await this.githubIssueRepository.updateById(existingIssue.id, issue);

    if (prediction) {
      await this.aiPredictionService.syncPrediction({
        sourceType: 'github-issue',
        sourceId: existingIssue.id,
        predictionType: 'issue-priority',
        priority: prediction.priority,
        reason: prediction.reason,
        estimatedHours: prediction.estimatedHours,
        estimationConfidence: prediction.estimationConfidence,
      });
    }
  }

  public async deleteOne(where: Where<GithubIssue>): Promise<void> {
    const issues = await this.githubIssueRepository.find({where});
    const issueIds = issues.map(issue => issue.id);
    await this.deleteAssociatedData(issueIds);
    await this.githubIssueRepository.deleteAll(where);
  }

  public async deleteById(id: number): Promise<void> {
    await this.deleteOne({id});
  }

  public async deleteAll(where: Where<GithubIssue>): Promise<Count> {
    const issues = await this.githubIssueRepository.find({where});
    const issueIds = issues.map(issue => issue.id);
    await this.deleteAssociatedData(issueIds);

    return this.githubIssueRepository.deleteAll(where);
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
      await this.aiPredictionService.createPredictionsBulk(
        createdIssues.map((issue, batchIndex) => ({
          sourceType: 'github-issue',
          sourceId: issue.id,
          predictionType: 'issue-priority',
          priority: batch[batchIndex].prediction.priority,
          reason: batch[batchIndex].prediction.reason,
          estimatedHours: batch[batchIndex].prediction.estimatedHours,
          estimationConfidence:
            batch[batchIndex].prediction.estimationConfidence,
        })),
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
