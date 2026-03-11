import {repository} from '@loopback/repository';
import {Workspace, WorkspaceRelations} from '../../models';
import {WorkspaceRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const WorkspaceBaseCrudController = createBaseCrudController<
  Workspace,
  typeof Workspace.prototype.id,
  WorkspaceRelations
>('/workspaces');

export class WorkspaceController extends WorkspaceBaseCrudController {
  constructor(
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
  ) {
    super(workspaceRepository);
  }
}
