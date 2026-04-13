import {BindingScope, injectable, service} from '@loopback/core';
import {Count, DataObject, repository, Where} from '@loopback/repository';
import {GithubPullRequest} from '../../models';
import {GithubPullRequestRepository} from '../../repositories';
import {AIPredictionService} from '../ai-prediction.service';

type PullRequestPredictionWrite = {
  priority: string;
  reason: string;
  findings?: Array<{
    path: string;
    line?: number;
    body: string;
    lineContent?: string;
  }>;
  reviewerSuggestions?: Array<{
    userId: number;
    username: string;
    reason: string;
  }>;
};

type GithubPullRequestWrite = {
  pullRequest: DataObject<GithubPullRequest>;
  prediction?: PullRequestPredictionWrite;
};

@injectable({scope: BindingScope.SINGLETON})
export class PullRequestService {
  private readonly batchSize = 100;

  constructor(
    @repository(GithubPullRequestRepository)
    private githubPullRequestRepository: GithubPullRequestRepository,
    @service(AIPredictionService)
    private aiPredictionService: AIPredictionService,
  ) {}

  public async deleteByRepositoryId(repositoryId: number): Promise<void> {
    const pullRequests = await this.githubPullRequestRepository.find({
      where: {repositoryId},
    });
    await this.aiPredictionService.deleteForSources(
      'github-pull-request',
      pullRequests.map(pullRequest => pullRequest.id),
      'pull-request-merge-risk',
    );
    await this.githubPullRequestRepository.deleteAll({repositoryId});
  }

  public async findOne(
    where: Where<GithubPullRequest>,
  ): Promise<GithubPullRequest | null> {
    return this.githubPullRequestRepository.findOne({where});
  }

  public async upsertPullRequest(
    pullRequest: DataObject<GithubPullRequest>,
    where: Where<GithubPullRequest>,
    prediction?: PullRequestPredictionWrite,
  ): Promise<void> {
    const existingPullRequest = await this.findOne(where);

    if (!existingPullRequest) {
      const createdPullRequest =
        await this.githubPullRequestRepository.create(pullRequest);
      if (prediction) {
        await this.aiPredictionService.syncPrediction({
          sourceType: 'github-pull-request',
          sourceId: createdPullRequest.id,
          predictionType: 'pull-request-merge-risk',
          priority: prediction.priority,
          reason: prediction.reason,
          findings: prediction.findings,
          reviewerSuggestions: prediction.reviewerSuggestions,
        });
      }
      return;
    }

    await this.githubPullRequestRepository.updateById(
      existingPullRequest.id,
      pullRequest,
    );
    if (prediction) {
      await this.aiPredictionService.syncPrediction({
        sourceType: 'github-pull-request',
        sourceId: existingPullRequest.id,
        predictionType: 'pull-request-merge-risk',
        priority: prediction.priority,
        reason: prediction.reason,
        findings: prediction.findings,
        reviewerSuggestions: prediction.reviewerSuggestions,
      });
    }
  }

  public async deleteOne(where: Where<GithubPullRequest>): Promise<void> {
    const pullRequests = await this.githubPullRequestRepository.find({where});
    await this.aiPredictionService.deleteForSources(
      'github-pull-request',
      pullRequests.map(pullRequest => pullRequest.id),
      'pull-request-merge-risk',
    );
    await this.githubPullRequestRepository.deleteAll(where);
  }

  public async deleteById(id: number): Promise<void> {
    await this.deleteOne({id});
  }

  public async deleteAll(where: Where<GithubPullRequest>): Promise<Count> {
    const pullRequests = await this.githubPullRequestRepository.find({where});
    await this.aiPredictionService.deleteForSources(
      'github-pull-request',
      pullRequests.map(pullRequest => pullRequest.id),
      'pull-request-merge-risk',
    );

    return this.githubPullRequestRepository.deleteAll(where);
  }

  public async savePullRequestsBulk(
    pullRequests: GithubPullRequestWrite[],
  ): Promise<void> {
    if (!pullRequests.length) {
      return;
    }

    for (let index = 0; index < pullRequests.length; index += this.batchSize) {
      const batch = pullRequests.slice(index, index + this.batchSize);
      const createdPullRequests =
        await this.githubPullRequestRepository.createAll(
          batch.map(entry => entry.pullRequest),
        );
      await this.aiPredictionService.createPredictionsBulk(
        createdPullRequests.flatMap((pullRequest, batchIndex) => {
          const prediction = batch[batchIndex].prediction;

          if (!prediction) {
            return [];
          }

          return [
            {
              sourceType: 'github-pull-request' as const,
              sourceId: pullRequest.id,
              predictionType: 'pull-request-merge-risk' as const,
              priority: prediction.priority,
              reason: prediction.reason,
              findings: prediction.findings,
              reviewerSuggestions: prediction.reviewerSuggestions,
            },
          ];
        }),
      );
    }
  }
}
