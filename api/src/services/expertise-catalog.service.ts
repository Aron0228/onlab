import {service} from '@loopback/core';
import {DataObject, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Expertise, UserExpertiseAssoc} from '../models';
import {
  ExpertiseRepository,
  UserExpertiseAssocRepository,
} from '../repositories';
import {WorkspaceAuthorizationService} from './workspace-authorization.service';

export class ExpertiseCatalogService {
  constructor(
    @repository(ExpertiseRepository)
    private expertiseRepository: ExpertiseRepository,
    @repository(UserExpertiseAssocRepository)
    private userExpertiseAssocRepository: UserExpertiseAssocRepository,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  async createExpertise(data: DataObject<Expertise>): Promise<Expertise> {
    const workspaceId = Number(data.workspaceId);
    const name = this.normalizeName(data.name);

    if (!workspaceId || !name) {
      throw new HttpErrors.UnprocessableEntity(
        'Workspace expertise requires a workspace and name.',
      );
    }

    await this.assertUniqueExpertiseName(workspaceId, name);

    return this.expertiseRepository.create({
      ...data,
      workspaceId,
      name,
      description: this.normalizeOptionalText(data.description),
    });
  }

  async updateExpertise(
    id: number,
    data: DataObject<Expertise>,
  ): Promise<void> {
    const existing = await this.expertiseRepository.findById(id);
    const name =
      data.name === undefined ? existing.name : this.normalizeName(data.name);

    if (!name) {
      throw new HttpErrors.UnprocessableEntity(
        'Workspace expertise requires a name.',
      );
    }

    await this.assertUniqueExpertiseName(existing.workspaceId, name, id);

    return this.expertiseRepository.updateById(id, {
      ...data,
      workspaceId: existing.workspaceId,
      name,
      description:
        data.description === undefined
          ? existing.description
          : this.normalizeOptionalText(data.description),
    });
  }

  async replaceExpertise(
    id: number,
    data: DataObject<Expertise>,
  ): Promise<void> {
    const existing = await this.expertiseRepository.findById(id);
    const name = this.normalizeName(data.name);

    if (!name) {
      throw new HttpErrors.UnprocessableEntity(
        'Workspace expertise requires a name.',
      );
    }

    await this.assertUniqueExpertiseName(existing.workspaceId, name, id);

    return this.expertiseRepository.replaceById(id, {
      ...data,
      id,
      workspaceId: existing.workspaceId,
      name,
      description: this.normalizeOptionalText(data.description),
    });
  }

  async assignExpertise(
    data: DataObject<UserExpertiseAssoc>,
  ): Promise<UserExpertiseAssoc> {
    const userId = Number(data.userId);
    const expertiseId = Number(data.expertiseId);

    if (!userId || !expertiseId) {
      throw new HttpErrors.UnprocessableEntity(
        'Assigning team expertise requires a user and expertise.',
      );
    }

    const expertise = await this.expertiseRepository.findById(expertiseId);
    await this.assertUserCanReceiveExpertise(expertise.workspaceId, userId);

    const existing = await this.userExpertiseAssocRepository.findOne({
      where: {userId, expertiseId},
    });

    if (existing) {
      return existing;
    }

    return this.userExpertiseAssocRepository.create({userId, expertiseId});
  }

  async updateAssignment(
    id: number,
    data: DataObject<UserExpertiseAssoc>,
  ): Promise<void> {
    const existing = await this.userExpertiseAssocRepository.findById(id);
    const userId = Number(data.userId ?? existing.userId);
    const expertiseId = Number(data.expertiseId ?? existing.expertiseId);

    if (!userId || !expertiseId) {
      throw new HttpErrors.UnprocessableEntity(
        'Assigning team expertise requires a user and expertise.',
      );
    }

    const expertise = await this.expertiseRepository.findById(expertiseId);
    await this.assertUserCanReceiveExpertise(expertise.workspaceId, userId);

    const duplicate = await this.userExpertiseAssocRepository.findOne({
      where: {userId, expertiseId},
    });

    if (duplicate && duplicate.id !== id) {
      throw new HttpErrors.Conflict('User already has this team expertise.');
    }

    return this.userExpertiseAssocRepository.updateById(id, {
      ...data,
      userId,
      expertiseId,
    });
  }

  async removeAssignment(id: number): Promise<void> {
    return this.userExpertiseAssocRepository.deleteById(id);
  }

  private async assertUniqueExpertiseName(
    workspaceId: number,
    name: string,
    ignoreId?: number,
  ): Promise<void> {
    const workspaceExpertises = await this.expertiseRepository.find({
      where: {workspaceId},
    });
    const normalizedName = this.toComparisonKey(name);
    const duplicate = workspaceExpertises.find(
      expertise =>
        expertise.id !== ignoreId &&
        this.toComparisonKey(expertise.name) === normalizedName,
    );

    if (duplicate) {
      throw new HttpErrors.Conflict(
        'Team expertise already exists in this workspace.',
      );
    }
  }

  private async assertUserCanReceiveExpertise(
    workspaceId: number,
    userId: number,
  ): Promise<void> {
    await this.workspaceAuthorizationService.assertWorkspaceMember(
      workspaceId,
      userId,
    );
  }

  private normalizeName(value: string | undefined): string {
    return (value ?? '').trim().replace(/\s+/g, ' ');
  }

  private normalizeOptionalText(
    value: string | null | undefined,
  ): string | undefined {
    const normalized = (value ?? '').trim();
    return normalized.length ? normalized : undefined;
  }

  private toComparisonKey(value: string | undefined): string {
    return this.normalizeName(value).toLocaleLowerCase();
  }
}
