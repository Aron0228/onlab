import {service} from '@loopback/core';
import {Count, repository, Where} from '@loopback/repository';
import {del, param} from '@loopback/rest';
import {GithubPullRequest, GithubPullRequestRelations} from '../../models';
import {GithubPullRequestRepository} from '../../repositories';
import {PullRequestService} from '../../services';
import {createBaseCrudController} from '../base-crud.controller';

const GithubPullRequestBaseCrudController = createBaseCrudController<
  GithubPullRequest,
  typeof GithubPullRequest.prototype.id,
  GithubPullRequestRelations
>('/githubPullRequests');

export class GithubPullRequestController extends GithubPullRequestBaseCrudController {
  constructor(
    @repository(GithubPullRequestRepository)
    private githubPullRequestRepository: GithubPullRequestRepository,
    @service(PullRequestService)
    private pullRequestService: PullRequestService,
  ) {
    super(githubPullRequestRepository);
  }

  @del('/githubPullRequests/{id}')
  public async deleteById(@param.path.number('id') id: number): Promise<void> {
    await this.pullRequestService.deleteById(id);
  }

  @del('/githubPullRequests')
  public async deleteAll(
    @param.query.object('where') where: Where<GithubPullRequest>,
  ): Promise<Count> {
    return this.pullRequestService.deleteAll(where);
  }
}
