import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Workspace} from '../system';

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
    postgresql: {columnName: 'github_repo_id'},
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

  constructor(data?: Partial<GithubRepository>) {
    super(data);
  }
}

export type GithubRepositoryRelations = {
  workspace?: Workspace;
};

export type GithubRepositoryWithRelations = GithubRepository &
  GithubRepositoryRelations;
