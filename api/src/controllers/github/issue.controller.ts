import {repository} from '@loopback/repository';
import {GithubIssue, GithubIssueRelations} from '../../models';
import {GithubIssueRepository} from '../../repositories';
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
  ) {
    super(githubIssueRepository);
  }
}
