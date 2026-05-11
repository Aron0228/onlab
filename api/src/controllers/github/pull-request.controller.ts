import {authenticate} from '@loopback/authentication';
import {inject, intercept, service} from '@loopback/core';
import {
  Count,
  DataObject,
  Filter,
  Where,
  repository,
} from '@loopback/repository';
import {del, get, param, patch, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {GithubPullRequest, GithubPullRequestRelations} from '../../models';
import {
  GithubPullRequestRepository,
  GithubRepositoryRepository,
} from '../../repositories';
import {
  PullRequestService,
  WorkspaceAuthorizationService,
} from '../../services';

@authenticate('jwt-header')
export class GithubPullRequestController {
  constructor(
    @repository(GithubPullRequestRepository)
    private githubPullRequestRepository: GithubPullRequestRepository,
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @service(PullRequestService)
    private pullRequestService: PullRequestService,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/githubPullRequests')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<GithubPullRequest>,
  ): Promise<GithubPullRequest[]> {
    const scopedFilter = await this.scopePullRequestFilter(userProfile, filter);

    return this.githubPullRequestRepository.find(scopedFilter);
  }

  @get('/githubPullRequests/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<GithubPullRequest>,
  ): Promise<Count> {
    const scopedFilter = await this.scopePullRequestFilter(userProfile, {
      where,
    });

    return this.githubPullRequestRepository.count(scopedFilter.where);
  }

  @get('/githubPullRequests/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<GithubPullRequest> {
    const pullRequest = await this.githubPullRequestRepository.findById(id);
    await this.assertCanViewPullRequest(userProfile, pullRequest);

    return pullRequest;
  }

  @get('/GithubPullRequests/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof GithubPullRequestRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<GithubPullRequestRelations[K]> {
    const pullRequest = await this.githubPullRequestRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewPullRequest(userProfile, pullRequest);

    return (pullRequest as GithubPullRequest & GithubPullRequestRelations)[
      relationName
    ];
  }

  @patch('/githubPullRequests/{id}')
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
    data: DataObject<GithubPullRequest>,
  ): Promise<void> {
    const pullRequest = await this.githubPullRequestRepository.findById(id);
    await this.assertCanUseRepository(userProfile, pullRequest.repositoryId);

    return this.githubPullRequestRepository.updateById(id, data);
  }

  @put('/githubPullRequests/{id}')
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
    data: DataObject<GithubPullRequest>,
  ): Promise<void> {
    const pullRequest = await this.githubPullRequestRepository.findById(id);
    await this.assertCanUseRepository(userProfile, pullRequest.repositoryId);

    return this.githubPullRequestRepository.replaceById(id, data);
  }

  @del('/githubPullRequests/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const pullRequest = await this.githubPullRequestRepository.findById(id);
    const repository = await this.githubRepositoryRepository.findById(
      pullRequest.repositoryId,
    );
    await this.assertCanManageWorkspace(userProfile, repository.workspaceId);

    await this.pullRequestService.deleteById(id);
  }

  @del('/githubPullRequests')
  public async deleteAll(): Promise<Count> {
    return {count: 0};
  }

  private async scopePullRequestFilter(
    userProfile: UserProfile,
    filter: Filter<GithubPullRequest> | undefined,
  ): Promise<Filter<GithubPullRequest>> {
    const repositoryIds = await this.accessibleRepositoryIds(userProfile);
    const repositoryWhere: Where<GithubPullRequest> = {
      repositoryId: {inq: repositoryIds},
    };

    return {
      ...filter,
      where: filter?.where
        ? {and: [filter.where, repositoryWhere]}
        : repositoryWhere,
    };
  }

  private async accessibleRepositoryIds(
    userProfile: UserProfile,
  ): Promise<number[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const repositories = await this.githubRepositoryRepository.find({
      where: {workspaceId: {inq: workspaceIds}},
    });

    return repositories.map(repository => repository.id);
  }

  private async assertCanViewPullRequest(
    userProfile: UserProfile,
    pullRequest: GithubPullRequest,
  ): Promise<void> {
    await this.assertCanUseRepository(userProfile, pullRequest.repositoryId);
  }

  private async assertCanUseRepository(
    userProfile: UserProfile,
    repositoryId: number | undefined,
  ): Promise<void> {
    const repository = await this.githubRepositoryRepository.findById(
      Number(repositoryId),
    );
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      repository.workspaceId,
      userId,
    );
  }

  private async assertCanManageWorkspace(
    userProfile: UserProfile,
    workspaceId: number,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      workspaceId,
      userId,
    );
  }
}
