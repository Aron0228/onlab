import {BindingScope, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {
  GithubPullRequestRepository,
  GithubPullRequestReviewerRepository,
  GithubRepositoryRepository,
  UserRepository,
} from '../repositories';
import {CommunicationSocketService} from './communication-socket.service';

export type PullRequestReviewReminderPayload = {
  workspaceId: number;
  pullRequestId: number;
  pullRequestNumber: number;
  pullRequestTitle: string;
  repositoryName: string;
  reviewerLogin: string;
};

@injectable({scope: BindingScope.SINGLETON})
export class PullRequestReviewReminderService {
  private readonly activeWorkspaceIds = new Set<number>();

  constructor(
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @repository(GithubPullRequestRepository)
    private pullRequestRepository: GithubPullRequestRepository,
    @repository(GithubPullRequestReviewerRepository)
    private reviewerRepository: GithubPullRequestReviewerRepository,
    @repository(UserRepository)
    private userRepository: UserRepository,
    @service(CommunicationSocketService)
    private communicationSocketService: CommunicationSocketService,
  ) {}

  async remindWorkspace(workspaceId: number): Promise<number> {
    if (this.activeWorkspaceIds.has(workspaceId)) {
      console.log('[PR review reminder] Workspace reminder already running.', {
        workspaceId,
      });
      return 0;
    }

    this.activeWorkspaceIds.add(workspaceId);

    try {
      return await this.remindWorkspaceNow(workspaceId);
    } finally {
      this.activeWorkspaceIds.delete(workspaceId);
    }
  }

  private async remindWorkspaceNow(workspaceId: number): Promise<number> {
    const repositories = await this.githubRepositoryRepository.find({
      where: {workspaceId},
    });
    const repositoryIds = repositories.map(repository => repository.id);
    console.log('[PR review reminder] Looking for pending reviewers.', {
      workspaceId,
      repositoryCount: repositories.length,
    });

    if (!repositoryIds.length) {
      console.log('[PR review reminder] No repositories in workspace.', {
        workspaceId,
      });
      return 0;
    }

    const pullRequests = await this.pullRequestRepository.find({
      where: {
        repositoryId: {inq: repositoryIds},
        status: {inq: ['open', 'opened']},
      },
    });
    const pullRequestById = new Map(
      pullRequests.map(pullRequest => [pullRequest.id, pullRequest]),
    );
    const repositoryById = new Map(
      repositories.map(repository => [repository.id, repository]),
    );

    if (!pullRequests.length) {
      console.log('[PR review reminder] No open pull requests found.', {
        workspaceId,
      });
      return 0;
    }

    const pendingReviewers = await this.reviewerRepository.find({
      where: {
        pullRequestId: {inq: pullRequests.map(pullRequest => pullRequest.id)},
        status: 'pending',
      },
    });
    console.log('[PR review reminder] Pending reviewer candidates found.', {
      workspaceId,
      pullRequestCount: pullRequests.length,
      pendingReviewerCount: pendingReviewers.length,
    });
    let reminderCount = 0;

    for (const reviewer of pendingReviewers) {
      const userId =
        reviewer.userId ??
        (await this.resolveReviewerUserId(
          reviewer.githubUserId,
          reviewer.githubLogin,
        ));

      if (!userId) {
        console.log(
          '[PR review reminder] Skipping reviewer without local user.',
          {
            workspaceId,
            reviewerId: reviewer.id,
            githubUserId: reviewer.githubUserId,
            githubLogin: reviewer.githubLogin,
          },
        );
        continue;
      }

      const pullRequest = pullRequestById.get(reviewer.pullRequestId);
      if (!pullRequest) {
        console.log('[PR review reminder] Skipping reviewer without PR.', {
          workspaceId,
          reviewerId: reviewer.id,
          pullRequestId: reviewer.pullRequestId,
        });
        continue;
      }

      const repository = repositoryById.get(pullRequest.repositoryId);
      if (!repository) {
        console.log(
          '[PR review reminder] Skipping reviewer without repository.',
          {
            workspaceId,
            reviewerId: reviewer.id,
            repositoryId: pullRequest.repositoryId,
          },
        );
        continue;
      }

      const payload: PullRequestReviewReminderPayload = {
        workspaceId,
        pullRequestId: pullRequest.id,
        pullRequestNumber: pullRequest.githubPrNumber,
        pullRequestTitle: pullRequest.title,
        repositoryName: repository.fullName,
        reviewerLogin: reviewer.githubLogin,
      };

      this.communicationSocketService.emitPullRequestReviewReminder(
        userId,
        payload,
      );
      console.log('[PR review reminder] Emitted reviewer notification.', {
        workspaceId,
        userId,
        storedUserId: reviewer.userId,
        reviewerId: reviewer.id,
        githubUserId: reviewer.githubUserId,
        githubLogin: reviewer.githubLogin,
        pullRequestId: pullRequest.id,
        pullRequestNumber: pullRequest.githubPrNumber,
      });
      await this.reviewerRepository.updateById(reviewer.id, {
        userId,
        lastNotifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      reminderCount += 1;
    }

    return reminderCount;
  }

  private async resolveReviewerUserId(
    githubUserId?: number | null,
    githubLogin?: string | null,
  ): Promise<number | null> {
    if (githubUserId) {
      const user = await this.userRepository.findOne({
        where: {githubId: githubUserId},
      });

      if (user) {
        return user.id;
      }
    }

    if (!githubLogin) {
      return null;
    }

    const user = await this.userRepository.findOne({
      where: {username: githubLogin},
    });

    return user?.id ?? null;
  }
}
