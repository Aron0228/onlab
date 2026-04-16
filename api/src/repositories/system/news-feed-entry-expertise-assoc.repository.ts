import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  Expertise,
  NewsFeedEntry,
  NewsFeedEntryExpertiseAssoc,
  NewsFeedEntryExpertiseAssocRelations,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {ExpertiseRepository} from './expertise.repository';
import {NewsFeedEntryRepository} from './news-feed-entry.repository';

export class NewsFeedEntryExpertiseAssocRepository extends DefaultCrudRepository<
  NewsFeedEntryExpertiseAssoc,
  typeof NewsFeedEntryExpertiseAssoc.prototype.id,
  NewsFeedEntryExpertiseAssocRelations
> {
  public readonly newsFeedEntry: BelongsToAccessor<
    NewsFeedEntry,
    typeof NewsFeedEntryExpertiseAssoc.prototype.id
  >;

  public readonly expertise: BelongsToAccessor<
    Expertise,
    typeof NewsFeedEntryExpertiseAssoc.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('NewsFeedEntryRepository')
    newsFeedEntryRepositoryGetter: Getter<NewsFeedEntryRepository>,
    @repository.getter('ExpertiseRepository')
    expertiseRepositoryGetter: Getter<ExpertiseRepository>,
  ) {
    super(NewsFeedEntryExpertiseAssoc, dataSource);

    this.newsFeedEntry = this.createBelongsToAccessorFor(
      'newsFeedEntry',
      newsFeedEntryRepositoryGetter,
    );
    this.expertise = this.createBelongsToAccessorFor(
      'expertise',
      expertiseRepositoryGetter,
    );

    registerInclusionResolvers(NewsFeedEntryExpertiseAssoc, this);
  }
}
