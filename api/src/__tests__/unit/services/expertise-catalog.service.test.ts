import {HttpErrors} from '@loopback/rest';
import {describe, expect, it, vi} from 'vitest';

import {ExpertiseCatalogService} from '../../../services/expertise-catalog.service';
import {Expertise, UserExpertiseAssoc} from '../../../models';

const createService = ({
  expertises = [],
  assignment,
}: {
  expertises?: Expertise[];
  assignment?: UserExpertiseAssoc | null;
} = {}) => {
  const expertiseRepository = {
    find: vi.fn().mockResolvedValue(expertises),
    findById: vi
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(
          expertises.find(expertise => expertise.id === id) ??
            new Expertise({id, workspaceId: 3, name: 'Backend'}),
        ),
      ),
    create: vi
      .fn()
      .mockImplementation((data: Partial<Expertise>) =>
        Promise.resolve(new Expertise({id: 99, ...data})),
      ),
    updateById: vi.fn().mockResolvedValue(undefined),
    replaceById: vi.fn().mockResolvedValue(undefined),
  };
  const userExpertiseAssocRepository = {
    findById: vi
      .fn()
      .mockResolvedValue(
        new UserExpertiseAssoc({id: 7, userId: 4, expertiseId: 1}),
      ),
    findOne: vi.fn().mockResolvedValue(assignment ?? null),
    create: vi
      .fn()
      .mockImplementation((data: Partial<UserExpertiseAssoc>) =>
        Promise.resolve(new UserExpertiseAssoc({id: 10, ...data})),
      ),
    updateById: vi.fn().mockResolvedValue(undefined),
    deleteById: vi.fn().mockResolvedValue(undefined),
  };
  const workspaceAuthorizationService = {
    assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
  };

  return {
    service: new ExpertiseCatalogService(
      expertiseRepository as never,
      userExpertiseAssocRepository as never,
      workspaceAuthorizationService as never,
    ),
    expertiseRepository,
    userExpertiseAssocRepository,
    workspaceAuthorizationService,
  };
};

describe('ExpertiseCatalogService (unit)', () => {
  it('normalizes and creates unique workspace expertise', async () => {
    const {service, expertiseRepository} = createService();

    const expertise = await service.createExpertise({
      workspaceId: 3,
      name: '  Backend   Development ',
      description: '  API and data work  ',
    });

    expect(expertise.name).toBe('Backend Development');
    expect(expertise.description).toBe('API and data work');
    expect(expertiseRepository.create).toHaveBeenCalledWith({
      workspaceId: 3,
      name: 'Backend Development',
      description: 'API and data work',
    });
  });

  it('rejects duplicate expertise names case-insensitively in a workspace', async () => {
    const {service} = createService({
      expertises: [
        new Expertise({id: 1, workspaceId: 3, name: 'Frontend Development'}),
      ],
    });

    await expect(
      service.createExpertise({
        workspaceId: 3,
        name: ' frontend   development ',
      }),
    ).rejects.toBeInstanceOf(HttpErrors.Conflict);
  });

  it('keeps expertise in its original workspace when updating', async () => {
    const {service, expertiseRepository} = createService({
      expertises: [new Expertise({id: 1, workspaceId: 3, name: 'QA'})],
    });

    await service.updateExpertise(1, {
      workspaceId: 44,
      name: ' Quality Assurance ',
      description: '',
    });

    expect(expertiseRepository.updateById).toHaveBeenCalledWith(1, {
      workspaceId: 3,
      name: 'Quality Assurance',
      description: undefined,
    });
  });

  it('assigns existing expertise once and returns an existing assignment', async () => {
    const existingAssignment = new UserExpertiseAssoc({
      id: 6,
      userId: 4,
      expertiseId: 1,
    });
    const {
      service,
      userExpertiseAssocRepository,
      workspaceAuthorizationService,
    } = createService({
      expertises: [new Expertise({id: 1, workspaceId: 3, name: 'Backend'})],
      assignment: existingAssignment,
    });

    await expect(
      service.assignExpertise({userId: 4, expertiseId: 1}),
    ).resolves.toBe(existingAssignment);

    expect(
      workspaceAuthorizationService.assertWorkspaceMember,
    ).toHaveBeenCalledWith(3, 4);
    expect(userExpertiseAssocRepository.create).not.toHaveBeenCalled();
  });

  it('rejects assignment updates that would duplicate an existing user expertise', async () => {
    const {service} = createService({
      expertises: [new Expertise({id: 2, workspaceId: 3, name: 'Frontend'})],
      assignment: new UserExpertiseAssoc({id: 8, userId: 4, expertiseId: 2}),
    });

    await expect(
      service.updateAssignment(7, {userId: 4, expertiseId: 2}),
    ).rejects.toBeInstanceOf(HttpErrors.Conflict);
  });

  it('removes expertise assignments by id', async () => {
    const {service, userExpertiseAssocRepository} = createService();

    await service.removeAssignment(7);

    expect(userExpertiseAssocRepository.deleteById).toHaveBeenCalledWith(7);
  });
});
