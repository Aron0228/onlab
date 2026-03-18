import Model, {attr, hasMany} from '@warp-drive/legacy/model';
import type WorkspaceMemberModel from './workspace-member';

export default class UserModel extends Model {
  @hasMany('workspace-member', {async: false, inverse: null})
  declare workspaceMembers: WorkspaceMemberModel[];

  @attr('number') declare githubId: number;
  @attr('string') declare username: string;
  @attr('string') declare fullName: string;
  @attr('string') declare email: string;
  @attr('string') declare avatarUrl: string;
}
