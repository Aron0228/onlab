import {beforeEach, describe, expect, it, vi} from 'vitest';

const cronJobs: FakeCronJob[] = [];

class FakeCronJob {
  name?: string;
  cronTime: string;
  stopped = false;
  started = false;

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
    this.started = Boolean(options.start);
    cronJobs.push(this);
  }

  onError() {}

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
});
