import Model, { attr, belongsTo, hasMany } from '@warp-drive/legacy/model';
import type AIPredictionModel from './ai-prediction';
import type GithubPullRequestReviewerModel from './github-pull-request-reviewer';
import type GithubRepositoryModel from './github-repository';

export default class GithubPullRequestModel extends Model {
  @belongsTo('github-repository', { async: false, inverse: null })
  declare repository: GithubRepositoryModel | null;

  @belongsTo('ai-prediction', { async: false, inverse: null })
  declare aiPrediction: AIPredictionModel | null;

  @hasMany('github-pull-request-reviewer', {
    async: false,
    inverse: 'pullRequest',
  })
  declare reviewers: GithubPullRequestReviewerModel[];

  @attr('number') declare repositoryId: number;
  @attr('number') declare githubPrNumber: number;
  @attr('string') declare title: string;
  @attr('string') declare status: string;
  @attr('string') declare description: string | null;
  @attr('number') declare authorId: number | null;

  get priority(): string | null {
    return this.aiPrediction?.priority ?? null;
  }

  get priorityReason(): string | null {
    return this.aiPrediction?.reason ?? null;
  }
}
