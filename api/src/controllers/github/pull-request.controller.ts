import {repository} from '@loopback/repository';
import {GithubPullRequest, GithubPullRequestRelations} from '../../models';
import {GithubPullRequestRepository} from '../../repositories';
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
  ) {
    super(githubPullRequestRepository);
  }
}
