import {BindingScope, injectable} from '@loopback/core';
import {DataObject, repository, Where} from '@loopback/repository';
import {GithubPullRequest} from '../../models';
import {GithubPullRequestRepository} from '../../repositories';

@injectable({scope: BindingScope.SINGLETON})
export class PullRequestService {
  private readonly batchSize = 100;

  constructor(
    @repository(GithubPullRequestRepository)
    private githubPullRequestRepository: GithubPullRequestRepository,
  ) {}

  public async deleteByRepositoryId(repositoryId: number): Promise<void> {
    await this.githubPullRequestRepository.deleteAll({repositoryId});
  }

  public async upsertPullRequest(
    pullRequest: DataObject<GithubPullRequest>,
    where: Where<GithubPullRequest>,
  ): Promise<void> {
    const existingPullRequest = await this.githubPullRequestRepository.findOne({
      where,
    });

    if (!existingPullRequest) {
      await this.githubPullRequestRepository.create(pullRequest);
      return;
    }

    await this.githubPullRequestRepository.updateById(
      existingPullRequest.id,
      pullRequest,
    );
  }

  public async deleteOne(where: Where<GithubPullRequest>): Promise<void> {
    await this.githubPullRequestRepository.deleteAll(where);
  }

  public async savePullRequestsBulk(
    pullRequests: DataObject<GithubPullRequest>[],
  ): Promise<void> {
    if (!pullRequests.length) {
      return;
    }

    for (let index = 0; index < pullRequests.length; index += this.batchSize) {
      const batch = pullRequests.slice(index, index + this.batchSize);
      await this.githubPullRequestRepository.createAll(batch);
    }
  }
}
