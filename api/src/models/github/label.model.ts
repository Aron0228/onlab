import {belongsTo, Entity, model, property} from '@loopback/repository';
import {GithubRepository} from './repository.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'github', table: 'label'},
  },
})
export class GithubLabel extends Entity {
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
    postgresql: {columnName: 'github_label_id', dataType: 'bigint'},
  })
  githubLabelId: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'name'},
  })
  name: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'color'},
  })
  color: string;

  constructor(data?: Partial<GithubLabel>) {
    super(data);
  }
}

export type GithubLabelRelations = {
  repository?: GithubRepository;
};

export type GithubLabelWithRelations = GithubLabel & GithubLabelRelations;
