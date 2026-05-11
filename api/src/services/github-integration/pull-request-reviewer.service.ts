import {BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {GithubPullRequest, PullRequestReviewerStatus} from '../../models';
import {
  GithubPullRequestRepository,
  GithubPullRequestReviewerRepository,
  UserRepository,
} from '../../repositories';

export type GithubReviewerIdentity = {
  id?: number | null;
  login?: string | null;
};

@injectable({scope: BindingScope.SINGLETON})
export class PullRequestReviewerService {
  constructor(
    @repository(GithubPullRequestRepository)
    private pullRequestRepository: GithubPullRequestRepository,
    @repository(GithubPullRequestReviewerRepository)
    private reviewerRepository: GithubPullRequestReviewerRepository,
    @repository(UserRepository)
    private userRepository: UserRepository,
  ) {}

  async syncRequestedReviewers({
    pullRequest,
    reviewers,
  }: {
    pullRequest: GithubPullRequest;
    reviewers: GithubReviewerIdentity[];
  }): Promise<void> {
    const normalizedReviewers = reviewers
      .map(reviewer => ({
        githubUserId: reviewer.id ?? null,
        githubLogin: reviewer.login?.trim() ?? '',
      }))
      .filter(reviewer => reviewer.githubLogin.length > 0);
    const activeLogins = new Set(
      normalizedReviewers.map(reviewer => reviewer.githubLogin.toLowerCase()),
    );

    for (const reviewer of normalizedReviewers) {
      const userId = await this.resolveUserId(reviewer.githubUserId);
      const existing = await this.reviewerRepository.findOne({
        where: {
          pullRequestId: pullRequest.id,
          githubLogin: reviewer.githubLogin,
        },
      });
      const data = {
        pullRequestId: pullRequest.id,
        userId,
        githubUserId: reviewer.githubUserId,
        githubLogin: reviewer.githubLogin,
        updatedAt: new Date().toISOString(),
      };

      if (!existing) {
        await this.reviewerRepository.create({
          ...data,
          status: 'pending',
        });
        continue;
      }

      await this.reviewerRepository.updateById(existing.id, data);
    }

    const pendingReviewers = await this.reviewerRepository.find({
      where: {pullRequestId: pullRequest.id, status: 'pending'},
    });

    for (const reviewer of pendingReviewers) {
      if (!activeLogins.has(reviewer.githubLogin.toLowerCase())) {
        await this.reviewerRepository.deleteById(reviewer.id);
      }
    }
  }

  async markProgress({
    repositoryId,
    pullRequestNumber,
    reviewer,
    status,
  }: {
    repositoryId: number;
    pullRequestNumber: number;
    reviewer?: GithubReviewerIdentity | null;
    status: PullRequestReviewerStatus;
  }): Promise<void> {
    const githubLogin = reviewer?.login?.trim();

    if (!githubLogin) {
      return;
    }

    const pullRequest = await this.pullRequestRepository.findOne({
      where: {repositoryId, githubPrNumber: pullRequestNumber},
    });

    if (!pullRequest) {
      return;
    }

    const userId = await this.resolveUserId(reviewer?.id ?? null);
    const existing = await this.reviewerRepository.findOne({
      where: {pullRequestId: pullRequest.id, githubLogin},
    });
    const reviewedAt = new Date().toISOString();
    const data = {
      pullRequestId: pullRequest.id,
      userId,
      githubUserId: reviewer?.id ?? null,
      githubLogin,
      status,
      reviewedAt,
      updatedAt: reviewedAt,
    };

    if (!existing) {
      await this.reviewerRepository.create(data);
      return;
    }

    await this.reviewerRepository.updateById(existing.id, data);
  }

  private async resolveUserId(
    githubUserId?: number | null,
  ): Promise<number | null> {
    if (!githubUserId) {
      return null;
    }

    const user = await this.userRepository.findOne({
      where: {githubId: githubUserId},
    });

    return user?.id ?? null;
  }
}
