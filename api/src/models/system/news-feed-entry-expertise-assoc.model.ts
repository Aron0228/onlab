import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Expertise} from './expertise.model';
import {NewsFeedEntry} from './news-feed-entry.model';

@model({
  settings: {
    forceId: false,
    postgresql: {
      schema: 'system',
      table: 'news_feed_entry_expertise_assoc',
    },
  },
})
export class NewsFeedEntryExpertiseAssoc extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => NewsFeedEntry,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'news_feed_entry_id'},
    },
  )
  newsFeedEntryId: number;

  @belongsTo(
    () => Expertise,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'expertise_id'},
    },
  )
  expertiseId: number;

  constructor(data?: Partial<NewsFeedEntryExpertiseAssoc>) {
    super(data);
  }
}

export type NewsFeedEntryExpertiseAssocRelations = {
  newsFeedEntry?: NewsFeedEntry;
  expertise?: Expertise;
};

export type NewsFeedEntryExpertiseAssocWithRelations =
  NewsFeedEntryExpertiseAssoc & NewsFeedEntryExpertiseAssocRelations;
