import Model, { attr, belongsTo } from '@warp-drive/legacy/model';
import type GithubRepositoryModel from './github-repository';

export default class GithubIssueModel extends Model {
  @belongsTo('github-repository', { async: false, inverse: 'issues' })
  declare repository: GithubRepositoryModel | null;

  @attr('number') declare repositoryId: number;
  @attr('number') declare githubId: number;
  @attr('number') declare githubIssueNumber: number;
  @attr('string') declare title: string;
  @attr('string') declare status: string;
  @attr('string') declare description: string | null;
  @attr('string') declare priority: string | null;
  @attr('string') declare priorityReason: string | null;
}
