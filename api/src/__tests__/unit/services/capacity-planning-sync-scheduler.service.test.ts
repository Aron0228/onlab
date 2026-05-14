import {beforeEach, describe, expect, it, vi} from 'vitest';

const cronJobs: FakeCronJob[] = [];

class FakeCronJob {
  name?: string;
  cronTime: string;
  stopped = false;
  started = false;
  onTick: () => void;

  constructor(options: {
    name?: string;
    cronTime: string;
    start?: boolean;
    onTick: () => void;
  }) {
    this.name = options.name;
    this.cronTime = options.cronTime;
    this.onTick = options.onTick;
    this.started = Boolean(options.start);
    cronJobs.push(this);
  }

  stop() {
    this.stopped = true;
  }
}

vi.mock('@loopback/cron', () => ({
  CronJob: FakeCronJob,
}));

describe('CapacityPlanningSyncSchedulerService (unit)', () => {
  let syncService: Record<string, ReturnType<typeof vi.fn>>;
  let service: import('../../../services/capacity-planning-sync-scheduler.service').CapacityPlanningSyncSchedulerService;

  beforeEach(async () => {
    cronJobs.length = 0;
    syncService = {
      syncActiveCapacityPlans: vi.fn().mockResolvedValue(1),
    };
    const module =
      await import('../../../services/capacity-planning-sync-scheduler.service');
    service = new module.CapacityPlanningSyncSchedulerService(
      syncService as never,
    );
  });

  it('starts one active plan sync cron job and stops it', async () => {
    await service.start();
    await service.start();

    expect(cronJobs).toHaveLength(1);
    expect(cronJobs[0]).toMatchObject({
      name: 'capacity-planning-active-plan-sync',
      cronTime: '*/15 * * * *',
      started: true,
    });

    await service.stop();

    expect(cronJobs[0].stopped).toBe(true);
  });

  it('runs active plan sync on cron ticks and logs failures', async () => {
    await service.start();

    cronJobs[0].onTick();
    await Promise.resolve();

    expect(syncService.syncActiveCapacityPlans).toHaveBeenCalled();

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    syncService.syncActiveCapacityPlans.mockRejectedValueOnce(
      new Error('GitHub failed'),
    );

    cronJobs[0].onTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith(
      'Capacity planning active plan sync failed',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
    consoleError.mockRestore();
  });
});
