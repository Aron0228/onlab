import {authenticate} from '@loopback/authentication';
import {repository} from '@loopback/repository';
import {File, FileRelations} from '../../models';
import {FileRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';
import {
  get,
  param,
  post,
  Request,
  Response,
  RestBindings,
} from '@loopback/rest';
import {inject} from '@loopback/core';

const FileBaseCrudController = createBaseCrudController<
  File,
  typeof File.prototype.id,
  FileRelations
>('/files');

export class FileController extends FileBaseCrudController {
  constructor(
    @repository(FileRepository) private fileRepository: FileRepository,
  ) {
    super(fileRepository);
  }

  @post('/files/upload')
  @authenticate('jwt-query')
  async upload(
    @inject(RestBindings.Http.REQUEST) request: Request,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    return this.fileRepository.upload(request, response);
  }

  @get('/files/{id}/download')
  @authenticate('jwt-query')
  async download(
    @param.path.number('id') id: number,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    return this.fileRepository.download(id, response);
  }

  @get('/files/{id}/preview')
  @authenticate('jwt-query')
  async preview(
    @param.path.number('id') id: number,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    return this.fileRepository.preview(id, response);
  }
}
