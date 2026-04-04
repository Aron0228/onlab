import Model, { attr, belongsTo, hasMany } from '@warp-drive/legacy/model';
import type WorkspaceModel from './workspace';
import type GithubIssueModel from './github-issue';

export default class GithubRepositoryModel extends Model {
  @belongsTo('workspace', { async: false, inverse: null })
  declare workspace: WorkspaceModel | null;

  @hasMany('github-issue', { async: false, inverse: 'repository' })
  declare issues: GithubIssueModel[];

  @attr('number') declare workspaceId: number;
  @attr('number') declare githubRepoId: number;
  @attr('string') declare name: string;
  @attr('string') declare fullName: string;
}
