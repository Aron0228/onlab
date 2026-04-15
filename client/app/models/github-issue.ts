import Model, { attr, belongsTo, hasMany } from '@warp-drive/legacy/model';
import type AIPredictionModel from './ai-prediction';
import type GithubRepositoryModel from './github-repository';
import type IssueAssignmentModel from './issue-assignment';

export default class GithubIssueModel extends Model {
  @belongsTo('github-repository', { async: false, inverse: 'issues' })
  declare repository: GithubRepositoryModel | null;

  @belongsTo('ai-prediction', { async: false, inverse: null })
  declare aiPrediction: AIPredictionModel | null;

  @hasMany('issue-assignment', {
    async: false,
    inverse: 'issue',
  })
  declare issueAssignments: IssueAssignmentModel[];

  @attr('number') declare repositoryId: number;
  @attr('number') declare githubId: number;
  @attr('number') declare githubIssueNumber: number;
  @attr('string') declare title: string;
  @attr('string') declare status: string;
  @attr('string') declare description: string | null;

  get priority(): string | null {
    return this.aiPrediction?.priority ?? null;
  }

  get priorityReason(): string | null {
    return this.aiPrediction?.reason ?? null;
  }
}
