const Queue = require('bull');

/**
 * Job Queue Service using Bull/Redis
 * Handles async operations for:
 * - Email sending (prevents request timeouts)
 * - File uploads/processing
 * - Report generation
 * - Data cleanup and maintenance
 * - Webhook retries
 * 
 * SECURITY: Prevents slow API responses and unreliable operations
 * Uses Redis for persistence (survives app restarts)
 */

// Initialize queues
const queues = {
  // Email operations
  email: new Queue('email', process.env.REDIS_URL || 'redis://127.0.0.1:6379'),
  
  // File operations
  fileProcessing: new Queue('file-processing', process.env.REDIS_URL || 'redis://127.0.0.1:6379'),
  
  // Report generation
  reports: new Queue('reports', process.env.REDIS_URL || 'redis://127.0.0.1:6379'),
  
  // Data maintenance
  cleanup: new Queue('cleanup', process.env.REDIS_URL || 'redis://127.0.0.1:6379'),
  
  // Webhook retries
  webhooks: new Queue('webhooks', process.env.REDIS_URL || 'redis://127.0.0.1:6379')
};

/**
 * Job Queue Service
 * Provides methods to queue and process async jobs
 */
class JobQueueService {
  constructor() {
    this.queues = queues;
    this.processors = new Map();
  }

  /**
   * Initialize all queues and set up event handlers
   */
  async init() {
    console.log('🚀 Initializing Job Queue Service...');

    for (const [name, queue] of Object.entries(this.queues)) {
      // Setup event handlers for monitoring
      queue.on('failed', (job, err) => {
        console.error(`❌ Job ${name}:${job.id} failed:`, err.message);
      });

      queue.on('completed', (job) => {
        console.log(`✅ Job ${name}:${job.id} completed`);
      });

      queue.on('active', (job) => {
        console.log(`⚙️ Job ${name}:${job.id} is processing...`);
      });

      queue.on('stalled', (job) => {
        console.warn(`⚠️ Job ${name}:${job.id} stalled, will retry`);
      });

      queue.on('error', (err) => {
        console.error(`❌ Queue ${name} error:`, err.message);
      });

      // Clear old completed jobs (optional - can be configured via Bull)
      await queue.clean(86400000, 'completed'); // 24 hours
    }

    console.log('✅ Job Queue Service initialized');
  }

  /**
   * Register a job processor
   * @param {string} queueName - Name of queue
   * @param {number} concurrency - Number of concurrent jobs
   * @param {Function} processor - Async function to process job
   */
  registerProcessor(queueName, concurrency, processor) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} does not exist`);
    }

    this.queues[queueName].process(concurrency, processor);
    this.processors.set(queueName, processor);
    console.log(`📋 Processor registered for queue: ${queueName} (concurrency: ${concurrency})`);
  }

  /**
   * Queue an email job
   * @param {Object} emailData - { to, subject, template, data }
   * @param {Object} options - { delay, attempts, priority }
   */
  async queueEmail(emailData, options = {}) {
    const defaults = { 
      attempts: 3, 
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true
    };

    const job = await this.queues.email.add(emailData, {
      ...defaults,
      ...options
    });

    console.log(`📧 Email job queued:`, job.id);
    return job;
  }

  /**
   * Queue a file processing job
   * @param {Object} fileData - { userId, fileId, fileType, action }
   * @param {Object} options - Queue options
   */
  async queueFileProcessing(fileData, options = {}) {
    const defaults = { 
      attempts: 2, 
      backoff: { type: 'fixed', delay: 5000 },
      timeout: 30000 // 30 second timeout
    };

    const job = await this.queues.fileProcessing.add(fileData, {
      ...defaults,
      ...options
    });

    console.log(`📁 File processing job queued:`, job.id);
    return job;
  }

  /**
   * Queue a report generation job
   * @param {Object} reportData - { userId, reportType, dateRange }
   * @param {Object} options - Queue options
   */
  async queueReport(reportData, options = {}) {
    const defaults = { 
      attempts: 1, 
      timeout: 60000 // 1 minute timeout
    };

    const job = await this.queues.reports.add(reportData, {
      ...defaults,
      ...options
    });

    console.log(`📊 Report job queued:`, job.id);
    return job;
  }

  /**
   * Queue a cleanup job
   * @param {Object} cleanupData - { type, target, criteria }
   * @param {Object} options - Queue options
   */
  async queueCleanup(cleanupData, options = {}) {
    const defaults = { 
      attempts: 2, 
      backoff: { type: 'fixed', delay: 10000 }
    };

    const job = await this.queues.cleanup.add(cleanupData, {
      ...defaults,
      ...options
    });

    console.log(`🧹 Cleanup job queued:`, job.id);
    return job;
  }

  /**
   * Queue a webhook retry
   * @param {Object} webhookData - { eventId, url, payload, attempt }
   * @param {Object} options - Queue options
   */
  async queueWebhook(webhookData, options = {}) {
    const defaults = { 
      attempts: 5, 
      backoff: { type: 'exponential', delay: 5000 },
      timeout: 10000 // 10 second timeout
    };

    const job = await this.queues.webhooks.add(webhookData, {
      ...defaults,
      ...options
    });

    console.log(`🔗 Webhook job queued:`, job.id);
    return job;
  }

  /**
   * Get job status
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   */
  async getJobStatus(queueName, jobId) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} does not exist`);
    }

    const job = await this.queues[queueName].getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress(),
      data: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts
    };
  }

  /**
   * Get queue statistics
   * @param {string} queueName - Queue name
   */
  async getQueueStats(queueName) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} does not exist`);
    }

    const queue = this.queues[queueName];
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);

    return {
      queue: queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      totalJobs: waiting + active + completed + failed + delayed
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const stats = {};
    for (const queueName of Object.keys(this.queues)) {
      stats[queueName] = await this.getQueueStats(queueName);
    }
    return stats;
  }

  /**
   * Pause a queue
   * @param {string} queueName - Queue name
   */
  async pauseQueue(queueName) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} does not exist`);
    }
    await this.queues[queueName].pause();
    console.log(`⏸️ Queue ${queueName} paused`);
  }

  /**
   * Resume a queue
   * @param {string} queueName - Queue name
   */
  async resumeQueue(queueName) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} does not exist`);
    }
    await this.queues[queueName].resume();
    console.log(`▶️ Queue ${queueName} resumed`);
  }

  /**
   * Clear a queue
   * @param {string} queueName - Queue name
   */
  async clearQueue(queueName) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} does not exist`);
    }
    await this.queues[queueName].empty();
    console.log(`🗑️ Queue ${queueName} cleared`);
  }

  /**
   * Close all queues
   */
  async close() {
    console.log('Closing all job queues...');
    for (const [name, queue] of Object.entries(this.queues)) {
      try {
        await queue.close();
        console.log(`✅ Queue ${name} closed`);
      } catch (err) {
        console.error(`Error closing queue ${name}:`, err.message);
      }
    }
  }
}

module.exports = new JobQueueService();
