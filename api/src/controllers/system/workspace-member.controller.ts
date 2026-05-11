import {authenticate} from '@loopback/authentication';
import {inject, intercept} from '@loopback/core';
import {Count, DataObject, Filter, Where} from '@loopback/repository';
import {repository} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {WorkspaceMember, WorkspaceMemberRelations} from '../../models';
import {WorkspaceMemberRepository} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';

@authenticate('jwt-header')
export class WorkspaceMemberController {
  constructor(
    @repository(WorkspaceMemberRepository)
    private workspaceMemberRepository: WorkspaceMemberRepository,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/workspaceMembers')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<WorkspaceMember>,
  ): Promise<WorkspaceMember[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const scopedWhere =
      await this.workspaceAuthorizationService.mergeWorkspaceMemberAccessWhere(
        filter?.where,
        userId,
      );

    return this.workspaceMemberRepository.find({
      ...filter,
      where: scopedWhere,
    });
  }

  @get('/workspaceMembers/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<WorkspaceMember>,
  ): Promise<Count> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const scopedWhere =
      await this.workspaceAuthorizationService.mergeWorkspaceMemberAccessWhere(
        where,
        userId,
      );

    return this.workspaceMemberRepository.count(scopedWhere);
  }

  @get('/workspaceMembers/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<WorkspaceMember> {
    const member = await this.workspaceMemberRepository.findById(id);
    await this.assertCanViewMember(userProfile, member);

    return member;
  }

  @get('/WorkspaceMembers/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof WorkspaceMemberRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<WorkspaceMemberRelations[K]> {
    const member = await this.workspaceMemberRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewMember(userProfile, member);

    return (member as WorkspaceMember & WorkspaceMemberRelations)[relationName];
  }

  @post('/workspaceMembers')
  @intercept('interceptors.json-api-deserializer')
  @intercept('interceptors.json-api-serializer')
  public async create(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<WorkspaceMember>,
  ): Promise<WorkspaceMember> {
    await this.assertCanManageMember(userProfile, data.workspaceId);

    return this.workspaceMemberRepository.create(data);
  }

  @patch('/workspaceMembers/{id}')
  @intercept('interceptors.json-api-deserializer')
  public async updateById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<WorkspaceMember>,
  ): Promise<void> {
    const member = await this.workspaceMemberRepository.findById(id);
    await this.assertCanManageMember(userProfile, member.workspaceId);

    return this.workspaceMemberRepository.updateById(id, data);
  }

  @put('/workspaceMembers/{id}')
  @intercept('interceptors.json-api-deserializer')
  public async replaceById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<WorkspaceMember>,
  ): Promise<void> {
    const member = await this.workspaceMemberRepository.findById(id);
    await this.assertCanManageMember(userProfile, member.workspaceId);

    return this.workspaceMemberRepository.replaceById(id, data);
  }

  @del('/workspaceMembers/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const member = await this.workspaceMemberRepository.findById(id);
    await this.assertCanManageMember(userProfile, member.workspaceId);

    return this.workspaceMemberRepository.deleteById(id);
  }

  @patch('/workspaceMembers')
  public async updateAll(): Promise<Count> {
    return {count: 0};
  }

  @del('/workspaceMembers')
  public async deleteAll(): Promise<Count> {
    return {count: 0};
  }

  private async assertCanViewMember(
    userProfile: UserProfile,
    member: WorkspaceMember,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      Number(member.workspaceId),
      userId,
    );
  }

  private async assertCanManageMember(
    userProfile: UserProfile,
    workspaceId: number | undefined,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      Number(workspaceId),
      userId,
    );
  }
}
