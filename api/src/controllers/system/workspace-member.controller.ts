import {repository} from '@loopback/repository';
import {WorkspaceMember, WorkspaceMemberRelations} from '../../models';
import {WorkspaceMemberRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const WorkspaceMemberBaseCrudController = createBaseCrudController<
  WorkspaceMember,
  typeof WorkspaceMember.prototype.id,
  WorkspaceMemberRelations
>('workspaceMembers');

export class WorkspaceMemberController extends WorkspaceMemberBaseCrudController {
  constructor(
    @repository(WorkspaceMemberRepository)
    private workspaceMemberRepository: WorkspaceMemberRepository,
  ) {
    super(workspaceMemberRepository);
  }
}
