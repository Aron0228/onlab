import {intercept} from '@loopback/core';
import {
  Count,
  DataObject,
  DefaultCrudRepository,
  Entity,
  Filter,
  Where,
} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';

export function createBaseCrudController<
  T extends Entity,
  ID,
  Relations extends object = object,
>(basePath: string) {
  const capitalizedBasePath =
    basePath.charAt(0).toUpperCase() + basePath.slice(1);

  abstract class BaseCrudController {
    constructor(public repository: DefaultCrudRepository<T, ID, Relations>) {}

    @get(`/${basePath}`)
    @intercept('interceptors.json-api-serializer')
    public async find(
      @param.query.object('filter') filter?: Filter<T>,
    ): Promise<T[]> {
      return this.repository.find(filter);
    }

    @get(`/${basePath}/{id}`)
    @intercept('interceptors.json-api-serializer')
    public async findById(@param.path.string('id') id: ID): Promise<T> {
      return this.repository.findById(id);
    }

    @get(`/${capitalizedBasePath}/{id}/{relationName}`)
    @intercept('interceptors.json-api-serializer')
    public async getRelation<K extends keyof Relations>(
      @param.path.string('id') id: ID,
      @param.path.string('relationName') relationName: K,
    ): Promise<Relations[K]> {
      const entity: T & Relations = await this.repository.findById(id, {
        include: [relationName as string],
      });

      return entity[relationName];
    }

    @post(`/${basePath}`)
    @intercept('interceptors.json-api-deserializer')
    @intercept('interceptors.json-api-serializer')
    public async create(
      @requestBody({
        content: {
          'application/vnd.api+json': {
            schema: {
              'x-ts-type': Object,
            },
          },
        },
      })
      data: DataObject<T>,
    ): Promise<T> {
      return this.repository.create(data);
    }

    @patch(`/${basePath}`)
    @intercept('interceptors.json-api-deserializer')
    public async updateAll(
      @param.query.object('where') where: Where<T>,
      @requestBody({
        content: {
          'application/vnd.api+json': {
            schema: {
              'x-ts-type': Object,
            },
          },
        },
      })
      data: DataObject<T>,
    ): Promise<Count> {
      return this.repository.updateAll(data, where);
    }

    @patch(`/${basePath}/{id}`)
    @intercept('interceptors.json-api-deserializer')
    public async updateById(
      @param.path.string('id') id: ID,
      @requestBody({
        content: {
          'application/vnd.api+json': {
            schema: {
              'x-ts-type': Object,
            },
          },
        },
      })
      data: DataObject<T>,
    ): Promise<void> {
      return this.repository.updateById(id, data);
    }

    @put(`/${basePath}/{id}`)
    @intercept('interceptors.json-api-deserializer')
    public async replaceById(
      @param.path.string('id') id: ID,
      @requestBody({
        content: {
          'application/vnd.api+json': {
            schema: {
              'x-ts-type': Object,
            },
          },
        },
      })
      data: DataObject<T>,
    ): Promise<void> {
      return this.repository.replaceById(id, data);
    }

    @del(`/${basePath}/{id}`)
    public async deleteById(@param.path.string('id') id: ID): Promise<void> {
      return this.repository.deleteById(id);
    }

    @del(`/${basePath}`)
    public async deleteAll(
      @param.query.object('where') where: Where<T>,
    ): Promise<Count> {
      return this.repository.deleteAll(where);
    }
  }

  return BaseCrudController;
}
