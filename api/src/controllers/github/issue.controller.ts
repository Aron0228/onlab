import {authenticate} from '@loopback/authentication';
import {inject, intercept, service} from '@loopback/core';
import {
  Count,
  DataObject,
  Filter,
  Where,
  repository,
} from '@loopback/repository';
import {
  del,
  get,
  HttpErrors,
  param,
  patch,
  post,
  put,
  requestBody,
} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {
  GithubIssue,
  GithubIssueRelations,
  GithubRepository,
} from '../../models';
import {
  GithubIssueRepository,
  GithubRepositoryRepository,
  WorkspaceRepository,
} from '../../repositories';
import {
  GithubService,
  IssuePriorityService,
  IssueService,
  type IssuePriorityPrediction,
  QueueService,
  WorkspaceAuthorizationService,
} from '../../services';

@authenticate('jwt-header')
export class GithubIssueController {
  constructor(
    @repository(GithubIssueRepository)
    private githubIssueRepository: GithubIssueRepository,
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @service(GithubService)
    private githubService: GithubService,
    @service(IssuePriorityService)
    private issuePriorityService: IssuePriorityService,
    @service(IssueService)
    private issueService: IssueService,
    @service(QueueService)
    private queueService: QueueService,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/githubIssues')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<GithubIssue>,
  ): Promise<GithubIssue[]> {
    const scopedFilter = await this.scopeIssueFilter(userProfile, filter);

    return this.githubIssueRepository.find(scopedFilter);
  }

  @get('/githubIssues/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<GithubIssue>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeIssueFilter(userProfile, {where});

    return this.githubIssueRepository.count(scopedFilter.where);
  }

  @get('/githubIssues/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<GithubIssue> {
    const issue = await this.githubIssueRepository.findById(id);
    await this.assertCanViewIssue(userProfile, issue);

    return issue;
  }

  @get('/GithubIssues/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof GithubIssueRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<GithubIssueRelations[K]> {
    const issue = await this.githubIssueRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewIssue(userProfile, issue);

    return (issue as GithubIssue & GithubIssueRelations)[relationName];
  }

  @post('/githubIssues')
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
    data: DataObject<GithubIssue>,
  ): Promise<GithubIssue> {
    await this.assertCanUseRepository(userProfile, data.repositoryId);

    return this.githubIssueRepository.create(data);
  }

  @patch('/githubIssues/{id}')
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
    data: DataObject<GithubIssue>,
  ): Promise<void> {
    const issue = await this.githubIssueRepository.findById(id);
    await this.assertCanUseRepository(userProfile, issue.repositoryId);

    return this.githubIssueRepository.updateById(id, data);
  }

  @put('/githubIssues/{id}')
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
    data: DataObject<GithubIssue>,
  ): Promise<void> {
    const issue = await this.githubIssueRepository.findById(id);
    await this.assertCanUseRepository(userProfile, issue.repositoryId);

    return this.githubIssueRepository.replaceById(id, data);
  }

  @del('/githubIssues/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const issue = await this.githubIssueRepository.findById(id);
    const repository = await this.githubRepositoryRepository.findById(
      issue.repositoryId,
    );
    await this.assertCanManageWorkspace(userProfile, repository.workspaceId);

    await this.issueService.deleteById(id);
  }

  @del('/githubIssues')
  public async deleteAll(): Promise<Count> {
    return {count: 0};
  }

  @post('/githubIssues/analyzePriority')
  public async analyzePriority(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @requestBody()
    body: {
      repositoryId: number;
      title: string;
      description: string | null;
    },
  ): Promise<IssuePriorityPrediction> {
    const {title, description} = this.validateDraft(body);

    const repositoryContext = await this.getRepositoryContext(
      userProfile,
      body.repositoryId,
    );

    return this.issuePriorityService.predictIssuePriority({
      installationId: repositoryContext.installationId,
      repositoryFullName: repositoryContext.repository.fullName,
      workspaceId: repositoryContext.repository.workspaceId,
      title,
      description,
    });
  }

  @post('/githubIssues/createWithPriority')
  public async createWithPriority(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @requestBody()
    body: {
      repositoryId: number;
      title: string;
      description: string | null;
      prediction?: IssuePriorityPrediction | null;
    },
  ): Promise<{
    queued: true;
  }> {
    const {title, description} = this.validateDraft(body);
    await this.getRepositoryContext(userProfile, body.repositoryId);
    const prediction = this.issuePriorityService.normalizePredictionInput(
      body.prediction,
    );

    await this.queueService.enqueueGithubIssueCreation({
      repositoryId: body.repositoryId,
      title,
      description,
      prediction,
    });

    return {
      queued: true,
    };
  }

  private validateDraft(body: {
    title?: string | null;
    description?: string | null;
  }): {
    title: string;
    description: string;
  } {
    const title = body.title?.trim();
    const description = body.description?.trim();

    if (!title) {
      throw new HttpErrors.BadRequest('Issue title is required');
    }

    if (!description) {
      throw new HttpErrors.BadRequest('Issue description is required');
    }

    return {
      title,
      description,
    };
  }

  private async getRepositoryContext(
    userProfile: UserProfile,
    repositoryId: number,
  ): Promise<{
    installationId: number;
    repository: GithubRepository;
  }> {
    const repository =
      await this.githubRepositoryRepository.findById(repositoryId);
    await this.assertCanUseRepository(userProfile, repository.id);

    const workspace = await this.workspaceRepository.findById(
      repository.workspaceId,
    );
    const installationId = Number(workspace.githubInstallationId);

    if (!workspace.githubInstallationId || Number.isNaN(installationId)) {
      throw new HttpErrors.BadRequest(
        'This workspace is not connected to a GitHub installation',
      );
    }

    return {
      installationId,
      repository,
    };
  }

  private async scopeIssueFilter(
    userProfile: UserProfile,
    filter: Filter<GithubIssue> | undefined,
  ): Promise<Filter<GithubIssue>> {
    const repositoryIds = await this.accessibleRepositoryIds(userProfile);
    const repositoryWhere: Where<GithubIssue> = {
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

  private async assertCanViewIssue(
    userProfile: UserProfile,
    issue: GithubIssue,
  ): Promise<void> {
    await this.assertCanUseRepository(userProfile, issue.repositoryId);
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
