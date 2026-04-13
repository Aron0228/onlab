import Model, { belongsTo, attr } from '@warp-drive/legacy/model';
import type ExpertiseModel from './expertise';
import type UserModel from './user';

export default class UserExpertiseAssocModel extends Model {
  @belongsTo('user', { async: false, inverse: 'userExpertiseAssocs' })
  declare user: UserModel | null;

  @belongsTo('expertise', { async: false, inverse: 'userExpertiseAssocs' })
  declare expertise: ExpertiseModel | null;

  @attr('number') declare userId: number;
  @attr('number') declare expertiseId: number;
}
