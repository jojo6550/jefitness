#!/usr/bin/env node

/**
 * JE Fitness Security Audit Script
 * Performs automated security checks and penetration testing
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityAuditor {
    constructor(API_BASE = 'http://localhost:3000') {
        this.API_BASE = API_BASE;
        this.results = {
            passed: [],
            failed: [],
            warnings: [],
            critical: []
        };
        this.sessionCookies = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        console.log(logMessage);

        // Log to file
        const logFile = path.join(__dirname, '..', 'logs', 'security-audit.log');
        fs.appendFileSync(logFile, logMessage + '\n');
    }

    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const req = protocol.request(url, options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: data,
                        cookies: res.headers['set-cookie'] || []
                    });
                });
            });

            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (options.method === 'POST' && options.data) {
                req.write(options.data);
            }

            req.end();
        });
    }

    async checkSecurityHeaders() {
        this.log('Checking security headers...');

        try {
            const response = await this.makeRequest(this.API_BASE);

            const requiredHeaders = {
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'X-XSS-Protection': '1; mode=block',
                'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
                'Content-Security-Policy': true, // Just check if exists
                'Referrer-Policy': 'strict-origin-when-cross-origin'
            };

            for (const [header, expected] of Object.entries(requiredHeaders)) {
                const actual = response.headers[header.toLowerCase()];

                if (!actual) {
                    this.results.failed.push(`Missing security header: ${header}`);
                } else if (expected !== true && actual !== expected) {
                    this.results.warnings.push(`Security header ${header} has unexpected value: ${actual}`);
                } else {
                    this.results.passed.push(`Security header ${header} is properly configured`);
                }
            }

            // Check for information disclosure headers
            const infoDisclosureHeaders = ['server', 'x-powered-by', 'x-aspnet-version'];
            for (const header of infoDisclosureHeaders) {
                if (response.headers[header]) {
                    this.results.warnings.push(`Information disclosure header present: ${header}`);
                }
            }

        } catch (error) {
            this.results.critical.push(`Failed to check security headers: ${error.message}`);
        }
    }

    async checkRateLimiting() {
        this.log('Testing rate limiting...');

        try {
            const testUrl = `${this.API_BASE}/api/auth/login`;
            const requests = [];

            // Send multiple requests rapidly
            for (let i = 0; i < 15; i++) {
                requests.push(this.makeRequest(testUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        email: 'test@example.com',
                        password: 'test123'
                    })
                }));
            }

            const responses = await Promise.allSettled(requests);
            const rateLimited = responses.filter(r =>
                r.status === 'fulfilled' && r.value.status === 429
            ).length;

            if (rateLimited > 0) {
                this.results.passed.push(`Rate limiting is working (${rateLimited} requests blocked)`);
            } else {
                this.results.failed.push('Rate limiting may not be properly configured');
            }

        } catch (error) {
            this.results.warnings.push(`Rate limiting test failed: ${error.message}`);
        }
    }

    async checkAuthentication() {
        this.log('Testing authentication mechanisms...');

        try {
            // Test weak passwords
            const weakPasswords = ['password', '123456', 'admin', 'user'];
            for (const password of weakPasswords) {
                const response = await this.makeRequest(`${this.API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        email: 'test@example.com',
                        password: password
                    })
                });

                if (response.status === 200) {
                    this.results.critical.push(`Weak password accepted: ${password}`);
                }
            }

            // Test SQL injection
            const sqlPayloads = ["' OR '1'='1", "admin'--", "1' UNION SELECT"];
            for (const payload of sqlPayloads) {
                const response = await this.makeRequest(`${this.API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        email: payload,
                        password: 'test'
                    })
                });

                if (response.status === 200) {
                    this.results.critical.push(`Potential SQL injection vulnerability with payload: ${payload}`);
                }
            }

            this.results.passed.push('Basic authentication checks completed');

        } catch (error) {
            this.results.warnings.push(`Authentication testing failed: ${error.message}`);
        }
    }

    async checkFileExposure() {
        this.log('Checking for exposed sensitive files...');

        const sensitiveFiles = [
            '/.env',
            '/config/database.js',
            '/src/server.js',
            '/package.json',
            '/.git/config',
            '/backup.sql',
            '/admin.php',
            '/wp-admin/',
            '/phpmyadmin/',
            '/server-status',
            '/phpinfo.php'
        ];

        for (const file of sensitiveFiles) {
            try {
                const response = await this.makeRequest(`${this.API_BASE}${file}`);
                if (response.status === 200) {
                    this.results.critical.push(`Sensitive file exposed: ${file}`);
                } else if (response.status !== 404) {
                    this.results.warnings.push(`Unexpected response for ${file}: ${response.status}`);
                }
            } catch (error) {
                // Connection errors are expected for non-existent files
            }
        }

        this.results.passed.push('File exposure checks completed');
    }

    async checkSSLConfiguration() {
        this.log('Checking SSL/TLS configuration...');

        if (!this.API_BASE.startsWith('https')) {
            this.results.warnings.push('Application is not using HTTPS');
            return;
        }

        try {
            const response = await this.makeRequest(this.API_BASE);
            // Basic SSL check - in production, use tools like ssllabs for comprehensive testing
            this.results.passed.push('HTTPS is enabled');
        } catch (error) {
            this.results.critical.push(`SSL configuration issue: ${error.message}`);
        }
    }

    async checkCSPHeaders() {
        this.log('Checking Content Security Policy...');

        try {
            const response = await this.makeRequest(this.API_BASE);

            const csp = response.headers['content-security-policy'];
            if (!csp) {
                this.results.failed.push('Content Security Policy header is missing');
                return;
            }

            // Check for basic CSP directives
            const requiredDirectives = ['default-src', 'script-src', 'style-src'];
            const missingDirectives = requiredDirectives.filter(directive =>
                !csp.includes(directive)
            );

            if (missingDirectives.length > 0) {
                this.results.warnings.push(`CSP missing directives: ${missingDirectives.join(', ')}`);
            } else {
                this.results.passed.push('Content Security Policy is properly configured');
            }

            // Check for unsafe-inline or unsafe-eval
            if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) {
                this.results.warnings.push('CSP allows unsafe inline scripts or eval');
            }

        } catch (error) {
            this.results.warnings.push(`CSP check failed: ${error.message}`);
        }
    }

    async checkXSSVulnerabilities() {
        this.log('Testing for XSS vulnerabilities...');

        try {
            const xssPayloads = [
                '<script>alert("XSS")</script>',
                '<img src=x onerror=alert("XSS")>',
                'javascript:alert("XSS")',
                '<svg onload=alert("XSS")>'
            ];

            for (const payload of xssPayloads) {
                // Test in search parameters
                const response = await this.makeRequest(`${this.API_BASE}/?q=${encodeURIComponent(payload)}`);

                if (response.data.includes(payload)) {
                    this.results.critical.push(`Potential XSS vulnerability with payload: ${payload}`);
                }
            }

            this.results.passed.push('Basic XSS checks completed');

        } catch (error) {
            this.results.warnings.push(`XSS testing failed: ${error.message}`);
        }
    }

    async checkAPIRateLimiting() {
        this.log('Testing API rate limiting...');

        try {
            const apiEndpoints = [
                '/api/users/trainers',
                '/api/programs',
                '/api/auth/login'
            ];

            for (const endpoint of apiEndpoints) {
                const requests = [];
                for (let i = 0; i < 20; i++) {
                    requests.push(this.makeRequest(`${this.API_BASE}${endpoint}`));
                }

                const responses = await Promise.allSettled(requests);
                const rateLimited = responses.filter(r =>
                    r.status === 'fulfilled' && r.value.status === 429
                ).length;

                if (rateLimited > 0) {
                    this.results.passed.push(`API rate limiting working for ${endpoint} (${rateLimited} blocked)`);
                } else {
                    this.results.warnings.push(`API rate limiting may not be configured for ${endpoint}`);
                }
            }

        } catch (error) {
            this.results.warnings.push(`API rate limiting test failed: ${error.message}`);
        }
    }

    async runFullAudit() {
        this.log('Starting comprehensive security audit...');

        // Ensure logs directory exists
        const logsDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const checks = [
            this.checkSecurityHeaders.bind(this),
            this.checkRateLimiting.bind(this),
            this.checkAuthentication.bind(this),
            this.checkFileExposure.bind(this),
            this.checkSSLConfiguration.bind(this),
            this.checkCSPHeaders.bind(this),
            this.checkXSSVulnerabilities.bind(this),
            this.checkAPIRateLimiting.bind(this)
        ];

        for (const check of checks) {
            await check();
            // Small delay between checks
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.generateReport();
    }

    generateReport() {
        this.log('Generating security audit report...');

        const report = {
            timestamp: new Date().toISOString(),
            target: this.API_BASE,
            summary: {
                passed: this.results.passed.length,
                failed: this.results.failed.length,
                warnings: this.results.warnings.length,
                critical: this.results.critical.length,
                total: this.results.passed.length + this.results.failed.length +
                       this.results.warnings.length + this.results.critical.length
            },
            details: this.results
        };

        const reportPath = path.join(__dirname, '..', 'reports', 'security-audit-report.json');
        const reportsDir = path.dirname(reportPath);

        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        // Console summary
        console.log('\n' + '='.repeat(60));
        console.log('SECURITY AUDIT REPORT SUMMARY');
        console.log('='.repeat(60));
        console.log(`Target: ${this.API_BASE}`);
        console.log(`Timestamp: ${report.timestamp}`);
        console.log(`Passed: ${report.summary.passed}`);
        console.log(`Failed: ${report.summary.failed}`);
        console.log(`Warnings: ${report.summary.warnings}`);
        console.log(`Critical: ${report.summary.critical}`);
        console.log(`Total Checks: ${report.summary.total}`);
        console.log('='.repeat(60));

        if (report.summary.critical > 0) {
            console.log('\n🚨 CRITICAL ISSUES FOUND:');
            this.results.critical.forEach(issue => console.log(`  - ${issue}`));
        }

        if (report.summary.failed > 0) {
            console.log('\n❌ FAILED CHECKS:');
            this.results.failed.forEach(issue => console.log(`  - ${issue}`));
        }

        if (report.summary.warnings > 0) {
            console.log('\n⚠️  WARNINGS:');
            this.results.warnings.forEach(issue => console.log(`  - ${issue}`));
        }

        console.log(`\n📄 Full report saved to: ${reportPath}`);
        console.log('='.repeat(60));
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const API_BASE = args[0] || 'http://localhost:3000';

    const auditor = new SecurityAuditor(API_BASE);
    auditor.runFullAudit().catch(error => {
        console.error('Audit failed:', error);
        process.exit(1);
    });
}

module.exports = SecurityAuditor;
