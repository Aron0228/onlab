import {belongsTo, hasOne, model, property} from '@loopback/repository';
import {User} from '../auth';
import {AIPrediction, AIPredictable} from '../system';
import {GithubRepository} from './repository.model';

@model({
  settings: {
    forceId: false,
    newsFeedPredictable: {
      enabled: true,
      sourceType: 'github-pull-request',
    },
    postgresql: {schema: 'github', table: 'pull_request'},
  },
})
export class GithubPullRequest extends AIPredictable {
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

  @hasOne(() => AIPrediction, {keyTo: 'sourceId'})
  aiPrediction?: AIPrediction | null;

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
  aiPrediction?: AIPrediction | null;
};

export type GithubPullRequestWithRelations = GithubPullRequest &
  GithubPullRequestRelations;
