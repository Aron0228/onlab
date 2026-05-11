import {beforeEach, describe, expect, it, vi} from 'vitest';

const cronJobs: FakeCronJob[] = [];

class FakeCronJob {
  name?: string;
  cronTime: string;
  stopped = false;
  started = false;
  onTick: () => void;
  errorHandler?: (error: Error) => void;

  constructor(options: {
    name?: string;
    cronTime: string;
    start?: boolean;
    onTick: () => void;
  }) {
    if (options.cronTime === 'invalid') {
      throw new Error('Invalid cron');
    }

    this.name = options.name;
    this.cronTime = options.cronTime;
    this.onTick = options.onTick;
    this.started = Boolean(options.start);
    cronJobs.push(this);
  }

  onError(handler: (error: Error) => void) {
    this.errorHandler = handler;
  }

  stop() {
    this.stopped = true;
  }
}

vi.mock('@loopback/cron', () => ({
  CronJob: FakeCronJob,
}));

describe('PrReviewReminderSchedulerService (unit)', () => {
  let workspaceRepository: Record<string, ReturnType<typeof vi.fn>>;
  let reminderService: Record<string, ReturnType<typeof vi.fn>>;
  let service: import('../../../services').PrReviewReminderSchedulerService;

  beforeEach(async () => {
    cronJobs.length = 0;
    workspaceRepository = {
      find: vi.fn().mockResolvedValue([
        {
          id: 4,
          prReviewReminderCron: '*/15 * * * *',
        },
      ]),
    };
    reminderService = {
      remindWorkspace: vi.fn().mockResolvedValue(0),
    };
    const module = await import('../../../services');
    service = new module.PrReviewReminderSchedulerService(
      workspaceRepository as never,
      reminderService as never,
    );
  });

  it('creates and stops dynamic workspace reminder jobs', async () => {
    await service.start();

    expect(cronJobs.map(job => job.name)).toEqual([
      'pr-review-reminder-workspace-4',
      'pr-review-reminder-refresh',
    ]);
    expect(cronJobs.every(job => job.started)).toBe(true);

    await service.stop();

    expect(cronJobs.every(job => job.stopped)).toBe(true);
  });

  it('removes workspace jobs when cron configuration is cleared', async () => {
    await service.refreshWorkspaceJobs();

    workspaceRepository.find.mockResolvedValueOnce([
      {
        id: 4,
        prReviewReminderCron: null,
      },
    ]);

    await service.refreshWorkspaceJobs();

    expect(cronJobs[0].stopped).toBe(true);
  });

  it('does not start duplicate refresh jobs if start is called twice', async () => {
    await service.start();
    await service.start();

    expect(cronJobs.map(job => job.name)).toEqual([
      'pr-review-reminder-workspace-4',
      'pr-review-reminder-refresh',
    ]);
  });

  it('updates changed workspace cron expressions and removes deleted workspace jobs', async () => {
    await service.refreshWorkspaceJobs();

    workspaceRepository.find.mockResolvedValueOnce([
      {
        id: 4,
        prReviewReminderCron: '*/5 * * * *',
      },
      {
        id: 5,
        prReviewReminderCron: '*/10 * * * *',
      },
    ]);

    await service.refreshWorkspaceJobs();

    expect(cronJobs[0].stopped).toBe(true);
    expect(cronJobs.map(job => job.name)).toEqual([
      'pr-review-reminder-workspace-4',
      'pr-review-reminder-workspace-4',
      'pr-review-reminder-workspace-5',
    ]);

    workspaceRepository.find.mockResolvedValueOnce([
      {
        id: 5,
        prReviewReminderCron: '*/10 * * * *',
      },
    ]);

    await service.refreshWorkspaceJobs();

    expect(cronJobs[1].stopped).toBe(true);
    expect(cronJobs[2].stopped).toBe(false);
  });

  it('skips workspaces without ids and ignores invalid cron expressions', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    workspaceRepository.find.mockResolvedValueOnce([
      {
        prReviewReminderCron: '*/5 * * * *',
      },
      {
        id: 8,
        prReviewReminderCron: 'invalid',
      },
    ]);

    await service.refreshWorkspaceJobs();

    expect(cronJobs).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      'Invalid PR review reminder cron expression',
      expect.objectContaining({
        workspaceId: 8,
        cronExpression: 'invalid',
      }),
    );
    warnSpy.mockRestore();
  });

  it('runs reminder ticks and refresh ticks through cron callbacks', async () => {
    await service.start();

    cronJobs[0].onTick();
    cronJobs[1].onTick();
    await Promise.resolve();

    expect(reminderService.remindWorkspace).toHaveBeenCalledWith(4);
    expect(workspaceRepository.find).toHaveBeenCalledTimes(2);
  });
});
