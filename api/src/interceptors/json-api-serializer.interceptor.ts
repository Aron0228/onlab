import {
  inject,
  injectable,
  Interceptor,
  InvocationContext,
  Provider,
  ValueOrPromise,
} from '@loopback/core';
import {
  BelongsToDefinition,
  Entity,
  ModelDefinition,
  ModelMetadataHelper,
  RelationMetadata,
  RelationType,
} from '@loopback/repository';
import {Request, Response, RestBindings} from '@loopback/rest';
import pluralize from 'pluralize';
import {kebabCase} from 'lodash';
import {Serializer} from 'jsonapi-serializer';

type JsonRecord = Record<string, unknown>;

@injectable({tags: {keys: 'interceptors.json-api-serializer'}})
export class JsonApiSerializerInterceptor implements Provider<Interceptor> {
  private url: string;
  private readonly jsonApiContentType = 'application/vnd.api+json';

  constructor(
    @inject(RestBindings.Http.REQUEST)
    private request: Request,
    @inject(RestBindings.Http.RESPONSE)
    private response: Response,
  ) {
    this.url = process.env.API_HOST ?? 'http://localhost:30022';
  }

  value(): ValueOrPromise<Interceptor> {
    return async (
      invocationCtx: InvocationContext,
      next: () => ValueOrPromise<unknown>,
    ) => {
      const result = await next();
      const entityClass = this.getEntityClassFromContext(invocationCtx);

      if (!entityClass) {
        return result;
      }

      const metadata = ModelMetadataHelper.getModelMetadata(entityClass);

      if (!(metadata instanceof ModelDefinition)) return result;

      if (result === null || result === undefined) {
        const payload = {
          links: {self: `${this.url}${this.request.originalUrl}`},
          data: null,
        };
        return this.sendJsonApi(payload);
      }

      const rawRecords = this.asRecordArray(result);
      if (!rawRecords) return result;

      const {records, explicitlyIncludedRelations} =
        this.prepareRecordsForSerialization(rawRecords, metadata);

      const serializer = this.buildJsonApiSerializer(
        metadata,
        records,
        explicitlyIncludedRelations,
        invocationCtx,
      );

      const payload = Array.isArray(result) ? records : records[0];
      return this.sendJsonApi(serializer.serialize(payload));
    };
  }

  private sendJsonApi(payload: unknown): Response {
    this.response.setHeader('Content-Type', this.jsonApiContentType);
    this.response.end(JSON.stringify(payload));
    return this.response;
  }

  private buildJsonApiSerializer(
    modelDefinition: ModelDefinition,
    records: JsonRecord[],
    explicitlyIncludedRelations: Set<string>,
    invocationCtx: InvocationContext,
  ) {
    const jsonApiType = this.toJsonApiType(modelDefinition.name);
    const propertyAttributes = Object.keys(modelDefinition.properties);
    const relationAttributes: string[] = [];
    const relationConfig: Record<string, unknown> = {};
    const relationTypes = new Map<string, string>();

    const relationKeys = Object.keys(modelDefinition.relations ?? {});
    for (const relationKey of relationKeys) {
      const relation = modelDefinition.relations[relationKey];
      if (!records.some(record => record[relation.name] !== undefined)) {
        continue;
      }

      relationAttributes.push(relation.name);
      const relationModelDefinition = this.getRelationModelDefinition(relation);
      relationConfig[relation.name] = {
        ref: 'id',
        included: explicitlyIncludedRelations.has(relation.name),
        attributes: relationModelDefinition
          ? Object.keys(relationModelDefinition.properties)
          : [],
        relationshipLinks: {
          related: (record: JsonRecord) =>
            `${this.url}${this.getRelationHandlerBasePath()}/${String(
              record.id,
            )}/${relation.name}`,
        },
      };

      const relationType = this.getRelationJsonApiType(relationModelDefinition);
      if (relationType) relationTypes.set(relation.name, relationType);
    }

    return new Serializer(jsonApiType, {
      id: 'id',
      attributes: [...propertyAttributes, ...relationAttributes],
      keyForAttribute: (attribute: string) => attribute,
      dataLinks: {
        self: (record: JsonRecord) =>
          this.buildResourceSelfLink(record, invocationCtx),
      },
      topLevelLinks: {self: `${this.url}${this.request.originalUrl}`},
      typeForAttribute: (attribute: string) => relationTypes.get(attribute),
      ...relationConfig,
    });
  }

  private prepareRecordsForSerialization(
    records: JsonRecord[],
    modelDefinition: ModelDefinition,
  ): {records: JsonRecord[]; explicitlyIncludedRelations: Set<string>} {
    const explicitlyIncludedRelations = new Set<string>();

    const normalized = records.map(record => {
      const copy: JsonRecord = {...record};

      for (const relation of Object.values(modelDefinition.relations ?? {})) {
        const relationValue = copy[relation.name];
        if (this.isLoadedRelationValue(relationValue)) {
          explicitlyIncludedRelations.add(relation.name);
          continue;
        }

        if (relation.type !== RelationType.belongsTo) continue;
        if (relationValue !== undefined) continue;

        const belongsToRelation = relation as BelongsToDefinition;
        const keyFrom = belongsToRelation.keyFrom;
        if (!keyFrom) continue;

        const foreignKeyValue = copy[keyFrom];
        if (foreignKeyValue === undefined) continue;

        copy[relation.name] =
          foreignKeyValue === null ? null : {id: foreignKeyValue};
      }

      return copy;
    });

    return {records: normalized, explicitlyIncludedRelations};
  }

  private getRelationJsonApiType(
    relationModelDefinition?: ModelDefinition,
  ): string | undefined {
    if (!relationModelDefinition) return undefined;
    return this.toJsonApiType(relationModelDefinition.name);
  }

  private getRelationModelDefinition(
    relation: RelationMetadata,
  ): ModelDefinition | undefined {
    try {
      const targetModel = relation.target();
      const metadata = ModelMetadataHelper.getModelMetadata(targetModel);
      if (!(metadata instanceof ModelDefinition)) return undefined;
      return metadata;
    } catch {
      return undefined;
    }
  }

  private getEntityClassFromContext(
    invocationCtx: InvocationContext,
  ): typeof Entity | undefined {
    const target = invocationCtx.target as {
      repository?: {entityClass?: typeof Entity};
    };
    return target.repository?.entityClass;
  }

  private asRecordArray(value: unknown): JsonRecord[] | undefined {
    if (Array.isArray(value)) {
      return value.every(item => this.isRecord(item))
        ? (value as JsonRecord[])
        : undefined;
    }

    if (!this.isRecord(value)) return undefined;
    return [value];
  }

  private isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === 'object';
  }

  private isLoadedRelationValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.some(item => this.isRecord(item));
    return this.isRecord(value);
  }

  private toJsonApiType(modelName: string) {
    return pluralize(kebabCase(modelName));
  }

  private getRelationHandlerBasePath(): string {
    const path = this.getCollectionPath();
    if (!path.startsWith('/')) return `/${this.capitalizeFirst(path)}`;

    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex <= 0) {
      return `/${this.capitalizeFirst(path.slice(1))}`;
    }

    const prefix = path.slice(0, lastSlashIndex + 1);
    const lastSegment = path.slice(lastSlashIndex + 1);
    return `${prefix}${this.capitalizeFirst(lastSegment)}`;
  }

  private capitalizeFirst(value: string): string {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private getCollectionPath(): string {
    const path = this.request.path;
    const idParam = this.request.params?.id;

    if (
      typeof idParam === 'string' &&
      idParam.length > 0 &&
      path.endsWith(`/${idParam}`)
    ) {
      const basePath = path.slice(0, -`/${idParam}`.length);
      return basePath || '/';
    }

    return path;
  }

  private buildResourceSelfLink(
    record: JsonRecord,
    invocationCtx: InvocationContext,
  ): string {
    const recordId = String(record.id);
    const isFindById =
      invocationCtx.targetName?.includes('findById') ??
      this.request.path.endsWith(`/${record.id}`);

    return isFindById
      ? `${this.url}${this.request.path}`
      : `${this.url}${this.getCollectionPath()}/${recordId}`;
  }
}
