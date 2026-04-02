import type { JobType } from "@business-automation/shared";
import type { Repository } from "./repository.js";

type JobHandler = (job: {
  id: string;
  business_id: string;
  booking_id: string;
  type: JobType;
  run_at: Date;
}) => Promise<void>;

const MAX_TIMEOUT_MS = 2147000000;

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private disposed = false;

  constructor(private readonly repository: Repository, private readonly handler: JobHandler) {}

  async start() {
    if (this.disposed) {
      return;
    }
    this.running = true;
    await this.reschedule();
  }

  async notifyChange() {
    if (!this.running || this.disposed) {
      return;
    }
    await this.reschedule();
  }

  async stop() {
    this.running = false;
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async reschedule() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const nextJob = await this.repository.getNextPendingJob();
    if (!nextJob) {
      return;
    }

    const delay = Math.max(0, nextJob.run_at.getTime() - Date.now());
    this.timer = setTimeout(() => {
      void this.runDueJobs();
    }, Math.min(delay, MAX_TIMEOUT_MS));
  }

  private async runDueJobs() {
    if (!this.running || this.disposed) {
      return;
    }

    while (true) {
      const job = await this.repository.claimNextDueJob();
      if (!job) {
        break;
      }

      try {
        await this.handler(job);
        await this.repository.finishJob(job.id, "completed");
      } catch (error) {
        await this.repository.finishJob(job.id, "failed", error instanceof Error ? error.message : "Job failed");
      }
    }

    await this.reschedule();
  }
}
