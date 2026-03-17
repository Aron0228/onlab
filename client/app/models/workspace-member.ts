import Model, {attr, belongsTo} from '@warp-drive/legacy/model';
import type UserModel from './user';
import type WorkspaceModel from './workspace';

export default class WorkspaceMemberModel extends Model {
  @belongsTo('user', {async: false, inverse: null})
  declare user: UserModel | null;

  @belongsTo('workspace', {async: false, inverse: null})
  declare workspace: WorkspaceModel | null;

  @attr('number') declare userId: number | null;
  @attr('number') declare workspaceId: number | null;
  @attr('string') declare role: 'ADMIN' | 'MEMBER' | null;
}
