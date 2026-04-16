import {Getter, inject} from '@loopback/core';
import {
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  NewsFeedEntry,
  NewsFeedEntryExpertiseAssoc,
  NewsFeedEntryRelations,
  NewsFeedEntryWithRelations,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserExpertiseAssocRepository} from './user-expertise-assoc.repository';
import {NewsFeedEntryExpertiseAssocRepository} from './news-feed-entry-expertise-assoc.repository';

export class NewsFeedEntryRepository extends DefaultCrudRepository<
  NewsFeedEntry,
  typeof NewsFeedEntry.prototype.id,
  NewsFeedEntryRelations
> {
  public readonly expertiseAssocs: HasManyRepositoryFactory<
    NewsFeedEntryExpertiseAssoc,
    typeof NewsFeedEntry.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('NewsFeedEntryExpertiseAssocRepository')
    private newsFeedEntryExpertiseAssocRepositoryGetter: Getter<NewsFeedEntryExpertiseAssocRepository>,
    @repository.getter('UserExpertiseAssocRepository')
    private userExpertiseAssocRepositoryGetter: Getter<UserExpertiseAssocRepository>,
  ) {
    super(NewsFeedEntry, dataSource);

    this.expertiseAssocs = this.createHasManyRepositoryFactoryFor(
      'expertiseAssocs',
      newsFeedEntryExpertiseAssocRepositoryGetter,
    );

    registerInclusionResolvers(NewsFeedEntry, this);
  }

  public async findPersonalizedFeed(
    workspaceId: number,
    userId: number,
  ): Promise<NewsFeedEntryWithRelations[]> {
    const userExpertiseAssocRepository =
      await this.userExpertiseAssocRepositoryGetter();
    const userExpertiseAssocs = await userExpertiseAssocRepository.find({
      where: {userId},
      include: ['expertise'],
    });

    const workspaceExpertiseIds = userExpertiseAssocs
      .filter(assoc => assoc.expertise?.workspaceId === workspaceId)
      .map(assoc => assoc.expertiseId);

    if (!workspaceExpertiseIds.length) {
      const entries = await this.find({where: {workspaceId}});
      return sortNewsFeedEntries(entries);
    }

    const assocRepository =
      await this.newsFeedEntryExpertiseAssocRepositoryGetter();
    const entryAssocs = await assocRepository.find({
      where: {
        expertiseId: {inq: workspaceExpertiseIds},
      },
      include: ['newsFeedEntry'],
    });

    const uniqueEntries = Array.from(
      new Map(
        entryAssocs
          .filter(
            (
              assoc,
            ): assoc is NewsFeedEntryExpertiseAssoc & {
              newsFeedEntry: NewsFeedEntry;
            } => assoc.newsFeedEntry?.workspaceId === workspaceId,
          )
          .map(assoc => [assoc.newsFeedEntryId, assoc.newsFeedEntry] as const),
      ).values(),
    );

    return sortNewsFeedEntries(uniqueEntries);
  }
}

function sortNewsFeedEntries<T extends NewsFeedEntry>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const priorityDifference =
      getPriorityRank(left.sourcePriority) -
      getPriorityRank(right.sourcePriority);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return (
      new Date(right.happenedAt).getTime() - new Date(left.happenedAt).getTime()
    );
  });
}

function getPriorityRank(priority: string | null | undefined): number {
  switch ((priority ?? '').trim().toLowerCase()) {
    case 'very-high':
    case 'very high':
    case 'veryhigh':
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
    case 'unknown':
      return 4;
    default:
      return 5;
  }
}
