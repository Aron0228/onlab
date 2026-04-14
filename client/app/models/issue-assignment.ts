import Model, { attr, belongsTo } from '@warp-drive/legacy/model';
import type CapacityPlanModel from './capacity-plan';
import type GithubIssueModel from './github-issue';
import type UserModel from './user';

export default class IssueAssignmentModel extends Model {
  @belongsTo('github-issue', { async: false, inverse: 'issueAssignments' })
  declare issue: GithubIssueModel | null;

  @belongsTo('user', { async: false, inverse: 'issueAssignments' })
  declare user: UserModel | null;

  @belongsTo('capacity-plan', {
    async: false,
    inverse: 'issueAssignments',
  })
  declare capacityPlan: CapacityPlanModel | null;

  @attr('number') declare issueId: number;
  @attr('number') declare userId: number;
  @attr('number') declare capacityPlanId: number;
  @attr('number') declare assignedHours: number;
}
