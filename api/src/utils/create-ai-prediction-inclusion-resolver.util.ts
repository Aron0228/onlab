import {Getter} from '@loopback/core';
import {Entity, InclusionResolver} from '@loopback/repository';
import {
  AIPrediction,
  AIPredictionSourceType,
  AIPredictionType,
} from '../models';
import {AIPredictionRepository} from '../repositories';

export function createAIPredictionInclusionResolver<
  T extends Entity & {id: number},
>(
  sourceType: AIPredictionSourceType,
  predictionType: AIPredictionType,
  aiPredictionRepositoryGetter: Getter<AIPredictionRepository>,
): InclusionResolver<T, AIPrediction> {
  return async entities => {
    const entityIds = Array.from(
      new Set(
        entities
          .map(entity => Number(entity.id))
          .filter(entityId => Number.isInteger(entityId)),
      ),
    );

    if (!entityIds.length) {
      // LoopBack's InclusionResolver type only models `undefined` misses,
      // but the JSON:API serializer needs runtime `null` to clear relations.
      return entities.map(() => null) as unknown as Array<
        AIPrediction | undefined
      >;
    }

    const aiPredictionRepository = await aiPredictionRepositoryGetter();
    const predictions = await aiPredictionRepository.find({
      where: {
        sourceType,
        predictionType,
        sourceId: {inq: entityIds},
      },
    });
    const predictionBySourceId = new Map(
      predictions.map(prediction => [prediction.sourceId, prediction]),
    );

    return entities.map(
      entity => predictionBySourceId.get(entity.id) ?? null,
    ) as unknown as Array<AIPrediction | undefined>;
  };
}
