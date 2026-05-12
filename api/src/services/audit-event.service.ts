import {BindingScope, injectable} from '@loopback/core';
import {DataObject, Filter, Where, repository} from '@loopback/repository';
import {AuditEvent} from '../models';
import {AuditEventRepository} from '../repositories';

export type RecordAuditEventInput = Omit<
  DataObject<AuditEvent>,
  'id' | 'createdAt'
>;

@injectable({scope: BindingScope.SINGLETON})
export class AuditEventService {
  constructor(
    @repository(AuditEventRepository)
    private auditEventRepository: AuditEventRepository,
  ) {}

  async record(input: RecordAuditEventInput): Promise<AuditEvent | undefined> {
    try {
      return await this.auditEventRepository.create({
        ...input,
        source: input.source ?? 'user',
        payload: input.payload ?? {},
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to record audit event.', error);
      return undefined;
    }
  }

  async findForWorkspace(
    workspaceId: number,
    filter: Filter<AuditEvent> = {},
  ): Promise<AuditEvent[]> {
    return this.auditEventRepository.find({
      ...filter,
      where: {
        ...(filter.where ?? {}),
        workspaceId,
      } as Where<AuditEvent>,
      order: filter.order ?? ['createdAt DESC'],
    });
  }
}
