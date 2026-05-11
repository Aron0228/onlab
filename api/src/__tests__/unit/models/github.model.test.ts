import {describe, expect, it} from 'vitest';

import {
  GithubPullRequest,
  GithubPullRequestReviewer,
  GithubPullRequestReviewerWithRelations,
  User,
} from '../../../models';

describe('GitHub models (unit)', () => {
  it('constructs pull request reviewers with reviewer status and relations', () => {
    const reviewer: GithubPullRequestReviewerWithRelations =
      new GithubPullRequestReviewer({
        id: 12,
        pullRequestId: 5,
        userId: 9,
        githubUserId: 1234,
        githubLogin: 'octocat',
        status: 'pending',
        lastNotifiedAt: '2026-04-30T09:00:00.000Z',
        reviewedAt: null,
        createdAt: '2026-04-30T08:00:00.000Z',
        updatedAt: '2026-04-30T09:00:00.000Z',
      });

    reviewer.pullRequest = new GithubPullRequest({
      id: 5,
      repositoryId: 2,
      githubPrNumber: 37,
      title: 'Refactor scheduler',
      status: 'open',
      description: 'Reminder work',
    });
    reviewer.user = new User({id: 9, username: 'octocat'});

    expect(reviewer.toJSON()).toMatchObject({
      id: 12,
      pullRequestId: 5,
      userId: 9,
      githubUserId: 1234,
      githubLogin: 'octocat',
      status: 'pending',
      lastNotifiedAt: '2026-04-30T09:00:00.000Z',
      reviewedAt: null,
      createdAt: '2026-04-30T08:00:00.000Z',
      updatedAt: '2026-04-30T09:00:00.000Z',
    });
    expect(reviewer.pullRequest?.githubPrNumber).toBe(37);
    expect(reviewer.user?.username).toBe('octocat');
  });
});
