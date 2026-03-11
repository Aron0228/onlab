import {belongsTo, Entity, model, property} from '@loopback/repository';
import {User, UserWithRelations} from './user.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'auth', table: 'access_token'},
  },
})
export class AccessToken extends Entity {
  @property({
    type: 'string',
    id: true,
  })
  id: string;

  @belongsTo(
    () => User,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'user_id'},
    },
  )
  userId: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'github_token'},
  })
  githubToken: string;

  @property({
    type: 'date',
    required: true,
    postgresql: {columnName: 'created_at'},
  })
  createdAt: Date;

  @property({
    type: 'date',
    required: true,
    postgresql: {columnName: 'expires_at'},
  })
  expiresAt: Date;

  @property({
    type: 'boolean',
    required: true,
    postgresql: {columnName: 'revoked'},
  })
  revoked: boolean;

  constructor(data?: Partial<AccessToken>) {
    super(data);
  }
}

export interface AccessTokenRelations {
  user?: UserWithRelations;
}

export type AccessTokenWithRelations = AccessToken & AccessTokenRelations;
