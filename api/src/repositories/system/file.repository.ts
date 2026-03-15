import {randomUUID} from 'crypto';
import {createReadStream, createWriteStream} from 'fs';
import {mkdir, stat} from 'fs/promises';
import path from 'path';
import {pipeline} from 'stream/promises';
import {inject, Getter} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {HttpErrors, Request, Response} from '@loopback/rest';
import {PostgresDbDataSource} from '../../datasources';
import {File, FileRelations, Workspace} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {WorkspaceRepository} from './workspace.repository';

export class FileRepository extends DefaultCrudRepository<
  File,
  typeof File.prototype.id,
  FileRelations
> {
  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof File.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
  ) {
    super(File, dataSource);

    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    registerInclusionResolvers(File, this);
  }

  public async upload(
    request: Request,
    response: Response,
    uploadPath?: string,
  ): Promise<File> {
    const originalName =
      this.getSingleValue(request.query.originalName) ??
      this.getSingleValue(request.query.filename) ??
      this.getHeaderValue(request.headers['x-file-name']);

    if (!originalName) {
      throw new HttpErrors.BadRequest(
        'Missing file name. Provide query.originalName or x-file-name header.',
      );
    }

    const workspaceIdValue =
      this.getSingleValue(request.query.workspaceId) ??
      this.getHeaderValue(request.headers['x-workspace-id']);

    const targetDirectory = this.resolveUploadPath(uploadPath);
    await mkdir(targetDirectory, {recursive: true});

    const sanitizedOriginalName = this.sanitizeFileName(originalName);
    const storageName = `${randomUUID()}-${sanitizedOriginalName}`;
    const filePath = path.join(targetDirectory, storageName);

    const writeStream = createWriteStream(filePath);
    await pipeline(request, writeStream);

    const fileStats = await stat(filePath);
    const file = await this.create({
      workspaceId: this.parseWorkspaceId(workspaceIdValue),
      originalName: sanitizedOriginalName,
      mimeType: this.getHeaderValue(request.headers['content-type'])
        ? this.getHeaderValue(request.headers['content-type'])!
        : 'application/octet-stream',
      size: fileStats.size,
      path: filePath,
    });

    response.status(201);

    return file;
  }

  public async download(id: typeof File.prototype.id, response: Response) {
    const file = await this.findById(id);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${this.escapeHeaderValue(file.originalName)}"`,
    );
    response.setHeader('Content-Length', file.size.toString());

    const fileStream = createReadStream(file.path);
    fileStream.on('error', error => {
      response.destroy(error);
    });

    fileStream.pipe(response);

    return response;
  }

  public async preview(id: typeof File.prototype.id, response: Response) {
    const file = await this.findById(id);
    response.setHeader('Content-Type', file.mimeType);

    response.sendFile(file.path);

    return response;
  }

  private resolveUploadPath(uploadPath?: string): string {
    const basePath = uploadPath ?? process.env.UPLOAD_PATH ?? 'uploads';

    return path.resolve(basePath);
  }

  private getHeaderValue(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }

  private getSingleValue(
    value:
      | string
      | string[]
      | number
      | object
      | (string | object)[]
      | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      const firstValue = value[0];
      return typeof firstValue === 'string' ? firstValue : undefined;
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    return typeof value === 'string' ? value : undefined;
  }

  private parseWorkspaceId(
    value: string | undefined,
  ): typeof File.prototype.workspaceId {
    if (!value) {
      return undefined;
    }

    const parsedValue = Number(value);

    if (Number.isNaN(parsedValue)) {
      throw new HttpErrors.BadRequest('workspaceId must be a number.');
    }

    return parsedValue;
  }

  private sanitizeFileName(fileName: string): string {
    return path.basename(fileName).replace(/[^\w.-]/g, '_');
  }

  private escapeHeaderValue(value: string): string {
    return value.replace(/"/g, '\\"');
  }
}
