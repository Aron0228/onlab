import {Entity, model, property} from '@loopback/repository';
import {securityId, UserProfile} from '@loopback/security';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'auth', table: 'user'},
  },
})
export class User extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'github_id'},
  })
  githubId: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'username'},
  })
  username: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'full_name'},
  })
  fullName: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'email'},
  })
  email: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'avatar_url'},
  })
  avatarUrl: string;

  constructor(data?: Partial<User>) {
    super(data);
  }

  toUserProfile(): UserProfile {
    return {
      [securityId]: this.id.toString(),
      id: this.id,
    };
  }
}

export type UserRelations = object;

export type UserWithRelations = User & UserRelations;
