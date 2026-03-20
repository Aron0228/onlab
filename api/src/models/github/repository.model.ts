import {
  belongsTo,
  Entity,
  hasMany,
  model,
  property,
} from '@loopback/repository';
import {Workspace} from '../system';
import {GithubIssue} from './issue.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'github', table: 'repository'},
  },
})
export class GithubRepository extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => Workspace,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'workspace_id'},
    },
  )
  workspaceId: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'github_repo_id', dataType: 'bigint'},
  })
  githubRepoId: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'name'},
  })
  name: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'full_name'},
  })
  fullName: string;

  @hasMany(() => GithubIssue, {keyTo: 'repositoryId'})
  issues?: GithubIssue[];

  constructor(data?: Partial<GithubRepository>) {
    super(data);
  }
}

export type GithubRepositoryRelations = {
  issues?: GithubIssue[];
  workspace?: Workspace;
};

export type GithubRepositoryWithRelations = GithubRepository &
  GithubRepositoryRelations;
