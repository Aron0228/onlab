import {
  belongsTo,
  hasMany,
  hasOne,
  model,
  property,
} from '@loopback/repository';
import {IssueAssignment} from '../planning';
import {AIPrediction, AIPredictable} from '../system';
import {GithubRepository} from './repository.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'github', table: 'issue'},
  },
})
export class GithubIssue extends AIPredictable {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => GithubRepository,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'repository_id'},
    },
  )
  repositoryId: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'github_id', dataType: 'bigint'},
  })
  githubId: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'github_issue_number'},
  })
  githubIssueNumber: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'title'},
  })
  title: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'status'},
  })
  status: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'description'},
  })
  description: string;

  @hasOne(() => AIPrediction, {keyTo: 'sourceId'})
  aiPrediction?: AIPrediction | null;

  @hasMany(() => IssueAssignment, {keyTo: 'issueId'})
  issueAssignments?: IssueAssignment[];

  constructor(data?: Partial<GithubIssue>) {
    super(data);
  }
}

export type GithubIssueRelations = {
  repository?: GithubRepository;
  aiPrediction?: AIPrediction | null;
  issueAssignments?: IssueAssignment[];
};

export type GithubIssueWithRelations = GithubIssue & GithubIssueRelations;
