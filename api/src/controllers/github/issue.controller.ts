import {service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors, post, requestBody} from '@loopback/rest';
import {GithubIssue, GithubIssueRelations} from '../../models';
import {
  GithubIssueRepository,
  GithubRepositoryRepository,
  WorkspaceRepository,
} from '../../repositories';
import {
  GithubService,
  IssuePriorityService,
  type IssuePriorityPrediction,
  QueueService,
} from '../../services';
import {createBaseCrudController} from '../base-crud.controller';

const GithubIssueBaseCrudController = createBaseCrudController<
  GithubIssue,
  typeof GithubIssue.prototype.id,
  GithubIssueRelations
>('/githubIssues');

export class GithubIssueController extends GithubIssueBaseCrudController {
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
    @service(QueueService)
    private queueService: QueueService,
  ) {
    super(githubIssueRepository);
  }

  @post('/githubIssues/analyzePriority')
  public async analyzePriority(
    @requestBody()
    body: {
      repositoryId: number;
      title: string;
      description: string | null;
    },
  ): Promise<IssuePriorityPrediction> {
    const {title, description} = this.validateDraft(body);

    await this.getRepositoryContext(body.repositoryId);

    return this.issuePriorityService.predictIssuePriority({
      title,
      description,
    });
  }

  @post('/githubIssues/createWithPriority')
  public async createWithPriority(
    @requestBody()
    body: {
      repositoryId: number;
      title: string;
      description: string | null;
    },
  ): Promise<{
    queued: true;
  }> {
    const {title, description} = this.validateDraft(body);
    await this.getRepositoryContext(body.repositoryId);
    await this.queueService.enqueueGithubIssueCreation({
      repositoryId: body.repositoryId,
      title,
      description,
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

  private async getRepositoryContext(repositoryId: number): Promise<{
    installationId: number;
    repository: Awaited<ReturnType<GithubRepositoryRepository['findById']>>;
  }> {
    const repository =
      await this.githubRepositoryRepository.findById(repositoryId);
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
}
