import {authenticate} from '@loopback/authentication';
import {inject, intercept} from '@loopback/core';
import {
  Count,
  DataObject,
  Filter,
  Where,
  repository,
} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {WorkspaceAuthorizationService} from '../../services';
import {Invitation, InvitationRelations} from '../../models';
import {InvitationRepository} from '../../repositories';

@authenticate('jwt-header')
export class InvitationController {
  constructor(
    @repository(InvitationRepository)
    private invitationRepository: InvitationRepository,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/invitations')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<Invitation>,
  ): Promise<Invitation[]> {
    const scopedFilter = await this.scopeInvitationFilter(userProfile, filter);

    return this.invitationRepository.find(scopedFilter);
  }

  @get('/invitations/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<Invitation>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeInvitationFilter(userProfile, {where});

    return this.invitationRepository.count(scopedFilter.where);
  }

  @get('/invitations/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<Invitation> {
    const invitation = await this.invitationRepository.findById(id);
    await this.assertCanViewInvitation(userProfile, invitation);

    return invitation;
  }

  @get('/Invitations/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof InvitationRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<InvitationRelations[K]> {
    const invitation = await this.invitationRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewInvitation(userProfile, invitation);

    return (invitation as Invitation & InvitationRelations)[relationName];
  }

  @post('/invitations')
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
    data: DataObject<Invitation>,
  ): Promise<Invitation> {
    await this.assertCanManageInvitation(userProfile, data.workspaceId);

    return this.invitationRepository.create(data);
  }

  @patch('/invitations/{id}')
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
    data: DataObject<Invitation>,
  ): Promise<void> {
    const invitation = await this.invitationRepository.findById(id);
    await this.assertCanManageInvitation(userProfile, invitation.workspaceId);

    return this.invitationRepository.updateById(id, data);
  }

  @put('/invitations/{id}')
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
    data: DataObject<Invitation>,
  ): Promise<void> {
    const invitation = await this.invitationRepository.findById(id);
    await this.assertCanManageInvitation(userProfile, invitation.workspaceId);

    return this.invitationRepository.replaceById(id, data);
  }

  @del('/invitations/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const invitation = await this.invitationRepository.findById(id);
    await this.assertCanManageInvitation(userProfile, invitation.workspaceId);

    return this.invitationRepository.deleteById(id);
  }

  @post('/invitations/accept')
  public async accept(@requestBody() body: {invitationId: number}) {
    return await this.invitationRepository.accept(body.invitationId);
  }

  private async scopeInvitationFilter(
    userProfile: UserProfile,
    filter: Filter<Invitation> | undefined,
  ): Promise<Filter<Invitation>> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const workspaceWhere: Where<Invitation> = {
      workspaceId: {inq: workspaceIds},
    };

    return {
      ...filter,
      where: filter?.where
        ? {and: [filter.where, workspaceWhere]}
        : workspaceWhere,
    };
  }

  private async assertCanViewInvitation(
    userProfile: UserProfile,
    invitation: Invitation,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      invitation.workspaceId,
      userId,
    );
  }

  private async assertCanManageInvitation(
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
