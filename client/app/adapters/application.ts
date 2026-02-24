import { JSONAPIAdapter } from '@warp-drive/legacy/adapter/json-api';
import { camelCase } from 'lodash';
import { pluralize } from 'ember-inflector';

const _pluralize = pluralize as (word: string) => string;

export default class ApplicationAdapter extends JSONAPIAdapter {
  host = 'http://localhost:30022';

  pathForType(modelName: string): string {
    return _pluralize(camelCase(modelName));
  }
}
