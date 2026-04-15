import Model, { attr, belongsTo, hasMany } from '@warp-drive/legacy/model';
import type WorkspaceModel from './workspace';
import type CapacityPlanEntryModel from './capacity-plan-entry';
import type IssueAssignmentModel from './issue-assignment';

export default class CapacityPlanModel extends Model {
  @belongsTo('workspace', { async: false, inverse: 'capacityPlans' })
  declare workspace: WorkspaceModel | null;

  @hasMany('capacity-plan-entry', { async: false, inverse: 'capacityPlan' })
  declare entries: CapacityPlanEntryModel[];

  @hasMany('issue-assignment', {
    async: false,
    inverse: 'capacityPlan',
  })
  declare issueAssignments: IssueAssignmentModel[];

  @attr('number') declare workspaceId: number;
  @attr('date') declare start: string;
  @attr('date') declare end: string;
}
