import {
  belongsTo,
  Entity,
  hasMany,
  model,
  property,
} from '@loopback/repository';
import {Workspace} from '../system';
import {CapacityPlanEntry} from './capacity-plan-entry.model';
import {IssueAssignment} from './issue-assignment.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'planning', table: 'capacity_plan'},
  },
})
export class CapacityPlan extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => Workspace,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'workspace_id'},
    },
  )
  workspaceId: number;

  @property({
    type: 'date',
    required: true,
    postgresql: {columnName: 'start'},
  })
  start: string;

  @property({
    type: 'date',
    required: true,
    postgresql: {columnName: 'end'},
  })
  end: string;

  @hasMany(() => CapacityPlanEntry, {keyTo: 'capacityPlanId'})
  entries?: CapacityPlanEntry[];

  @hasMany(() => IssueAssignment, {keyTo: 'capacityPlanId'})
  issueAssignments?: IssueAssignment[];

  constructor(data?: Partial<CapacityPlan>) {
    super(data);
  }
}

export type CapacityPlanRelations = {
  workspace?: Workspace;
  entries?: CapacityPlanEntry[];
  issueAssignments?: IssueAssignment[];
};

export type CapacityPlanWithRelations = CapacityPlan & CapacityPlanRelations;
