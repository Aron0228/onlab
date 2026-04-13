import {belongsTo, Entity, model, property} from '@loopback/repository';
import {User} from '../auth';
import {GithubIssue} from '../github';
import {CapacityPlan} from './capacity-plan.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'planning', table: 'issue_assignment'},
  },
})
export class IssueAssignment extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => GithubIssue,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'issue_id'},
    },
  )
  issueId: number;

  @belongsTo(
    () => User,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'user_id'},
    },
  )
  userId: number;

  @belongsTo(
    () => CapacityPlan,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'capacity_plan_id'},
    },
  )
  capacityPlanId: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'assigned_hours', dataType: 'double precision'},
  })
  assignedHours: number;

  constructor(data?: Partial<IssueAssignment>) {
    super(data);
  }
}

export type IssueAssignmentRelations = {
  issue?: GithubIssue;
  user?: User;
  capacityPlan?: CapacityPlan;
};

export type IssueAssignmentWithRelations = IssueAssignment &
  IssueAssignmentRelations;
