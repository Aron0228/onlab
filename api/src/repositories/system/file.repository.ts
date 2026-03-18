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
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import util from 'util';

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

  public async upload(request: Request, response: Response) {
    const uploadPath = process.env.UPLOAD_PATH || 'uploads/';
    const upload = util.promisify(multer({dest: uploadPath}).array('file'));
    const unlink = util.promisify(fs.unlink);

    await upload(request, response);

    console.log(request.file);

    const files = request.files as Express.Multer.File[];
    const uploadedFiles = [];

    for (const file of files) {
      const originalPath = file.path;

      const processedPath = originalPath;

      try {
        const data = {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: fs.statSync(processedPath).size,
          path: processedPath,
        };

        const createdFile = await this.create(data);
        uploadedFiles.push(createdFile);
      } catch (error) {
        console.error('Document upload error:', error);
        await unlink(originalPath).catch(() => {});
        uploadedFiles.push({
          error: error.message,
          originalName: file.originalname,
        });
      }
    }

    return uploadedFiles.length === 1 ? uploadedFiles[0] : uploadedFiles;
  }

  public async preview(id: typeof File.prototype.id, response: Response) {
    const file = await this.findById(id);
    const absolutePath = path.resolve(file.path);

    response.setHeader('Content-Type', file.mimeType);
    response.sendFile(absolutePath);

    return response;
  }

  public async download(id: typeof File.prototype.id, response: Response) {
    const file = await this.findById(id);
    if (!file) {
      throw new HttpErrors.NotFound('File not found!');
    }
    const absolutePath = path.resolve(file.path);

    response.setHeader('Content-Type', file.mimeType);
    response.download(absolutePath, file.originalName);

    return response;
  }
}
