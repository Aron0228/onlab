import Model, { attr } from '@warp-drive/legacy/model';

export default class UserModel extends Model {
  @attr('number') declare githubId: number;
  @attr('string') declare username: string;
  @attr('string') declare email: string;
  @attr('string') declare avatarUrl: string;
}
