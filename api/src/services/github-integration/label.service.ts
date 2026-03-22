import {BindingScope, injectable} from '@loopback/core';
import {DataObject, repository} from '@loopback/repository';
import {GithubLabel} from '../../models';
import {GithubLabelRepository} from '../../repositories';

@injectable({scope: BindingScope.SINGLETON})
export class LabelService {
  constructor(
    @repository(GithubLabelRepository)
    private githubLabelRepository: GithubLabelRepository,
  ) {}

  public async replaceRepositoryLabels(
    repositoryId: number,
    labels: DataObject<GithubLabel>[],
  ): Promise<void> {
    await this.githubLabelRepository.deleteAll({repositoryId});

    if (!labels.length) {
      return;
    }

    await this.githubLabelRepository.createAll(labels);
  }
}
