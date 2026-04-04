import Model, {attr, belongsTo} from '@warp-drive/legacy/model';
import type AIPredictionModel from './ai-prediction';
import type GithubRepositoryModel from './github-repository';

export default class GithubPullRequestModel extends Model {
  @belongsTo('github-repository', {async: false, inverse: null})
  declare repository: GithubRepositoryModel | null;

  @belongsTo('ai-prediction', {async: false, inverse: null})
  declare aiPrediction: AIPredictionModel | null;

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
