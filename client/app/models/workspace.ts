import Model, { attr, belongsTo, hasMany } from '@warp-drive/legacy/model';
import type CapacityPlanModel from './capacity-plan';
import type ExpertiseModel from './expertise';
import type UserModel from './user';
import type FileModel from './file';
import type InvitationModel from './invitation';
import type WorkspaceMemberModel from './workspace-member';

export default class WorkspaceModel extends Model {
  @belongsTo('user', { async: false, inverse: null })
  declare owner: UserModel | null;

  @hasMany('file', { async: false, inverse: 'workspace' })
  declare files: FileModel[];

  @hasMany('invitation', { async: false, inverse: 'workspace' })
  declare invitations: InvitationModel[];

  @hasMany('workspace-member', { async: false, inverse: null })
  declare workspaceMembers: WorkspaceMemberModel[];

  @hasMany('expertise', { async: false, inverse: 'workspace' })
  declare expertises: ExpertiseModel[];

  @hasMany('capacity-plan', { async: false, inverse: 'workspace' })
  declare capacityPlans: CapacityPlanModel[];

  @attr('string') declare name: string;
  @attr('number') declare ownerId: number;
  @attr('string') declare githubInstallationId: string | null;
  @attr('string') declare avatarUrl: string | null;
  @attr('string') declare prReviewReminderCron: string | null;
  @attr('boolean') declare issueSync: boolean;
  @attr('boolean') declare capacityPlanningSync: boolean;
  @attr('boolean') declare prRiskPredictionSync: boolean;
  @attr('boolean') declare reviewerSuggestionSync: boolean;
}
