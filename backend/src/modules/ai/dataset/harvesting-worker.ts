import { conversationHarvesterService } from './conversation-harvester.service.js';

export class HarvestingWorker {
  private timer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;
  private isHarvesting: boolean = false;
  private isCleaning: boolean = false;
  private intervalMs: number;

  constructor(intervalMinutes: number = 10) {
    this.intervalMs = intervalMinutes * 60 * 1000;
  }

  /**
   * Start the periodic background harvester job.
   */
  start(): void {
    if (this.timer) return;

    console.log(`[AI Harvesting Worker] Started background harvest scheduler (interval: ${this.intervalMs / 1000}s)`);

    // Run initial harvest after 15 seconds
    setTimeout(() => {
      this.runHarvestCycle();
    }, 15000);

    this.timer = setInterval(() => {
      this.runHarvestCycle();
    }, this.intervalMs);

    // Run retention cleanup daily
    this.retentionTimer = setInterval(() => {
      this.runRetentionCycle();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Stop the background harvester.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
    console.log('[AI Harvesting Worker] Stopped background harvest scheduler');
  }

  /**
   * Run one bounded harvest cycle with active lock.
   */
  async runHarvestCycle(batchSize: number = 50): Promise<number> {
    if (this.isHarvesting) {
      return 0;
    }

    this.isHarvesting = true;
    try {
      const result = await conversationHarvesterService.harvestWithWatermark(batchSize);
      if (result.harvested.length > 0) {
        console.log(`[AI Harvesting Worker] Harvested ${result.harvested.length} dialogue turns (Watermark: ${result.checkpoint.lastMessageId})`);
      }
      return result.harvested.length;
    } catch (err: any) {
      console.warn('[AI Harvesting Worker] Harvest cycle error:', err.message);
      return 0;
    } finally {
      this.isHarvesting = false;
    }
  }

  /**
   * Run retention policy cleanup.
   */
  async runRetentionCycle(retentionDays: number = 90): Promise<number> {
    if (this.isCleaning) return 0;
    this.isCleaning = true;
    try {
      const { deletedCount } = await conversationHarvesterService.runRetentionPolicyCleanup(retentionDays);
      if (deletedCount > 0) {
        console.log(`[AI Harvesting Worker] Retention cleanup deleted ${deletedCount} expired training queue items`);
      }
      return deletedCount;
    } catch (err: any) {
      console.warn('[AI Harvesting Worker] Retention cleanup error:', err.message);
      return 0;
    } finally {
      this.isCleaning = false;
    }
  }
}

export const harvestingWorker = new HarvestingWorker();
