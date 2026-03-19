import {belongsTo, Entity, model, property} from '@loopback/repository';
import {GithubRepository} from './repository.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'github', table: 'issue'},
  },
})
export class GithubIssue extends Entity {
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
    postgresql: {columnName: 'github_id'},
  })
  githubId: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'title'},
  })
  title: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'description'},
  })
  description: string;

  constructor(data?: Partial<GithubIssue>) {
    super(data);
  }
}

export type GithubIssueRelations = {
  repository?: GithubRepository;
};

export type GithubIssueWithRelations = GithubIssue & GithubIssueRelations;
