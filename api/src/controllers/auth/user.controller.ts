import {authenticate} from '@loopback/authentication';
import {inject, intercept} from '@loopback/core';
import {Count, Filter, Where, repository} from '@loopback/repository';
import {get, HttpErrors, param, post} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {User, UserRelations} from '../../models';
import {
  UserRepository,
  WorkspaceMemberRepository,
  WorkspaceRepository,
} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';

@authenticate('jwt-header')
export class UserController {
  constructor(
    @repository(UserRepository)
    private userRepository: UserRepository,
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @repository(WorkspaceMemberRepository)
    private workspaceMemberRepository: WorkspaceMemberRepository,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/users')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<User>,
  ): Promise<User[]> {
    const scopedFilter = await this.scopeUserFilter(userProfile, filter);

    return this.userRepository.find(scopedFilter);
  }

  @get('/users/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<User>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeUserFilter(userProfile, {where});

    return this.userRepository.count(scopedFilter.where);
  }

  @get('/users/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<User> {
    await this.assertCanViewUser(userProfile, id);

    return this.userRepository.findById(id);
  }

  @get('/Users/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof UserRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<UserRelations[K]> {
    await this.assertCanViewUser(userProfile, id);

    const entity: User & UserRelations = await this.userRepository.findById(
      id,
      {
        include: [relationName as string],
      },
    );

    return entity[relationName];
  }

  @post('/users/deleteProfile')
  public async deleteProfile() {
    return {
      message: 'Not implemented',
    };
  }

  private async scopeUserFilter(
    userProfile: UserProfile,
    filter: Filter<User> | undefined,
  ): Promise<Filter<User>> {
    const userIds = await this.accessibleUserIds(userProfile);
    const accessWhere: Where<User> = {id: {inq: userIds}};

    return {
      ...filter,
      where: filter?.where ? {and: [filter.where, accessWhere]} : accessWhere,
    };
  }

  private async assertCanViewUser(
    userProfile: UserProfile,
    requestedUserId: number,
  ): Promise<void> {
    const userIds = await this.accessibleUserIds(userProfile);

    if (!userIds.includes(requestedUserId)) {
      throw new HttpErrors.Forbidden('You do not have access to this user.');
    }
  }

  private async accessibleUserIds(userProfile: UserProfile): Promise<number[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const ownedWorkspaces = await this.workspaceRepository.find({
      where: {ownerId: userId},
    });
    const allWorkspaceIds = Array.from(
      new Set([
        ...workspaceIds,
        ...ownedWorkspaces.map(workspace => workspace.id),
      ]),
    );
    const members = await this.workspaceMemberRepository.find({
      where: {workspaceId: {inq: allWorkspaceIds}},
    });

    return Array.from(
      new Set(
        [
          userId,
          ...ownedWorkspaces.map(workspace => workspace.ownerId),
          ...members.map(member => member.userId),
        ].filter((id): id is number => typeof id === 'number'),
      ),
    );
  }
}
