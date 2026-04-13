import {Entity, model, property} from '@loopback/repository';

export const AI_PREDICTION_SOURCE_TYPES = [
  'github-issue',
  'github-pull-request',
] as const;
export type AIPredictionSourceType =
  (typeof AI_PREDICTION_SOURCE_TYPES)[number];

export const AI_PREDICTION_TYPES = [
  'issue-priority',
  'pull-request-merge-risk',
] as const;
export type AIPredictionType = (typeof AI_PREDICTION_TYPES)[number];

export type AIPredictionFinding = {
  path: string;
  line?: number;
  body: string;
  lineContent?: string;
};

export type AIPredictionReviewerSuggestion = {
  userId: number;
  username: string;
  reason: string;
};

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'ai_prediction'},
  },
})
export class AIPrediction extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [...AI_PREDICTION_SOURCE_TYPES],
    },
    postgresql: {columnName: 'source_type'},
  })
  sourceType: AIPredictionSourceType;

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
      enum: [...AI_PREDICTION_TYPES],
    },
    postgresql: {columnName: 'prediction_type'},
  })
  predictionType: AIPredictionType;

  @property({
    type: 'string',
    postgresql: {columnName: 'priority'},
  })
  priority?: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'reason'},
  })
  reason?: string;

  @property({
    type: 'array',
    itemType: 'object',
    postgresql: {columnName: 'findings', dataType: 'jsonb'},
  })
  findings?: AIPredictionFinding[];

  @property({
    type: 'array',
    itemType: 'object',
    postgresql: {columnName: 'reviewer_suggestions', dataType: 'jsonb'},
  })
  reviewerSuggestions?: AIPredictionReviewerSuggestion[];

  @property({
    type: 'date',
    postgresql: {columnName: 'created_at'},
  })
  createdAt?: string;

  @property({
    type: 'date',
    postgresql: {columnName: 'updated_at'},
  })
  updatedAt?: string;

  constructor(data?: Partial<AIPrediction>) {
    super(data);
  }
}

export type AIPredictionRelations = object;
export type AIPredictionWithRelations = AIPrediction & AIPredictionRelations;
