import {repository} from '@loopback/repository';
import {File, FileRelations} from '../../models';
import {FileRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

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
}
