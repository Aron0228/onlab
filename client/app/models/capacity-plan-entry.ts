import Model, { attr, belongsTo } from '@warp-drive/legacy/model';
import type CapacityPlanModel from './capacity-plan';
import type UserModel from './user';

export default class CapacityPlanEntryModel extends Model {
  @belongsTo('capacity-plan', { async: false, inverse: 'entries' })
  declare capacityPlan: CapacityPlanModel | null;

  @belongsTo('user', { async: false, inverse: 'capacityPlanEntries' })
  declare user: UserModel | null;

  @attr('number') declare capacityPlanId: number;
  @attr('number') declare userId: number;
  @attr('number') declare capacityHours: number;
}
