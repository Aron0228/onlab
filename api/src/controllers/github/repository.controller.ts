import {authenticate} from '@loopback/authentication';
import {inject, intercept, service} from '@loopback/core';
import {
  Count,
  DataObject,
  Filter,
  Where,
  repository,
} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {GithubRepository, GithubRepositoryRelations} from '../../models';
import {GithubRepositoryRepository} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';

@authenticate('jwt-header')
export class GithubRepositoryController {
  constructor(
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/githubRepositories')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<GithubRepository>,
  ): Promise<GithubRepository[]> {
    const scopedFilter = await this.scopeRepositoryFilter(userProfile, filter);

    return this.githubRepositoryRepository.find(scopedFilter);
  }

  @get('/githubRepositories/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<GithubRepository>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeRepositoryFilter(userProfile, {where});

    return this.githubRepositoryRepository.count(scopedFilter.where);
  }

  @get('/githubRepositories/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<GithubRepository> {
    const repository = await this.githubRepositoryRepository.findById(id);
    await this.assertCanViewRepository(userProfile, repository);

    return repository;
  }

  @get('/GithubRepositories/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof GithubRepositoryRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<GithubRepositoryRelations[K]> {
    const repository = await this.githubRepositoryRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewRepository(userProfile, repository);

    return (repository as GithubRepository & GithubRepositoryRelations)[
      relationName
    ];
  }

  @post('/githubRepositories')
  @intercept('interceptors.json-api-deserializer')
  @intercept('interceptors.json-api-serializer')
  public async create(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<GithubRepository>,
  ): Promise<GithubRepository> {
    await this.assertCanManageRepository(userProfile, data.workspaceId);

    return this.githubRepositoryRepository.create(data);
  }

  @patch('/githubRepositories/{id}')
  @intercept('interceptors.json-api-deserializer')
  public async updateById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<GithubRepository>,
  ): Promise<void> {
    const repository = await this.githubRepositoryRepository.findById(id);
    await this.assertCanManageRepository(userProfile, repository.workspaceId);

    return this.githubRepositoryRepository.updateById(id, data);
  }

  @put('/githubRepositories/{id}')
  @intercept('interceptors.json-api-deserializer')
  public async replaceById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<GithubRepository>,
  ): Promise<void> {
    const repository = await this.githubRepositoryRepository.findById(id);
    await this.assertCanManageRepository(userProfile, repository.workspaceId);

    return this.githubRepositoryRepository.replaceById(id, data);
  }

  @del('/githubRepositories/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const repository = await this.githubRepositoryRepository.findById(id);
    await this.assertCanManageRepository(userProfile, repository.workspaceId);

    return this.githubRepositoryRepository.deleteCascade(id);
  }

  private async scopeRepositoryFilter(
    userProfile: UserProfile,
    filter: Filter<GithubRepository> | undefined,
  ): Promise<Filter<GithubRepository>> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const workspaceWhere: Where<GithubRepository> = {
      workspaceId: {inq: workspaceIds},
    };

    return {
      ...filter,
      where: filter?.where
        ? {and: [filter.where, workspaceWhere]}
        : workspaceWhere,
    };
  }

  private async assertCanViewRepository(
    userProfile: UserProfile,
    repository: GithubRepository,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      repository.workspaceId,
      userId,
    );
  }

  private async assertCanManageRepository(
    userProfile: UserProfile,
    workspaceId: number | undefined,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      Number(workspaceId),
      userId,
    );
  }
}
