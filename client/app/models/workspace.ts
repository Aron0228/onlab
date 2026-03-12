import Model, {attr, belongsTo, hasMany} from '@warp-drive/legacy/model';
import type UserModel from './user';
import type FileModel from './file';

export default class WorkspaceModel extends Model {
  @belongsTo('user', {async: false, inverse: null})
  declare owner: UserModel | null;

  @hasMany('file', {async: false, inverse: 'workspace'})
  declare files: FileModel[];

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
