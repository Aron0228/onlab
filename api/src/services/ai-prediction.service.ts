import {BindingScope, injectable} from '@loopback/core';
import {DataObject, repository} from '@loopback/repository';
import {
  AIPrediction,
  AIEstimationConfidence,
  AIPredictionFinding,
  AIPredictionReviewerSuggestion,
  AIPredictionSourceType,
  AIPredictionType,
} from '../models';
import {AIPredictionRepository} from '../repositories';

export type AIPredictionWrite = {
  sourceType: AIPredictionSourceType;
  sourceId: number;
  predictionType: AIPredictionType;
  priority?: string | null;
  reason?: string | null;
  findings?: AIPredictionFinding[] | null;
  reviewerSuggestions?: AIPredictionReviewerSuggestion[] | null;
  estimatedHours?: number | null;
  estimationConfidence?: AIEstimationConfidence | null;
};

type NormalizedAIPredictionWrite = {
  sourceType: AIPredictionSourceType;
  sourceId: number;
  predictionType: AIPredictionType;
  priority?: string;
  reason?: string;
  findings?: AIPredictionFinding[];
  reviewerSuggestions?: AIPredictionReviewerSuggestion[];
  estimatedHours?: number;
  estimationConfidence?: AIEstimationConfidence;
};

@injectable({scope: BindingScope.SINGLETON})
export class AIPredictionService {
  constructor(
    @repository(AIPredictionRepository)
    private aiPredictionRepository: AIPredictionRepository,
  ) {}

  public async syncPrediction(input: AIPredictionWrite): Promise<void> {
    const prediction = this.normalizePrediction(input);
    const existingPrediction = await this.aiPredictionRepository.findOne({
      where: this.getIdentityWhere(prediction),
    });

    if (!this.hasPredictionContent(prediction)) {
      if (existingPrediction) {
        await this.aiPredictionRepository.deleteById(existingPrediction.id);
      }
      return;
    }

    if (!existingPrediction) {
      await this.aiPredictionRepository.create(
        prediction as DataObject<AIPrediction>,
      );
      return;
    }

    await this.aiPredictionRepository.updateById(existingPrediction.id, {
      priority: prediction.priority,
      reason: prediction.reason,
      findings: prediction.findings,
      reviewerSuggestions: prediction.reviewerSuggestions,
      estimatedHours: prediction.estimatedHours,
      estimationConfidence: prediction.estimationConfidence,
    });
  }

  public async createPredictionsBulk(
    inputs: AIPredictionWrite[],
  ): Promise<void> {
    const predictions = inputs
      .map(input => this.normalizePrediction(input))
      .filter(prediction => this.hasPredictionContent(prediction));

    if (!predictions.length) {
      return;
    }

    await this.aiPredictionRepository.createAll(
      predictions as DataObject<AIPrediction>[],
    );
  }

  public async deleteForSources(
    sourceType: AIPredictionSourceType,
    sourceIds: number[],
    predictionType?: AIPredictionType,
  ): Promise<void> {
    const normalizedIds = Array.from(
      new Set(
        sourceIds
          .map(sourceId => Number(sourceId))
          .filter(sourceId => Number.isInteger(sourceId)),
      ),
    );

    if (!normalizedIds.length) {
      return;
    }

    await this.aiPredictionRepository.deleteAll({
      sourceType,
      sourceId: {inq: normalizedIds},
      ...(predictionType ? {predictionType} : {}),
    });
  }

  private getIdentityWhere(prediction: AIPredictionWrite) {
    return {
      sourceType: prediction.sourceType,
      sourceId: prediction.sourceId,
      predictionType: prediction.predictionType,
    };
  }

  private normalizePrediction(
    input: AIPredictionWrite,
  ): NormalizedAIPredictionWrite {
    return {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      predictionType: input.predictionType,
      priority: input.priority?.trim() || undefined,
      reason: input.reason?.trim() || undefined,
      findings: input.findings ?? undefined,
      reviewerSuggestions: input.reviewerSuggestions ?? undefined,
      estimatedHours:
        typeof input.estimatedHours === 'number' &&
        Number.isInteger(input.estimatedHours)
          ? input.estimatedHours
          : undefined,
      estimationConfidence: input.estimationConfidence ?? undefined,
    };
  }

  private hasPredictionContent(
    prediction: NormalizedAIPredictionWrite,
  ): boolean {
    return Boolean(
      prediction.priority ||
      prediction.reason ||
      prediction.findings?.length ||
      prediction.reviewerSuggestions?.length ||
      typeof prediction.estimatedHours === 'number' ||
      prediction.estimationConfidence,
    );
  }
}
