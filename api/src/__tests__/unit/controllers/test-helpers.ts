import {beforeEach, describe, expect, it, vi} from 'vitest';

type CrudRepositoryMock = {
  find: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  updateAll: ReturnType<typeof vi.fn>;
  updateById: ReturnType<typeof vi.fn>;
  replaceById: ReturnType<typeof vi.fn>;
  deleteById: ReturnType<typeof vi.fn>;
  deleteAll: ReturnType<typeof vi.fn>;
};

type CrudController = {
  find(filter?: unknown): Promise<unknown>;
  count(where?: unknown): Promise<{count: number}>;
  findById(id: number | string): Promise<unknown>;
  getRelation?(id: number | string, relationName: string): Promise<unknown>;
  create(data: unknown): Promise<unknown>;
  updateAll(where: unknown, data: unknown): Promise<{count: number}>;
  updateById(id: number | string, data: unknown): Promise<void>;
  replaceById(id: number | string, data: unknown): Promise<void>;
  deleteById(id: number | string): Promise<void>;
  deleteAll(where: unknown): Promise<{count: number}>;
};

type CrudSuiteOptions = {
  controllerName: string;
  createController: (repository: CrudRepositoryMock) => CrudController;
  id: number | string;
  filter?: unknown;
  where?: unknown;
  entityFactory: () => unknown;
  createPayloadFactory: () => unknown;
  updatePayloadFactory: () => unknown;
  relationName?: string;
  relationValueFactory?: () => unknown;
};

export const createCrudRepositoryMock = (): CrudRepositoryMock => ({
  find: vi.fn(),
  count: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  updateAll: vi.fn(),
  updateById: vi.fn(),
  replaceById: vi.fn(),
  deleteById: vi.fn(),
  deleteAll: vi.fn(),
});

export const describeCrudController = ({
  controllerName,
  createController,
  id,
  filter = {where: {id}},
  where = {id},
  entityFactory,
  createPayloadFactory,
  updatePayloadFactory,
  relationName,
  relationValueFactory,
}: CrudSuiteOptions) => {
  describe(`${controllerName} inherited CRUD methods`, () => {
    let repository: CrudRepositoryMock;
    let controller: CrudController;

    beforeEach(() => {
      repository = createCrudRepositoryMock();
      controller = createController(repository);
    });

    it('finds resources', async () => {
      const entity = entityFactory();
      repository.find.mockResolvedValue([entity]);

      await expect(controller.find(filter)).resolves.toEqual([entity]);
      expect(repository.find).toHaveBeenCalledWith(filter);
    });

    it('counts resources', async () => {
      repository.count.mockResolvedValue({count: 3});

      await expect(controller.count(where)).resolves.toEqual({count: 3});
      expect(repository.count).toHaveBeenCalledWith(where);
    });

    it('finds resources by id', async () => {
      const entity = entityFactory();
      repository.findById.mockResolvedValue(entity);

      await expect(controller.findById(id)).resolves.toEqual(entity);
      expect(repository.findById).toHaveBeenCalledWith(id);
    });

    if (relationName && relationValueFactory) {
      it('gets relations by name', async () => {
        const relationValue = relationValueFactory();
        const entity = {
          ...(entityFactory() as object),
          [relationName]: relationValue,
        };
        repository.findById.mockResolvedValue(entity);

        await expect(
          controller.getRelation?.(id, relationName),
        ).resolves.toEqual(relationValue);
        expect(repository.findById).toHaveBeenCalledWith(id, {
          include: [relationName],
        });
      });
    }

    it('creates resources from deserialized JSON:API attributes', async () => {
      const payload = createPayloadFactory();
      const entity = entityFactory();
      repository.create.mockResolvedValue(entity);

      await expect(controller.create(payload)).resolves.toEqual(entity);
      expect(repository.create).toHaveBeenCalledWith(payload);
    });

    it('updates matching resources from deserialized JSON:API attributes', async () => {
      const payload = updatePayloadFactory();
      repository.updateAll.mockResolvedValue({count: 1});

      await expect(controller.updateAll(where, payload)).resolves.toEqual({
        count: 1,
      });
      expect(repository.updateAll).toHaveBeenCalledWith(payload, where);
    });

    it('updates resources by id from deserialized JSON:API attributes', async () => {
      const payload = updatePayloadFactory();
      repository.updateById.mockResolvedValue(undefined);

      await expect(controller.updateById(id, payload)).resolves.toBeUndefined();
      expect(repository.updateById).toHaveBeenCalledWith(id, payload);
    });

    it('replaces resources by id from deserialized JSON:API attributes', async () => {
      const payload = createPayloadFactory();
      repository.replaceById.mockResolvedValue(undefined);

      await expect(
        controller.replaceById(id, payload),
      ).resolves.toBeUndefined();
      expect(repository.replaceById).toHaveBeenCalledWith(id, payload);
    });

    it('deletes resources by id', async () => {
      repository.deleteById.mockResolvedValue(undefined);

      await expect(controller.deleteById(id)).resolves.toBeUndefined();
      expect(repository.deleteById).toHaveBeenCalledWith(id);
    });

    it('deletes all matching resources', async () => {
      repository.deleteAll.mockResolvedValue({count: 2});

      await expect(controller.deleteAll(where)).resolves.toEqual({count: 2});
      expect(repository.deleteAll).toHaveBeenCalledWith(where);
    });
  });
};
