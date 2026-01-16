/**
 * Admin Logs Management
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Load admin logs
 */
async function loadLogs() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/logs`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load logs');
        }

        const data = await response.json();
        renderLogs(data.data || []);
    } catch (err) {
        logger.error('Failed to load logs', { error: err?.message });
        this.showError('Failed to load logs. Please try again.');
    }
}

/**
 * Render logs table
 */
function renderLogs(logs) {
    const container = document.getElementById('logsTableBody');
    if (!container) return;

    if (logs.length === 0) {
        container.innerHTML = '<tr><td colspan="4" class="text-center">No logs found</td></tr>';
        return;
    }

    container.innerHTML = logs.map(log => `
        <tr>
            <td>${new Date(log.timestamp).toLocaleString()}</td>
            <td>${log.level || 'info'}</td>
            <td>${log.message}</td>
            <td>${log.userId || '-'}</td>
        </tr>
    `).join('');
}

/**
 * Load log statistics
 */
async function loadLogStats() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/logs/stats`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load log statistics');
        }

        const stats = await response.json();
        renderLogStats(stats);
    } catch (err) {
        logger.error('Failed to load log statistics', { error: err?.message });
    }
}

/**
 * Render log statistics
 */
function renderLogStats(stats) {
    const totalLogs = document.getElementById('totalLogs');
    const errorLogs = document.getElementById('errorLogs');
    const warningLogs = document.getElementById('warningLogs');

    if (totalLogs) totalLogs.textContent = stats.total || 0;
    if (errorLogs) errorLogs.textContent = stats.errors || 0;
    if (warningLogs) warningLogs.textContent = stats.warnings || 0;
}

/**
 * Export logs
 */
async function exportLogs(format = 'json') {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/logs/export?format=${format}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to export logs');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (err) {
        logger.error('Failed to export logs', { error: err?.message });
        this.showError('Failed to export logs. Please try again.');
    }
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.getElementById('errorContainer');
    if (container) {
        container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
        setTimeout(() => container.innerHTML = '', 5000);
    }
}

// Export globally
window.exportLogs = exportLogs;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadLogs();
    loadLogStats();

    // Setup export buttons
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');

    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => exportLogs('json'));
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportLogs('csv'));
});
