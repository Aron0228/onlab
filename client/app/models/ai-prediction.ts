import Model, { attr } from '@warp-drive/legacy/model';

export default class AIPredictionModel extends Model {
  @attr('string') declare sourceType: string;
  @attr('number') declare sourceId: number;
  @attr('string') declare predictionType: string;
  @attr('string') declare priority: string | null;
  @attr('string') declare reason: string | null;
}
