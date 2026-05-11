import {belongsTo, Entity, model, property} from '@loopback/repository';
import {User} from '../auth';
import {GithubPullRequest} from './pull-request.model';

export type PullRequestReviewerStatus =
  | 'pending'
  | 'commented'
  | 'approved'
  | 'changes_requested'
  | 'dismissed';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'github', table: 'pull_request_reviewer'},
  },
})
export class GithubPullRequestReviewer extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => GithubPullRequest,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'pull_request_id'},
    },
  )
  pullRequestId: number;

  @belongsTo(
    () => User,
    {},
    {
      type: 'number',
      postgresql: {columnName: 'user_id'},
    },
  )
  userId?: number | null;

  @property({
    type: 'number',
    postgresql: {columnName: 'github_user_id', dataType: 'bigint'},
  })
  githubUserId?: number | null;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'github_login'},
  })
  githubLogin: string;

  @property({
    type: 'string',
    required: true,
    default: 'pending',
    postgresql: {columnName: 'status'},
  })
  status: PullRequestReviewerStatus;

  @property({
    type: 'date',
    postgresql: {columnName: 'last_notified_at'},
  })
  lastNotifiedAt?: string | null;

  @property({
    type: 'date',
    postgresql: {columnName: 'reviewed_at'},
  })
  reviewedAt?: string | null;

  @property({
    type: 'date',
    required: true,
    defaultFn: 'now',
    postgresql: {columnName: 'created_at'},
  })
  createdAt: string;

  @property({
    type: 'date',
    required: true,
    defaultFn: 'now',
    postgresql: {columnName: 'updated_at'},
  })
  updatedAt: string;

  constructor(data?: Partial<GithubPullRequestReviewer>) {
    super(data);
  }
}

export type GithubPullRequestReviewerRelations = {
  pullRequest?: GithubPullRequest;
  user?: User;
};

export type GithubPullRequestReviewerWithRelations = GithubPullRequestReviewer &
  GithubPullRequestReviewerRelations;
