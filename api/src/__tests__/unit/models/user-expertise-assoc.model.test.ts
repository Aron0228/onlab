import {describe, expect, it} from 'vitest';

import {
  UserExpertiseAssoc,
  type UserExpertiseAssocWithRelations,
} from '../../../models';

describe('UserExpertiseAssoc model (unit)', () => {
  it('constructs association entities with provided values', () => {
    const model = new UserExpertiseAssoc({
      id: 7,
      userId: 3,
      expertiseId: 11,
    });

    expect(model.id).toBe(7);
    expect(model.userId).toBe(3);
    expect(model.expertiseId).toBe(11);
  });

  it('supports optional relation properties', () => {
    const model: UserExpertiseAssocWithRelations = new UserExpertiseAssoc({
      userId: 3,
      expertiseId: 11,
    });

    expect(model.user).toBeUndefined();
    expect(model.expertise).toBeUndefined();
  });
});
