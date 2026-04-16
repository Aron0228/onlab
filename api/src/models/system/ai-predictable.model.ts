import {Entity, model} from '@loopback/repository';

export const NEWS_FEED_SOURCE_TYPES = [
  'workspace-member',
  'github-issue',
  'github-pull-request',
  'capacity-plan',
] as const;

export type NewsFeedSourceType = (typeof NEWS_FEED_SOURCE_TYPES)[number];

export type NewsFeedPredictableSettings = {
  enabled: boolean;
  sourceType: NewsFeedSourceType;
};

@model()
export class AIPredictable extends Entity {}
