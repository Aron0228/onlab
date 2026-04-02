import {belongsTo, Entity, model, property} from '@loopback/repository';
import {User} from '../auth';
import {GithubRepository} from './repository.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'github', table: 'pull_request'},
  },
})
export class GithubPullRequest extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => GithubRepository,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'repository_id'},
    },
  )
  repositoryId: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'github_pr_number'},
  })
  githubPrNumber: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'title'},
  })
  title: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'status'},
  })
  status: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'description'},
  })
  description: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'priority'},
  })
  priority?: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'priority_reason'},
  })
  priorityReason?: string;

  @belongsTo(
    () => User,
    {},
    {
      type: 'number',
      postgresql: {columnName: 'author_id'},
    },
  )
  authorId?: number | null;

  constructor(data?: Partial<GithubPullRequest>) {
    super(data);
  }
}

export type GithubPullRequestRelations = {
  repository?: GithubRepository;
  author?: User;
};

export type GithubPullRequestWithRelations = GithubPullRequest &
  GithubPullRequestRelations;
