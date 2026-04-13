import {describe, expect, it} from 'vitest';

import {Expertise} from '../../../models';

describe('Expertise model (unit)', () => {
  it('constructs expertise entities with provided values', () => {
    const model = new Expertise({
      id: 4,
      name: 'Backend',
      description: 'Owns API and schema changes.',
      workspaceId: 12,
    });

    expect(model.id).toBe(4);
    expect(model.name).toBe('Backend');
    expect(model.description).toBe('Owns API and schema changes.');
    expect(model.workspaceId).toBe(12);
  });

  it('allows relation properties to be assigned', () => {
    const model = new Expertise({
      name: 'Frontend',
      workspaceId: 9,
    });

    model.userExpertiseAssocs = [];

    expect(model.userExpertiseAssocs).toEqual([]);
  });
});
