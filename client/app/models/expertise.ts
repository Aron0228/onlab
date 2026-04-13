import Model, { attr, belongsTo, hasMany } from '@warp-drive/legacy/model';
import type WorkspaceModel from './workspace';
import type UserExpertiseAssocModel from './user-expertise-assoc';

export default class ExpertiseModel extends Model {
  @belongsTo('workspace', { async: false, inverse: 'expertises' })
  declare workspace: WorkspaceModel | null;

  @hasMany('user-expertise-assoc', {
    async: false,
    inverse: 'expertise',
  })
  declare userExpertiseAssocs: UserExpertiseAssocModel[];

  @attr('string') declare name: string;
  @attr('string') declare description: string | null;
  @attr('number') declare workspaceId: number;
}
