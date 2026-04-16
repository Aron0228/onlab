import Model, { attr, hasMany } from '@warp-drive/legacy/model';
import type NewsFeedEntryExpertiseAssocModel from './news-feed-entry-expertise-assoc';

export default class NewsFeedEntryModel extends Model {
  @hasMany('news-feed-entry-expertise-assoc', {
    async: false,
    inverse: 'newsFeedEntry',
  })
  declare expertiseAssocs: NewsFeedEntryExpertiseAssocModel[];

  @attr('number') declare workspaceId: number;
  @attr('string') declare sourceType:
    | 'workspace-member'
    | 'github-issue'
    | 'github-pull-request'
    | 'capacity-plan';
  @attr('number') declare sourceId: number;
  @attr('string') declare eventAction: 'created' | 'updated';
  @attr('string') declare title: string;
  @attr('string') declare summary: string;
  @attr('string') declare aiReason: string | null;
  @attr('string') declare sourcePriority: string | null;
  @attr('string') declare sourceDisplayNumber: string | null;
  @attr('string') declare repositoryName: string | null;
  @attr('date') declare happenedAt: string;

  get isClickable(): boolean {
    return this.sourceType !== 'workspace-member';
  }
}
