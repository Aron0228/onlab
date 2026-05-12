import {BindingScope, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {GithubPullRequest, PullRequestReviewerStatus} from '../../models';
import {
  GithubRepositoryRepository,
  GithubPullRequestRepository,
  GithubPullRequestReviewerRepository,
  UserRepository,
} from '../../repositories';
import {AuditEventService} from '../audit-event.service';

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
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @service(AuditEventService)
    private auditEventService: AuditEventService,
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
        const createdReviewer = await this.reviewerRepository.create({
          ...data,
          status: 'pending',
        });
        await this.recordReviewerAudit(
          pullRequest,
          'pull-request.reviewer.requested',
          createdReviewer.id,
          {
            githubLogin: reviewer.githubLogin,
            githubUserId: reviewer.githubUserId,
            userId,
          },
        );
        continue;
      }

      await this.reviewerRepository.updateById(existing.id, data);
      await this.recordReviewerAudit(
        pullRequest,
        'pull-request.reviewer.updated',
        existing.id,
        {
          githubLogin: reviewer.githubLogin,
          githubUserId: reviewer.githubUserId,
          userId,
        },
      );
    }

    const pendingReviewers = await this.reviewerRepository.find({
      where: {pullRequestId: pullRequest.id, status: 'pending'},
    });

    for (const reviewer of pendingReviewers) {
      if (!activeLogins.has(reviewer.githubLogin.toLowerCase())) {
        await this.reviewerRepository.deleteById(reviewer.id);
        await this.recordReviewerAudit(
          pullRequest,
          'pull-request.reviewer.removed',
          reviewer.id,
          {
            githubLogin: reviewer.githubLogin,
            githubUserId: reviewer.githubUserId,
            userId: reviewer.userId,
          },
        );
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
      const createdReviewer = await this.reviewerRepository.create(data);
      await this.recordReviewerAudit(
        pullRequest,
        'pull-request.reviewer.progressed',
        createdReviewer.id,
        {
          githubLogin,
          githubUserId: reviewer?.id ?? null,
          userId,
          status,
        },
      );
      return;
    }

    await this.reviewerRepository.updateById(existing.id, data);
    await this.recordReviewerAudit(
      pullRequest,
      'pull-request.reviewer.progressed',
      existing.id,
      {
        githubLogin,
        githubUserId: reviewer?.id ?? null,
        userId,
        status,
      },
    );
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

  private async recordReviewerAudit(
    pullRequest: GithubPullRequest,
    action: string,
    reviewerId: number,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!pullRequest.repositoryId) {
      return;
    }

    const repository = await this.githubRepositoryRepository.findById(
      pullRequest.repositoryId,
    );

    await this.auditEventService.record({
      workspaceId: repository.workspaceId,
      action,
      resourceType: 'pull-request-reviewer',
      resourceId: String(reviewerId),
      source: 'github',
      payload: {
        ...payload,
        pullRequestId: pullRequest.id,
        githubPrNumber: pullRequest.githubPrNumber,
        repositoryFullName: repository.fullName,
      },
    });
  }
}
