#!/usr/bin/env node

/**
 * JE Fitness Data Retention Script
 * Automated data cleanup and archiving
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../src/models/User');
const Order = require('../src/models/Order');
const Log = require('../src/models/Log');
const Program = require('../src/models/Program');

// Retention policies (in days)
const RETENTION_POLICIES = {
    userData: 2555, // 7 years for active users
    inactiveUsers: 365, // 1 year for inactive users
    temporaryData: 1, // 24 hours
    logs: 90, // 90 days
    marketingData: 730, // 2 years
    analytics: 365, // 1 year
    orders: 2555 // 7 years for order history
};

class DataRetentionManager {
    constructor() {
        this.stats = {
            usersAnonymized: 0,
            usersDeleted: 0,
            ordersArchived: 0,
            logsDeleted: 0,
            programsArchived: 0
        };
    }

    async connectDB() {
        try {
            await mongoose.connect(process.env.MONGO_URI);
            console.log('Connected to MongoDB for data retention cleanup');
        } catch (error) {
            console.error('Failed to connect to MongoDB:', error);
            throw error;
        }
    }

    async disconnectDB() {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }

    /**
     * Anonymize user data instead of deleting (GDPR compliant)
     */
    async anonymizeUser(userId) {
        try {
            const anonymizedData = {
                firstName: 'Anonymous',
                lastName: 'User',
                email: `anonymous${userId}@deleted.local`,
                phone: null,
                dateOfBirth: null,
                gender: null,
                height: null,
                weight: null,
                fitnessGoals: [],
                medicalConditions: [],
                emergencyContact: null,
                profileImage: null,
                isAnonymized: true,
                anonymizedAt: new Date()
            };

            await User.findByIdAndUpdate(userId, anonymizedData);
            this.stats.usersAnonymized++;

            console.log(`Anonymized user: ${userId}`);
        } catch (error) {
            console.error(`Failed to anonymize user ${userId}:`, error);
        }
    }

    /**
     * Clean up inactive users based on retention policy
     */
    async cleanupInactiveUsers() {
        console.log('Starting inactive user cleanup...');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.inactiveUsers);

        try {
            // Find users who haven't logged in for the retention period
            const inactiveUsers = await User.find({
                lastLogin: { $lt: cutoffDate },
                isAnonymized: { $ne: true },
                createdAt: { $lt: cutoffDate }
            }).select('_id');

            for (const user of inactiveUsers) {
                await this.anonymizeUser(user._id);
            }

            console.log(`Completed inactive user cleanup: ${inactiveUsers.length} users processed`);
        } catch (error) {
            console.error('Failed to cleanup inactive users:', error);
        }
    }

    /**
     * Archive old orders
     */
    async cleanupOldOrders() {
        console.log('Starting old orders cleanup...');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.orders);

        try {
            const oldOrders = await Order.find({
                createdAt: { $lt: cutoffDate },
                status: { $in: ['completed', 'cancelled'] }
            });

            for (const order of oldOrders) {
                // Mark as archived instead of deleting
                await Order.findByIdAndUpdate(order._id, {
                    isArchived: true,
                    archivedAt: new Date()
                });
                this.stats.ordersArchived++;
            }

            console.log(`Completed old orders cleanup: ${oldOrders.length} orders archived`);
        } catch (error) {
            console.error('Failed to cleanup old orders:', error);
        }
    }

    /**
     * Clean up old logs
     */
    async cleanupOldLogs() {
        console.log('Starting old logs cleanup...');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.logs);

        try {
            const result = await Log.deleteMany({
                timestamp: { $lt: cutoffDate }
            });

            this.stats.logsDeleted = result.deletedCount;
            console.log(`Completed old logs cleanup: ${result.deletedCount} logs deleted`);
        } catch (error) {
            console.error('Failed to cleanup old logs:', error);
        }
    }

    /**
     * Archive inactive programs
     */
    async cleanupInactivePrograms() {
        console.log('Starting inactive programs cleanup...');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.analytics);

        try {
            const inactivePrograms = await Program.find({
                createdAt: { $lt: cutoffDate },
                isActive: false
            });

            for (const program of inactivePrograms) {
                await Program.findByIdAndUpdate(program._id, {
                    isArchived: true,
                    archivedAt: new Date()
                });
                this.stats.programsArchived++;
            }

            console.log(`Completed inactive programs cleanup: ${inactivePrograms.length} programs archived`);
        } catch (error) {
            console.error('Failed to cleanup inactive programs:', error);
        }
    }

    /**
     * Clean up temporary data (cache, sessions, etc.)
     */
    async cleanupTemporaryData() {
        console.log('Starting temporary data cleanup...');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICIES.temporaryData);

        try {
            // Clean up expired sessions or temporary tokens
            // This would depend on your session/token storage implementation
            console.log('Temporary data cleanup completed');
        } catch (error) {
            console.error('Failed to cleanup temporary data:', error);
        }
    }

    /**
     * Run all cleanup operations
     */
    async runFullCleanup() {
        console.log('Starting full data retention cleanup...');
        console.log('Retention Policies:', RETENTION_POLICIES);

        try {
            await this.connectDB();

            await this.cleanupInactiveUsers();
            await this.cleanupOldOrders();
            await this.cleanupOldLogs();
            await this.cleanupInactivePrograms();
            await this.cleanupTemporaryData();

            this.printSummary();

        } catch (error) {
            console.error('Data retention cleanup failed:', error);
        } finally {
            await this.disconnectDB();
        }
    }

    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('DATA RETENTION CLEANUP SUMMARY');
        console.log('='.repeat(50));
        console.log(`Users anonymized: ${this.stats.usersAnonymized}`);
        console.log(`Users deleted: ${this.stats.usersDeleted}`);
        console.log(`Orders archived: ${this.stats.ordersArchived}`);
        console.log(`Logs deleted: ${this.stats.logsDeleted}`);
        console.log(`Programs archived: ${this.stats.programsArchived}`);
        console.log(`Total operations: ${Object.values(this.stats).reduce((a, b) => a + b, 0)}`);
        console.log('='.repeat(50));
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const operation = args[0] || 'full';

    const manager = new DataRetentionManager();

    switch (operation) {
        case 'users':
            manager.connectDB()
                .then(() => manager.cleanupInactiveUsers())
                .then(() => manager.disconnectDB())
                .catch(console.error);
            break;
        case 'orders':
            manager.connectDB()
                .then(() => manager.cleanupOldOrders())
                .then(() => manager.disconnectDB())
                .catch(console.error);
            break;
        case 'logs':
            manager.connectDB()
                .then(() => manager.cleanupOldLogs())
                .then(() => manager.disconnectDB())
                .catch(console.error);
            break;
        case 'full':
        default:
            manager.runFullCleanup().catch(console.error);
            break;
    }
}

module.exports = DataRetentionManager;
