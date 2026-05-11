import {
  BindingScope,
  injectable,
  lifeCycleObserver,
  LifeCycleObserver,
  service,
} from '@loopback/core';
import {CronJob} from '@loopback/cron';
import {repository} from '@loopback/repository';
import {WorkspaceRepository} from '../repositories';
import {PullRequestReviewReminderService} from './pull-request-review-reminder.service';

type WorkspaceReminderJob = {
  cronExpression: string;
  job: CronJob;
};

@lifeCycleObserver('cronJob')
@injectable({scope: BindingScope.SINGLETON})
export class PrReviewReminderSchedulerService implements LifeCycleObserver {
  private readonly workspaceJobs = new Map<number, WorkspaceReminderJob>();
  private refreshJob?: CronJob;
  private hasStarted = false;

  constructor(
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @service(PullRequestReviewReminderService)
    private reminderService: PullRequestReviewReminderService,
  ) {}

  async start(): Promise<void> {
    if (this.hasStarted) {
      console.log('[PR review reminder] Scheduler already started.');
      return;
    }

    this.hasStarted = true;
    console.log('[PR review reminder] Starting scheduler.');
    await this.refreshWorkspaceJobs();

    this.refreshJob = new CronJob({
      name: 'pr-review-reminder-refresh',
      cronTime: '* * * * *',
      onTick: () => {
        void this.refreshWorkspaceJobs();
      },
      start: true,
    });
  }

  async stop(): Promise<void> {
    this.hasStarted = false;
    this.refreshJob?.stop();
    this.refreshJob = undefined;

    for (const {job} of this.workspaceJobs.values()) {
      job.stop();
    }

    this.workspaceJobs.clear();
  }

  async refreshWorkspaceJobs(): Promise<void> {
    const workspaces = await this.workspaceRepository.find();
    const workspaceIds = new Set<number>();
    console.log('[PR review reminder] Refreshing workspace cron jobs.', {
      workspaceCount: workspaces.length,
    });

    for (const workspace of workspaces) {
      if (!workspace.id) {
        continue;
      }

      workspaceIds.add(workspace.id);
      const cronExpression = workspace.prReviewReminderCron?.trim();

      if (!cronExpression) {
        console.log('[PR review reminder] Workspace cron is disabled.', {
          workspaceId: workspace.id,
        });
        this.removeWorkspaceJob(workspace.id);
        continue;
      }

      const existingJob = this.workspaceJobs.get(workspace.id);
      if (existingJob?.cronExpression === cronExpression) {
        continue;
      }

      this.removeWorkspaceJob(workspace.id);
      this.addWorkspaceJob(workspace.id, cronExpression);
    }

    for (const workspaceId of this.workspaceJobs.keys()) {
      if (!workspaceIds.has(workspaceId)) {
        this.removeWorkspaceJob(workspaceId);
      }
    }
  }

  private addWorkspaceJob(workspaceId: number, cronExpression: string): void {
    try {
      const job = new CronJob({
        name: `pr-review-reminder-workspace-${workspaceId}`,
        cronTime: cronExpression,
        onTick: () => {
          console.log('[PR review reminder] Cron tick.', {
            workspaceId,
            cronExpression,
          });
          void this.reminderService
            .remindWorkspace(workspaceId)
            .then(reminderCount => {
              console.log('[PR review reminder] Cron tick finished.', {
                workspaceId,
                reminderCount,
              });
            });
        },
        start: true,
      });

      job.onError(error => {
        console.error('PR review reminder cron failed', {
          workspaceId,
          error,
        });
      });

      this.workspaceJobs.set(workspaceId, {cronExpression, job});
      console.log('[PR review reminder] Registered workspace cron job.', {
        workspaceId,
        cronExpression,
      });
    } catch (error) {
      console.warn('Invalid PR review reminder cron expression', {
        workspaceId,
        cronExpression,
        error,
      });
    }
  }

  private removeWorkspaceJob(workspaceId: number): void {
    const existingJob = this.workspaceJobs.get(workspaceId);

    if (!existingJob) {
      return;
    }

    existingJob.job.stop();
    this.workspaceJobs.delete(workspaceId);
    console.log('[PR review reminder] Removed workspace cron job.', {
      workspaceId,
    });
  }
}
