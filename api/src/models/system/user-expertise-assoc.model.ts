import {belongsTo, Entity, model, property} from '@loopback/repository';
import {User} from '../auth';
import {Expertise} from './expertise.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'user_expertise_assoc'},
  },
})
export class UserExpertiseAssoc extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

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

  @belongsTo(
    () => Expertise,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'expertise_id'},
    },
  )
  expertiseId: number;

  constructor(data?: Partial<UserExpertiseAssoc>) {
    super(data);
  }
}

export type UserExpertiseAssocRelations = {
  user?: User;
  expertise?: Expertise;
};

export type UserExpertiseAssocWithRelations = UserExpertiseAssoc &
  UserExpertiseAssocRelations;
