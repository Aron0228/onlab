import Model, {attr, belongsTo} from '@warp-drive/legacy/model';
import type Workspace from './workspace';

export default class FileModel extends Model {
  @belongsTo('workspace', {async: false, inverse: 'files'})
  declare workspace: Workspace | null;

  @attr('number') declare workspaceId: number | null;
  @attr('string') declare originalName: string;
  @attr('string') declare mimeType: string;
  @attr('number') declare size: number;
  @attr('string') declare path: string;
}
