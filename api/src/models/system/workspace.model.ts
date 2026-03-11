import {belongsTo, Entity, hasMany, model, property} from '@loopback/repository';
import {User} from '../auth';
import {File} from './file.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'workspace'},
  },
})
export class Workspace extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'name'},
  })
  name: string;

  @belongsTo(
    () => User,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'owner_id'},
    },
  )
  ownerId: number;

  @property({
    type: 'string',
    postgresql: {columnName: 'github_installation_id'},
  })
  githubInstallationId?: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'avatar_url'},
  })
  avatarUrl?: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'pr_review_reminder_cron'},
  })
  prReviewReminderCron?: string;

  @property({
    type: 'boolean',
    postgresql: {columnName: 'issue_sync'},
    default: true,
  })
  issueSync?: boolean;

  @property({
    type: 'boolean',
    postgresql: {columnName: 'capacity_planning_sync'},
    default: true,
  })
  capacityPlanningSync?: boolean;

  @property({
    type: 'boolean',
    postgresql: {columnName: 'pr_risk_prediction_sync'},
    default: true,
  })
  prRiskPredictionSync?: boolean;

  @property({
    type: 'boolean',
    postgresql: {columnName: 'reviewer_suggestion_sync'},
    default: true,
  })
  reviewerSuggestionSync?: boolean;

  @hasMany(() => File, {keyTo: 'workspaceId'})
  files?: File[];

  constructor(data?: Partial<Workspace>) {
    super(data);
  }
}

export type WorkspaceRelations = {
  owner?: User;
  files?: File[];
};

export type WorkspaceWithRelations = Workspace & WorkspaceRelations;
