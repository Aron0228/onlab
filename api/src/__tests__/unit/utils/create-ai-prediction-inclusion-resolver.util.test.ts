import {describe, expect, it, vi} from 'vitest';

import {Entity} from '@loopback/repository';
import {createAIPredictionInclusionResolver} from '../../../utils';

class TestPredictable extends Entity {
  id: number;

  constructor(data: {id: number}) {
    super();
    this.id = data.id;
  }
}

describe('createAIPredictionInclusionResolver (unit)', () => {
  it('returns nulls and skips repository access when no valid ids are present', async () => {
    const getter = vi.fn();
    const resolver = createAIPredictionInclusionResolver(
      'github-issue',
      'issue-priority',
      getter as never,
    );

    const result = await resolver(
      [new TestPredictable({id: Number.NaN})] as never,
      {} as never,
    );

    expect(result).toEqual([null]);
    expect(getter).not.toHaveBeenCalled();
  });

  it('loads predictions by source id and preserves entity order', async () => {
    const find = vi.fn().mockResolvedValue([
      {
        id: 2,
        sourceId: 22,
        priority: 'High',
      },
      {
        id: 1,
        sourceId: 11,
        priority: 'Low',
      },
    ]);
    const getter = vi.fn().mockResolvedValue({find});
    const resolver = createAIPredictionInclusionResolver(
      'github-pull-request',
      'pull-request-merge-risk',
      getter as never,
    );

    const result = await resolver(
      [
        new TestPredictable({id: 11}),
        new TestPredictable({id: 22}),
        new TestPredictable({id: 33}),
      ] as never,
      {} as never,
    );

    expect(find).toHaveBeenCalledWith({
      where: {
        sourceType: 'github-pull-request',
        predictionType: 'pull-request-merge-risk',
        sourceId: {inq: [11, 22, 33]},
      },
    });
    expect(result).toEqual([
      {id: 1, sourceId: 11, priority: 'Low'},
      {id: 2, sourceId: 22, priority: 'High'},
      null,
    ]);
  });
});
