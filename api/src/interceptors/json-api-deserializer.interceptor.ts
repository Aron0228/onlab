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
  RelationType,
} from '@loopback/repository';
import {Request, RestBindings} from '@loopback/rest';

type JsonRecord = Record<string, unknown>;
type JsonApiResource = {
  attributes?: JsonRecord;
  relationships?: Record<
    string,
    {
      data?: {id?: string | number | null} | Array<{id?: string | number}>;
    }
  >;
};

@injectable({tags: {keys: 'interceptors.json-api-deserializer'}})
export class JsonApiDeserializerInterceptor implements Provider<Interceptor> {
  private readonly jsonApiContentType = 'application/vnd.api+json';

  constructor(
    @inject(RestBindings.Http.REQUEST)
    private request: Request,
  ) {}

  value(): ValueOrPromise<Interceptor> {
    return async (
      invocationCtx: InvocationContext,
      next: () => ValueOrPromise<unknown>,
    ) => {
      if (!this.isJsonApiRequest()) return next();

      const transformedBody = this.deserializeRequestBody(
        this.request.body as JsonRecord,
        this.getEntityClassFromContext(invocationCtx),
      );

      if (!transformedBody) return next();

      this.request.body = transformedBody;
      this.mutateInvocationArgs(invocationCtx, transformedBody);

      return next();
    };
  }

  private isJsonApiRequest(): boolean {
    const contentType = this.request.headers['content-type'];
    if (Array.isArray(contentType)) {
      return contentType.some(value => value.includes(this.jsonApiContentType));
    }
    return (contentType ?? '').includes(this.jsonApiContentType);
  }

  private deserializeRequestBody(
    body: JsonRecord,
    entityClass?: typeof Entity,
  ): unknown {
    if (!this.isRecord(body) || !('data' in body)) return undefined;

    const metadata = entityClass
      ? ModelMetadataHelper.getModelMetadata(entityClass)
      : undefined;
    const modelDefinition =
      metadata instanceof ModelDefinition ? metadata : undefined;

    const data = body.data;
    if (Array.isArray(data)) {
      return data.map(item =>
        this.deserializeResource(item as JsonApiResource, modelDefinition),
      );
    }

    if (!this.isRecord(data)) return undefined;
    return this.deserializeResource(data as JsonApiResource, modelDefinition);
  }

  private deserializeResource(
    resource: JsonApiResource,
    modelDefinition?: ModelDefinition,
  ): JsonRecord {
    const attributes = this.isRecord(resource.attributes)
      ? {...resource.attributes}
      : {};
    const relationships = this.isRecord(resource.relationships)
      ? resource.relationships
      : {};

    if (!modelDefinition) return attributes;

    for (const relation of Object.values(modelDefinition.relations ?? {})) {
      if (relation.type !== RelationType.belongsTo) continue;

      const relationValue = relationships[relation.name];
      if (!this.isRecord(relationValue)) continue;

      const relationshipData = relationValue.data;
      const belongsToRelation = relation as BelongsToDefinition;
      const keyFrom = belongsToRelation.keyFrom;
      if (!keyFrom) continue;

      if (relationshipData === null) {
        attributes[keyFrom] = null;
        continue;
      }

      if (Array.isArray(relationshipData)) continue;
      if (!this.isRecord(relationshipData)) continue;
      if (!('id' in relationshipData)) continue;

      attributes[keyFrom] = relationshipData.id ?? null;
    }

    return attributes;
  }

  private getEntityClassFromContext(
    invocationCtx: InvocationContext,
  ): typeof Entity | undefined {
    const target = invocationCtx.target as {
      repository?: {entityClass?: typeof Entity};
    };
    return target.repository?.entityClass;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === 'object';
  }

  private mutateInvocationArgs(
    invocationCtx: InvocationContext,
    transformedBody: unknown,
  ): void {
    if (!this.isRecord(transformedBody)) return;

    for (const arg of invocationCtx.args) {
      if (!this.isRecord(arg) || !('data' in arg)) continue;

      Object.keys(arg).forEach(key => {
        delete arg[key];
      });
      Object.assign(arg, transformedBody);
      return;
    }
  }
}
