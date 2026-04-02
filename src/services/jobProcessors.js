/**
 * Job Processors (Stub)
 *
 * This is a stub implementation since the job queue using Bull/Redis has been removed.
 * These processors are no longer needed.
 *
 * For production use, consider implementing async processing using:
 * - MongoDB change streams
 * - Cloud functions (AWS Lambda, Google Cloud Functions)
 * - Message queues (RabbitMQ, Kafka)
 */

const { logger } = require('./logger');

/**
 * Initialize all job processors (no-op)
 */
async function initializeProcessors() {
  logger.warn('Job processors disabled (job queue removed)');
}

// Stub processors - not called anymore
async function emailProcessor() {
  logger.warn('Email processor not available (job queue disabled)');
  return null;
}

async function fileProcessingProcessor() {
  logger.warn('File processing processor not available (job queue disabled)');
  return null;
}

async function reportProcessor() {
  logger.warn('Report processor not available (job queue disabled)');
  return null;
}

async function cleanupProcessor() {
  logger.warn('Cleanup processor not available (job queue disabled)');
  return null;
}

async function webhookProcessor() {
  logger.warn('Webhook processor not available (job queue disabled)');
  return null;
}

module.exports = {
  initializeProcessors,
  emailProcessor,
  fileProcessingProcessor,
  reportProcessor,
  cleanupProcessor,
  webhookProcessor,
};
