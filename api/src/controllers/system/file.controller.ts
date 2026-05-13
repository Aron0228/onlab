import {authenticate} from '@loopback/authentication';
import {inject, intercept} from '@loopback/core';
import {Count, Filter, Where, repository} from '@loopback/repository';
import {
  get,
  param,
  post,
  Request,
  Response,
  RestBindings,
} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {File, FileRelations} from '../../models';
import {FileRepository} from '../../repositories';
import {AuditEventService, WorkspaceAuthorizationService} from '../../services';

export class FileController {
  constructor(
    @repository(FileRepository)
    private fileRepository: FileRepository,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
    @inject('services.AuditEventService')
    private auditEventService: AuditEventService,
  ) {}

  @get('/files')
  @authenticate('jwt-header')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<File>,
  ): Promise<File[]> {
    const scopedFilter = await this.scopeFileFilter(userProfile, filter);

    return this.fileRepository.find(scopedFilter);
  }

  @get('/files/count')
  @authenticate('jwt-header')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<File>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeFileFilter(userProfile, {where});

    return this.fileRepository.count(scopedFilter.where);
  }

  @get('/files/{id}')
  @authenticate('jwt-header')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<File> {
    const file = await this.fileRepository.findById(id);
    await this.assertCanAccessFile(userProfile, file);

    return file;
  }

  @get('/Files/{id}/{relationName}')
  @authenticate('jwt-header')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof FileRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<FileRelations[K]> {
    const file = await this.fileRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanAccessFile(userProfile, file);

    return (file as File & FileRelations)[relationName];
  }

  @post('/files/upload')
  @authenticate('jwt-query')
  async upload(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @inject(RestBindings.Http.REQUEST) request: Request,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    const workspaceId = Number(request.query?.workspaceId);

    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    if (Number.isFinite(workspaceId)) {
      await this.workspaceAuthorizationService.assertWorkspaceMember(
        workspaceId,
        userId,
      );
    }

    const result = await this.fileRepository.upload(request, response);
    const files = Array.isArray(result) ? result : [result];

    for (const file of files) {
      if (this.isUploadedFile(file)) {
        await this.auditEventService.record({
          actorUserId: userId,
          workspaceId: file.workspaceId,
          action: 'file.uploaded',
          resourceType: 'file',
          resourceId: String(file.id),
          payload: {
            originalName: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
          },
        });
      }
    }

    return result;
  }

  @get('/files/{id}/download')
  @authenticate('jwt-query')
  async download(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    const file = await this.fileRepository.findById(id);
    await this.assertCanAccessFile(userProfile, file);

    return this.fileRepository.download(id, response);
  }

  @get('/files/{id}/preview')
  @authenticate('jwt-query')
  async preview(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    const file = await this.fileRepository.findById(id);
    await this.assertCanAccessFile(userProfile, file);

    return this.fileRepository.preview(id, response);
  }

  @get('/files/{id}/stream')
  @authenticate('jwt-query')
  async stream(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    const file = await this.fileRepository.findById(id);
    await this.assertCanAccessFile(userProfile, file);

    return this.fileRepository.stream(id, response);
  }

  private async scopeFileFilter(
    userProfile: UserProfile,
    filter: Filter<File> | undefined,
  ): Promise<Filter<File>> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const accessWhere: Where<File> = {workspaceId: {inq: workspaceIds}};

    return {
      ...filter,
      where: filter?.where ? {and: [filter.where, accessWhere]} : accessWhere,
    };
  }

  private async assertCanAccessFile(
    userProfile: UserProfile,
    file: File,
  ): Promise<void> {
    if (!file.workspaceId) {
      return;
    }

    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    await this.workspaceAuthorizationService.assertWorkspaceMember(
      file.workspaceId,
      userId,
    );
  }

  private isUploadedFile(value: unknown): value is File {
    return (
      value instanceof File ||
      (!!value &&
        typeof value === 'object' &&
        'id' in value &&
        'originalName' in value &&
        'mimeType' in value &&
        'size' in value)
    );
  }
}
