import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'github', table: 'installation_state'},
  },
})
export class GithubInstallationState extends Entity {
  @property({
    type: 'string',
    id: true,
    postgresql: {columnName: 'nonce'},
  })
  nonce: string;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'workspace_id'},
  })
  workspaceId: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'user_id'},
  })
  userId: number;

  @property({
    type: 'date',
    required: true,
    postgresql: {columnName: 'issued_at'},
  })
  issuedAt: Date;

  @property({
    type: 'date',
    required: true,
    postgresql: {columnName: 'expires_at'},
  })
  expiresAt: Date;

  @property({
    type: 'date',
    postgresql: {columnName: 'consumed_at'},
  })
  consumedAt?: Date | null;

  constructor(data?: Partial<GithubInstallationState>) {
    super(data);
  }
}

export type GithubInstallationStateRelations = object;

export type GithubInstallationStateWithRelations = GithubInstallationState &
  GithubInstallationStateRelations;
