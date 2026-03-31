/**
 * Job Queue Service (Stub)
 *
 * This is a stub implementation that logs a warning when job queue methods are called.
 * The job queue functionality was previously using Bull/Redis which has been removed.
 *
 * For production use, consider implementing a job queue using:
 * - MongoDB-based job queue
 * - Message queues (RabbitMQ, Kafka)
 * - Cloud functions for async processing
 */

// Stub implementation
class JobQueueService {
  constructor() {
    this.queues = {};
    this.processors = new Map();
  }

  /**
   * Initialize the job queue service (no-op)
   */
  async init() {
    console.warn('⚠️ Job Queue is disabled (Redis dependency removed)');
  }

  /**
   * Register a job processor (no-op)
   */
  registerProcessor(queueName, concurrency, processor) {
    console.warn(
      `⚠️ Job processor registration skipped: ${queueName} (job queue disabled)`
    );
  }

  /**
   * Queue an email job (no-op)
   */
  async queueEmail(emailData, options = {}) {
    console.warn('⚠️ Email job queued skipped (job queue disabled)');
    return null;
  }

  /**
   * Queue a file processing job (no-op)
   */
  async queueFileProcessing(fileData, options = {}) {
    console.warn('⚠️ File processing job queued skipped (job queue disabled)');
    return null;
  }

  /**
   * Queue a report generation job (no-op)
   */
  async queueReport(reportData, options = {}) {
    console.warn('⚠️ Report job queued skipped (job queue disabled)');
    return null;
  }

  /**
   * Queue a cleanup job (no-op)
   */
  async queueCleanup(cleanupData, options = {}) {
    console.warn('⚠️ Cleanup job queued skipped (job queue disabled)');
    return null;
  }

  /**
   * Queue a webhook retry (no-op)
   */
  async queueWebhook(webhookData, options = {}) {
    console.warn('⚠️ Webhook job queued skipped (job queue disabled)');
    return null;
  }

  /**
   * Get job status (returns null)
   */
  async getJobStatus(queueName, jobId) {
    return null;
  }

  /**
   * Get queue statistics (returns empty stats)
   */
  async getQueueStats(queueName) {
    return {
      queue: queueName,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      totalJobs: 0,
      message: 'Job queue disabled',
    };
  }

  /**
   * Get all queue statistics (returns empty stats)
   */
  async getAllQueueStats() {
    return {};
  }

  /**
   * Pause a queue (no-op)
   */
  async pauseQueue(queueName) {
    console.warn('⚠️ Queue pause skipped (job queue disabled)');
  }

  /**
   * Resume a queue (no-op)
   */
  async resumeQueue(queueName) {
    console.warn('⚠️ Queue resume skipped (job queue disabled)');
  }

  /**
   * Clear a queue (no-op)
   */
  async clearQueue(queueName) {
    console.warn('⚠️ Queue clear skipped (job queue disabled)');
  }

  /**
   * Close all queues (no-op)
   */
  async close() {
    console.log('✅ Job queue service closed');
  }
}

module.exports = new JobQueueService();
