import Model, { attr, belongsTo } from '@warp-drive/legacy/model';
import type ExpertiseModel from './expertise';
import type NewsFeedEntryModel from './news-feed-entry';

export default class NewsFeedEntryExpertiseAssocModel extends Model {
  @belongsTo('news-feed-entry', { async: false, inverse: 'expertiseAssocs' })
  declare newsFeedEntry: NewsFeedEntryModel | null;

  @belongsTo('expertise', { async: false, inverse: null })
  declare expertise: ExpertiseModel | null;

  @attr('number') declare newsFeedEntryId: number;
  @attr('number') declare expertiseId: number;
}
