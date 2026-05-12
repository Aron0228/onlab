import {describe, expect, it, vi} from 'vitest';
import {AuditEventController} from '../../../controllers/system/audit-event.controller';

describe('AuditEventController (unit)', () => {
  const createSubject = () => {
    const auditEventService = {
      findForWorkspace: vi.fn(),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      assertWorkspaceAdminOrOwner: vi.fn().mockResolvedValue('ADMIN'),
    };

    return {
      auditEventService,
      authorization,
      controller: new AuditEventController(
        auditEventService as never,
        authorization as never,
      ),
    };
  };

  it('lists workspace audit events for admins and owners', async () => {
    const {controller, auditEventService, authorization} = createSubject();
    const filter = {limit: 20};
    auditEventService.findForWorkspace.mockResolvedValue([{id: 4}]);

    await expect(
      controller.findForWorkspace({id: 7} as never, 11, filter),
    ).resolves.toEqual([{id: 4}]);

    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      11,
      7,
    );
    expect(auditEventService.findForWorkspace).toHaveBeenCalledWith(11, filter);
  });
});
