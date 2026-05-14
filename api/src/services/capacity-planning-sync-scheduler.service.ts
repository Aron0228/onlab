import {
  BindingScope,
  injectable,
  lifeCycleObserver,
  LifeCycleObserver,
  service,
} from '@loopback/core';
import {CronJob} from '@loopback/cron';
import {CapacityPlanningSyncService} from './capacity-planning-sync.service';

@lifeCycleObserver('cronJob')
@injectable({scope: BindingScope.SINGLETON})
export class CapacityPlanningSyncSchedulerService implements LifeCycleObserver {
  private job?: CronJob;
  private hasStarted = false;

  constructor(
    @service(CapacityPlanningSyncService)
    private capacityPlanningSyncService: CapacityPlanningSyncService,
  ) {}

  async start(): Promise<void> {
    if (this.hasStarted) {
      return;
    }

    this.hasStarted = true;
    this.job = new CronJob({
      name: 'capacity-planning-active-plan-sync',
      cronTime: '*/15 * * * *',
      onTick: () => {
        void this.capacityPlanningSyncService
          .syncActiveCapacityPlans()
          .catch(error => {
            console.error('Capacity planning active plan sync failed', {
              error,
            });
          });
      },
      start: true,
    });
  }

  async stop(): Promise<void> {
    this.hasStarted = false;
    this.job?.stop();
    this.job = undefined;
  }
}
