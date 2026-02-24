import { JSONAPISerializer } from '@warp-drive/legacy/serializer/json-api';
import { pluralize, singularize } from 'ember-inflector';
import { kebabCase } from 'lodash';

const _pluralize = pluralize as (word: string) => string;
const _singularize = singularize as (word: string) => string;

export default class ApplicationSerializer extends JSONAPISerializer {
  keyForAttribute(key: string): string {
    return key;
  }

  keyForRelationship(key: string): string {
    return key;
  }

  modelNameFromPayloadType(type: string): string {
    return _singularize(kebabCase(type));
  }

  payloadTypeFromModelName(modelName: string): string {
    return _pluralize(kebabCase(modelName));
  }
}
