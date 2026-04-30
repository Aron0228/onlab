import {service} from '@loopback/core';
import {DataObject} from '@loopback/repository';
import {repository} from '@loopback/repository';
import {intercept} from '@loopback/core';
import {post, requestBody} from '@loopback/rest';
import {IssueAssignment, IssueAssignmentRelations} from '../../models';
import {IssueAssignmentRepository} from '../../repositories';
import {CapacityPlanningSyncService} from '../../services/capacity-planning-sync.service';
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
    @service(CapacityPlanningSyncService)
    private capacityPlanningSyncService: CapacityPlanningSyncService,
  ) {
    super(issueAssignmentRepository);
  }

  @post('/issueAssignments')
  @intercept('interceptors.json-api-deserializer')
  @intercept('interceptors.json-api-serializer')
  override async create(
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<IssueAssignment>,
  ): Promise<IssueAssignment> {
    const createdAssignment = await this.issueAssignmentRepository.create(data);

    try {
      await this.capacityPlanningSyncService.syncIssueAssignment(
        createdAssignment,
      );
    } catch (error) {
      console.error('Capacity planning GitHub sync failed', {
        issueAssignmentId: createdAssignment.id,
        error,
      });
    }

    return createdAssignment;
  }
}
