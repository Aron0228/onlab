import {repository} from '@loopback/repository';
import {GithubRepository, GithubRepositoryRelations} from '../../models';
import {GithubRepositoryRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const GithubRepositoryBaseCrudController = createBaseCrudController<
  GithubRepository,
  typeof GithubRepository.prototype.id,
  GithubRepositoryRelations
>('/githubRepositories');

export class GithubRepositoryController extends GithubRepositoryBaseCrudController {
  constructor(
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
  ) {
    super(githubRepositoryRepository);
  }
}
