import Model, { attr, belongsTo } from '@warp-drive/legacy/model';
import type WorkspaceModel from './workspace';

export default class InvitationModel extends Model {
  @belongsTo('workspace', { async: false, inverse: 'invitations' })
  declare workspace: WorkspaceModel | null;

  @attr('string') declare email: string;
  @attr('number') declare workspaceId: number;
}
