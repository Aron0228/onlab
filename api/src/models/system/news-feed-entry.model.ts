import {Entity, hasMany, model, property} from '@loopback/repository';
import {
  NewsFeedSourceType,
  NEWS_FEED_SOURCE_TYPES,
} from './ai-predictable.model';
import {NewsFeedEntryExpertiseAssoc} from './news-feed-entry-expertise-assoc.model';

export const NEWS_FEED_EVENT_ACTIONS = ['created', 'updated'] as const;
export type NewsFeedEventAction = (typeof NEWS_FEED_EVENT_ACTIONS)[number];

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'news_feed_entry'},
  },
})
export class NewsFeedEntry extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'workspace_id'},
  })
  workspaceId: number;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [...NEWS_FEED_SOURCE_TYPES],
    },
    postgresql: {columnName: 'source_type'},
  })
  sourceType: NewsFeedSourceType;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'source_id'},
  })
  sourceId: number;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [...NEWS_FEED_EVENT_ACTIONS],
    },
    postgresql: {columnName: 'event_action'},
  })
  eventAction: NewsFeedEventAction;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'title'},
  })
  title: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'summary'},
  })
  summary: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'ai_reason'},
  })
  aiReason?: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'source_priority'},
  })
  sourcePriority?: string | null;

  @property({
    type: 'string',
    postgresql: {columnName: 'source_display_number'},
  })
  sourceDisplayNumber?: string | null;

  @property({
    type: 'string',
    postgresql: {columnName: 'repository_name'},
  })
  repositoryName?: string | null;

  @property({
    type: 'date',
    required: true,
    postgresql: {columnName: 'happened_at'},
  })
  happenedAt: string;

  @hasMany(() => NewsFeedEntryExpertiseAssoc, {keyTo: 'newsFeedEntryId'})
  expertiseAssocs?: NewsFeedEntryExpertiseAssoc[];

  constructor(data?: Partial<NewsFeedEntry>) {
    super(data);
  }
}

export type NewsFeedEntryRelations = {
  expertiseAssocs?: NewsFeedEntryExpertiseAssoc[];
};

export type NewsFeedEntryWithRelations = NewsFeedEntry & NewsFeedEntryRelations;
