class AdminLogsManager {
    constructor() {
        this.currentPage = 1;
        this.limit = 50;
        this.currentFilters = {};
        this.sortBy = 'timestamp';
        this.sortOrder = 'desc';

        this.initializeEventListeners();
        this.loadLogs();
        this.loadLogStats();
    }

    initializeEventListeners() {
        // Refresh button
        document.getElementById('refreshLogs')?.addEventListener('click', () => {
            this.loadLogs();
            this.loadLogStats();
        });

        // Export button
        document.getElementById('exportLogs')?.addEventListener('click', () => {
            this.exportLogs();
        });

        // Filter change events
        document.getElementById('logLevelFilter')?.addEventListener('change', (e) => {
            this.currentFilters.level = e.target.value;
            this.currentPage = 1;
            this.loadLogs();
        });

        document.getElementById('logCategoryFilter')?.addEventListener('change', (e) => {
            this.currentFilters.category = e.target.value;
            this.currentPage = 1;
            this.loadLogs();
        });

        document.getElementById('logStartDate')?.addEventListener('change', (e) => {
            this.currentFilters.startDate = e.target.value;
            this.currentPage = 1;
            this.loadLogs();
        });

        document.getElementById('logEndDate')?.addEventListener('change', (e) => {
            this.currentFilters.endDate = e.target.value;
            this.currentPage = 1;
            this.loadLogs();
        });

        // Search functionality
        let searchTimeout;
        document.getElementById('logSearch')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.currentFilters.search = e.target.value;
                this.currentPage = 1;
                this.loadLogs();
            }, 500);
        });

        // Sort functionality
        document.querySelectorAll('[data-sort]').forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                if (this.sortBy === sortField) {
                    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortBy = sortField;
                    this.sortOrder = 'desc';
                }
                this.loadLogs();
                this.updateSortIcons();
            });
        });
    }

    updateSortIcons() {
        // Reset all sort icons
        document.querySelectorAll('[data-sort] i').forEach(icon => {
            icon.className = 'bi bi-sort-down ml-1';
        });

        // Update current sort icon
        const currentHeader = document.querySelector(`[data-sort="${this.sortBy}"]`);
        if (currentHeader) {
            const icon = currentHeader.querySelector('i');
            icon.className = this.sortOrder === 'asc' ? 'bi bi-sort-up ml-1' : 'bi bi-sort-down ml-1';
        }
    }

    async loadLogs() {
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.limit,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder,
                ...this.currentFilters
            });

            const response = await fetch(`${API_BASE_URL}/api/logs?${params}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });
            if (!response.ok) {
                throw new Error('Failed to fetch logs');
            }

            const data = await response.json();
            this.renderLogs(data.logs);
            this.renderPagination(data.pagination);

        } catch (error) {
            console.error('Error loading logs:', error);
            this.showError('Failed to load logs. Please try again.');
        }
    }

    async loadLogStats() {
        try {
            const params = new URLSearchParams(this.currentFilters);
            const response = await fetch(`${API_BASE_URL}/api/logs/stats?${params}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });
            if (!response.ok) {
                throw new Error('Failed to fetch log statistics');
            }

            const stats = await response.json();
            this.renderLogStats(stats);

        } catch (error) {
            console.error('Error loading log statistics:', error);
        }
    }

    renderLogs(logs) {
        const tbody = document.getElementById('logsTableBody');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500">
                        No logs found matching your criteria.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${new Date(log.timestamp).toLocaleString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${this.getLevelBadgeClass(log.level)}">
                        ${log.level.toUpperCase()}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${this.getCategoryBadgeClass(log.category)}">
                        ${log.category.toUpperCase()}
                    </span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title="${log.message}">
                    ${log.message}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${log.userId ? `${log.userId.firstName} ${log.userId.lastName}` : '-'}
                </td>
            </tr>
        `).join('');
    }

    renderPagination(pagination) {
        const info = document.getElementById('logsPaginationInfo');
        const container = document.getElementById('logsPagination');

        if (!info || !container) return;

        info.textContent = `Showing ${pagination.currentPage * pagination.totalPages > 0 ? ((pagination.currentPage - 1) * this.limit) + 1 : 0} to ${Math.min(pagination.currentPage * this.limit, pagination.totalLogs)} of ${pagination.totalLogs} entries`;

        if (pagination.totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        const buttons = [];

        // Previous button
        if (pagination.hasPrev) {
            buttons.push(`
                <li>
                    <button class="px-3 py-1 text-sm text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50" onclick="adminLogs.previousPage()">
                        Previous
                    </button>
                </li>
            `);
        }

        // Page numbers
        const startPage = Math.max(1, pagination.currentPage - 2);
        const endPage = Math.min(pagination.totalPages, pagination.currentPage + 2);

        if (startPage > 1) {
            buttons.push(`
                <li>
                    <button class="px-3 py-1 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50" onclick="adminLogs.goToPage(1)">1</button>
                </li>
            `);
            if (startPage > 2) {
                buttons.push(`
                    <li>
                        <span class="px-3 py-1 text-sm text-gray-500">...</span>
                    </li>
                `);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            buttons.push(`
                <li>
                    <button class="px-3 py-1 text-sm ${i === pagination.currentPage ? 'text-white bg-blue-600 border-blue-600' : 'text-gray-700 bg-white border-gray-300'} border rounded-md hover:bg-gray-50" onclick="adminLogs.goToPage(${i})">
                        ${i}
                    </button>
                </li>
            `);
        }

        if (endPage < pagination.totalPages) {
            if (endPage < pagination.totalPages - 1) {
                buttons.push(`
                    <li>
                        <span class="px-3 py-1 text-sm text-gray-500">...</span>
                    </li>
                `);
            }
            buttons.push(`
                <li>
                    <button class="px-3 py-1 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50" onclick="adminLogs.goToPage(${pagination.totalPages})">
                        ${pagination.totalPages}
                    </button>
                </li>
            `);
        }

        // Next button
        if (pagination.hasNext) {
            buttons.push(`
                <li>
                    <button class="px-3 py-1 text-sm text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50" onclick="adminLogs.nextPage()">
                        Next
                    </button>
                </li>
            `);
        }

        container.innerHTML = buttons.join('');
    }

    renderLogStats(stats) {
        const statsContainer = document.getElementById('logStats');
        if (!statsContainer) return;

        // Initialize counters
        const counters = {
            error: 0,
            warn: 0,
            info: 0,
            debug: 0
        };

        // Use stats.byLevel to set counters
        if (stats.byLevel) {
            counters.error = stats.byLevel.error || 0;
            counters.warn = stats.byLevel.warn || 0;
            counters.info = stats.byLevel.info || 0;
            counters.debug = stats.byLevel.debug || 0;
        }

        // Update DOM
        document.getElementById('errorCount').textContent = counters.error;
        document.getElementById('warnCount').textContent = counters.warn;
        document.getElementById('infoCount').textContent = counters.info;
        document.getElementById('debugCount').textContent = counters.debug;
        document.getElementById('totalLogsCount').textContent = Object.values(counters).reduce((a, b) => a + b, 0);
    }

    getLevelBadgeClass(level) {
        const classes = {
            error: 'bg-red-100 text-red-800',
            warn: 'bg-yellow-100 text-yellow-800',
            info: 'bg-blue-100 text-blue-800',
            debug: 'bg-gray-100 text-gray-800'
        };
        return classes[level] || 'bg-gray-100 text-gray-800';
    }

    getCategoryBadgeClass(category) {
        const classes = {
            general: 'bg-gray-100 text-gray-800',
            admin: 'bg-purple-100 text-purple-800',
            user: 'bg-green-100 text-green-800',
            security: 'bg-red-100 text-red-800',
            auth: 'bg-blue-100 text-blue-800'
        };
        return classes[category] || 'bg-gray-100 text-gray-800';
    }

    async exportLogs() {
        try {
            const params = new URLSearchParams({
                ...this.currentFilters
            });

            const response = await fetch(`${API_BASE_URL}/api/logs/export?${params}`, {
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });
            if (!response.ok) {
                throw new Error('Failed to export logs');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `logs_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('Error exporting logs:', error);
            this.showError('Failed to export logs. Please try again.');
        }
    }

    showError(message) {
        // Create and show error toast
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    nextPage() {
        this.currentPage++;
        this.loadLogs();
    }

    previousPage() {
        this.currentPage--;
        this.loadLogs();
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadLogs();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminLogs = new AdminLogsManager();
});
