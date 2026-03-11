import {
  DefaultCrudRepository,
  Entity,
  ModelDefinition,
  ModelMetadataHelper,
} from '@loopback/repository';

export function registerInclusionResolvers<
  T extends Entity,
  ID,
  Relations extends object = object,
>(
  modelClass: typeof Entity,
  repository: DefaultCrudRepository<T, ID, Relations>,
): void {
  const modelMetadata = ModelMetadataHelper.getModelMetadata(
    modelClass,
  ) as ModelDefinition;

  for (const relation of Object.values(modelMetadata.relations ?? {})) {
    const relationProperty = (repository as unknown as Record<string, unknown>)[
      relation.name
    ] as {inclusionResolver?: unknown} | undefined;

    if (relationProperty?.inclusionResolver) {
      repository.registerInclusionResolver(
        relation.name,
        relationProperty.inclusionResolver as never,
      );
    }
  }
}
