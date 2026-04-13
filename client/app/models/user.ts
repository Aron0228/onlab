import Model, { attr, hasMany } from '@warp-drive/legacy/model';
import type UserExpertiseAssocModel from './user-expertise-assoc';
import type WorkspaceMemberModel from './workspace-member';

export default class UserModel extends Model {
  @hasMany('workspace-member', { async: false, inverse: null })
  declare workspaceMembers: WorkspaceMemberModel[];

  @hasMany('user-expertise-assoc', {
    async: false,
    inverse: 'user',
  })
  declare userExpertiseAssocs: UserExpertiseAssocModel[];

  @attr('number') declare githubId: number;
  @attr('string') declare username: string;
  @attr('string') declare fullName: string;
  @attr('string') declare email: string;
  @attr('string') declare avatarUrl: string;
}
