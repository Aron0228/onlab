import {authenticate} from '@loopback/authentication';
import {inject, intercept} from '@loopback/core';
import {Count, DataObject, Filter, Where} from '@loopback/repository';
import {repository} from '@loopback/repository';
import {UserExpertiseAssoc, UserExpertiseAssocRelations} from '../../models';
import {
  ExpertiseRepository,
  UserExpertiseAssocRepository,
} from '../../repositories';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {
  ExpertiseCatalogService,
  WorkspaceAuthorizationService,
} from '../../services';

@authenticate('jwt-header')
export class UserExpertiseAssocController {
  constructor(
    @repository(UserExpertiseAssocRepository)
    private userExpertiseAssocRepository: UserExpertiseAssocRepository,
    @repository(ExpertiseRepository)
    private expertiseRepository: ExpertiseRepository,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
    @inject('services.ExpertiseCatalogService')
    private expertiseCatalogService: ExpertiseCatalogService,
  ) {}

  @get('/userExpertiseAssocs')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<UserExpertiseAssoc>,
  ): Promise<UserExpertiseAssoc[]> {
    const scopedFilter = await this.scopeAssocFilter(userProfile, filter);

    return this.userExpertiseAssocRepository.find(scopedFilter);
  }

  @get('/userExpertiseAssocs/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<UserExpertiseAssoc>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeAssocFilter(userProfile, {where});

    return this.userExpertiseAssocRepository.count(scopedFilter.where);
  }

  @get('/userExpertiseAssocs/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<UserExpertiseAssoc> {
    const assoc = await this.userExpertiseAssocRepository.findById(id);
    await this.assertCanViewAssoc(userProfile, assoc);

    return assoc;
  }

  @get('/UserExpertiseAssocs/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof UserExpertiseAssocRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<UserExpertiseAssocRelations[K]> {
    const assoc = await this.userExpertiseAssocRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewAssoc(userProfile, assoc);

    return (assoc as UserExpertiseAssoc & UserExpertiseAssocRelations)[
      relationName
    ];
  }

  @post('/userExpertiseAssocs')
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
    data: DataObject<UserExpertiseAssoc>,
  ): Promise<UserExpertiseAssoc> {
    await this.assertCanManageAssoc(userProfile, Number(data.expertiseId));

    return this.expertiseCatalogService.assignExpertise(data);
  }

  @patch('/userExpertiseAssocs/{id}')
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
    data: DataObject<UserExpertiseAssoc>,
  ): Promise<void> {
    const assoc = await this.userExpertiseAssocRepository.findById(id);
    await this.assertCanManageAssoc(userProfile, assoc.expertiseId);
    if (data.expertiseId !== undefined) {
      await this.assertCanManageAssoc(userProfile, Number(data.expertiseId));
    }

    return this.expertiseCatalogService.updateAssignment(id, data);
  }

  @put('/userExpertiseAssocs/{id}')
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
    data: DataObject<UserExpertiseAssoc>,
  ): Promise<void> {
    const assoc = await this.userExpertiseAssocRepository.findById(id);
    await this.assertCanManageAssoc(userProfile, assoc.expertiseId);
    await this.assertCanManageAssoc(userProfile, Number(data.expertiseId));

    return this.expertiseCatalogService.updateAssignment(id, data);
  }

  @del('/userExpertiseAssocs/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const assoc = await this.userExpertiseAssocRepository.findById(id);
    await this.assertCanManageAssoc(userProfile, assoc.expertiseId);

    return this.expertiseCatalogService.removeAssignment(id);
  }

  private async scopeAssocFilter(
    userProfile: UserProfile,
    filter: Filter<UserExpertiseAssoc> | undefined,
  ): Promise<Filter<UserExpertiseAssoc>> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const expertises = await this.expertiseRepository.find({
      where: {workspaceId: {inq: workspaceIds}},
    });
    const expertiseIds = expertises.map(expertise => expertise.id);
    const expertiseWhere: Where<UserExpertiseAssoc> = {
      expertiseId: {inq: expertiseIds},
    };

    return {
      ...filter,
      where: filter?.where
        ? {and: [filter.where, expertiseWhere]}
        : expertiseWhere,
    };
  }

  private async assertCanViewAssoc(
    userProfile: UserProfile,
    assoc: UserExpertiseAssoc,
  ): Promise<void> {
    const expertise = await this.expertiseRepository.findById(
      assoc.expertiseId,
    );
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      expertise.workspaceId,
      userId,
    );
  }

  private async assertCanManageAssoc(
    userProfile: UserProfile,
    expertiseId: number,
  ): Promise<void> {
    const expertise = await this.expertiseRepository.findById(expertiseId);
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      expertise.workspaceId,
      userId,
    );
  }
}
