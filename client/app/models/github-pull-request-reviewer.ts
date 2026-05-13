import Model, { attr, belongsTo } from '@warp-drive/legacy/model';
import type GithubPullRequestModel from './github-pull-request';
import type UserModel from './user';

export type PullRequestReviewerStatus =
  | 'pending'
  | 'commented'
  | 'approved'
  | 'changes_requested'
  | 'dismissed';

export default class GithubPullRequestReviewerModel extends Model {
  @belongsTo('github-pull-request', { async: false, inverse: 'reviewers' })
  declare pullRequest: GithubPullRequestModel | null;

  @belongsTo('user', { async: false, inverse: null })
  declare user: UserModel | null;

  @attr('number') declare pullRequestId: number;
  @attr('number') declare userId: number | null;
  @attr('number') declare githubUserId: number | null;
  @attr('string') declare githubLogin: string;
  @attr('string') declare status: PullRequestReviewerStatus;
  @attr('date') declare lastNotifiedAt: Date | null;
  @attr('date') declare reviewedAt: Date | null;
  @attr('date') declare createdAt: Date;
  @attr('date') declare updatedAt: Date;
}
