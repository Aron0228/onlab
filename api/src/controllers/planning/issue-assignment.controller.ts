import {repository} from '@loopback/repository';
import {IssueAssignment, IssueAssignmentRelations} from '../../models';
import {IssueAssignmentRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const IssueAssignmentBaseCrudController = createBaseCrudController<
  IssueAssignment,
  typeof IssueAssignment.prototype.id,
  IssueAssignmentRelations
>('issueAssignments');

export class IssueAssignmentController extends IssueAssignmentBaseCrudController {
  constructor(
    @repository(IssueAssignmentRepository)
    private issueAssignmentRepository: IssueAssignmentRepository,
  ) {
    super(issueAssignmentRepository);
  }
}
