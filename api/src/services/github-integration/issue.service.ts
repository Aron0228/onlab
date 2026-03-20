import {BindingScope, injectable} from '@loopback/core';
import {DataObject, repository} from '@loopback/repository';
import {GithubIssue} from '../../models';
import {GithubIssueRepository} from '../../repositories';

@injectable({scope: BindingScope.SINGLETON})
export class IssueService {
  private readonly batchSize = 100;

  constructor(
    @repository(GithubIssueRepository)
    private githubIssueRepository: GithubIssueRepository,
  ) {}

  public async deleteByRepositoryId(repositoryId: number): Promise<void> {
    await this.githubIssueRepository.deleteAll({repositoryId});
  }

  public async saveIssuesBulk(
    issues: DataObject<GithubIssue>[],
  ): Promise<void> {
    if (!issues.length) {
      return;
    }

    for (let index = 0; index < issues.length; index += this.batchSize) {
      const batch = issues.slice(index, index + this.batchSize);
      await this.githubIssueRepository.createAll(batch);
    }
  }
}
