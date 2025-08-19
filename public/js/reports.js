// Dynamic Reports Module for Admin Dashboard
class ClientReports {
    constructor() {
        this.apiBaseUrl = 'http://localhost:5000';
        this.token = localStorage.getItem('token');
        this.clients = [];
        this.filteredClients = [];
        this.currentFilter = 'all';
    }

    async initialize() {
        await this.loadClients();
        this.renderReports();
        this.setupEventListeners();
    }

    async loadClients() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/clients?limit=1000`, {
                headers: {
                    'Authorization': 'Bearer ' + this.token
                }
            });
            const data = await response.json();
            this.clients = data.clients || [];
            this.filteredClients = [...this.clients];
        } catch (error) {
            console.error('Error loading clients:', error);
            this.showError('Failed to load client data for reports');
        }
    }

    renderReports() {
        this.renderSummaryCards();
        this.renderActivityChart();
        this.renderClientBreakdown();
        this.renderTopPerformers();
        this.renderRecentActivity();
    }

    renderSummaryCards() {
        const container = document.getElementById('reports-summary');
        if (!container) return;

        const stats = this.calculateSummaryStats();
        
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-blue-100 text-sm">Total Clients</p>
                            <p class="text-3xl font-bold">${stats.totalClients}</p>
                        </div>
                        <i class="bi bi-people-fill text-4xl opacity-75"></i>
                    </div>
                </div>
                
                <div class="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-green-100 text-sm">Active Clients</p>
                            <p class="text-3xl font-bold">${stats.activeClients}</p>
                        </div>
                        <i class="bi bi-person-check-fill text-4xl opacity-75"></i>
                    </div>
                </div>
                
                <div class="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-purple-100 text-sm">Avg. Daily Calories</p>
                            <p class="text-3xl font-bold">${stats.avgCalories}</p>
                        </div>
                        <i class="bi bi-fire text-4xl opacity-75"></i>
                    </div>
                </div>
                
                <div class="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-orange-100 text-sm">Avg. Sleep Hours</p>
                            <p class="text-3xl font-bold">${stats.avgSleep}</p>
                        </div>
                        <i class="bi bi-moon-fill text-4xl opacity-75"></i>
                    </div>
                </div>
            </div>
        `;
    }

    renderActivityChart() {
        const container = document.getElementById('activity-chart');
        if (!container) return;

        const activityData = this.calculateActivityData();
        
        container.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h3 class="text-xl font-semibold mb-4">Client Activity Distribution</h3>
                <div class="flex justify-between items-center">
                    <div>
                        <div class="text-2xl font-bold text-green-600">${activityData.active}</div>
                        <div class="text-sm text-gray-600">Active</div>
                    </div>
                    <div>
                        <div class="text-2xl font-bold text-yellow-600">${activityData.inactive}</div>
                        <div class="text-sm text-gray-600">Inactive</div>
                    </div>
                    <div>
                        <div class="text-2xl font-bold text-gray-600">${activityData.pending}</div>
                        <div class="text-sm text-gray-600">Pending</div>
                    </div>
                </div>
                <div class="mt-4">
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="bg-green-500 h-2.5 rounded-full" style="width: ${(activityData.active / this.filteredClients.length) * 100}%"></div>
                    </div>
                </div>
            </div>
        `;
    }

    renderClientBreakdown() {
        const container = document.getElementById('client-breakdown');
        if (!container) return;

        const breakdown = this.calculateClientBreakdown();
        
        container.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h3 class="text-xl font-semibold mb-4">Client Demographics</h3>
                <div class="space-y-4">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600">New Clients (This Month)</span>
                        <span class="font-semibold">${breakdown.newThisMonth}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600">Returning Clients</span>
                        <span class="font-semibold">${breakdown.returning}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600">High Activity (>2000 cal/day)</span>
                        <span class="font-semibold">${breakdown.highActivity}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600">Good Sleep (>7 hrs)</span>
                        <span class="font-semibold">${breakdown.goodSleep}</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderTopPerformers() {
        const container = document.getElementById('top-performers');
        if (!container) return;

        const performers = this.calculateTopPerformers();
        
        container.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h3 class="text-xl font-semibold mb-4">Top Performers</h3>
                <div class="space-y-3">
                    ${performers.map(performer => `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <div class="font-semibold">${performer.name}</div>
                                <div class="text-sm text-gray-600">${performer.metric}</div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold text-lg">${performer.value}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderRecentActivity() {
        const container = document.getElementById('recent-activity');
        if (!container) return;

        const activities = this.calculateRecentActivity();
        
        container.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h3 class="text-xl font-semibold mb-4">Recent Activity</h3>
                <div class="space-y-3">
                    ${activities.map(activity => `
                        <div class="flex items-center space-x-3 p-3 border-l-4 ${activity.type === 'new' ? 'border-green-500' : 'border-blue-500'}">
                            <i class="bi ${activity.icon} text-lg"></i>
                            <div>
                                <div class="font-medium">${activity.description}</div>
                                <div class="text-sm text-gray-600">${activity.time}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    calculateSummaryStats() {
        const totalClients = this.filteredClients.length;
        const activeClients = this.filteredClients.filter(c => c.activityStatus === 'active').length;
        
        // Calculate averages (mock data for now - would need actual tracking data)
        const avgCalories = Math.round(Math.random() * 500 + 1800);
        const avgSleep = (Math.random() * 2 + 6.5).toFixed(1);

        return { totalClients, activeClients, avgCalories, avgSleep };
    }

    calculateActivityData() {
        const active = this.filteredClients.filter(c => c.activityStatus === 'active').length;
        const inactive = this.filteredClients.filter(c => c.activityStatus === 'inactive').length;
        const pending = this.filteredClients.filter(c => !c.activityStatus || c.activityStatus === 'pending').length;
        
        return { active, inactive, pending };
    }

    calculateClientBreakdown() {
        // Mock calculations - would need actual data
        const newThisMonth = Math.floor(this.filteredClients.length * 0.2);
        const returning = this.filteredClients.length - newThisMonth;
        const highActivity = Math.floor(this.filteredClients.length * 0.3);
        const goodSleep = Math.floor(this.filteredClients.length * 0.6);

        return { newThisMonth, returning, highActivity, goodSleep };
    }

    calculateTopPerformers() {
        // Mock top performers based on client data
        return [
            {
                name: this.filteredClients[0]?.firstName + ' ' + this.filteredClients[0]?.lastName || 'Top Client',
                metric: 'Highest Calories Burned',
                value: Math.floor(Math.random() * 500 + 2500)
            },
            {
                name: this.filteredClients[1]?.firstName + ' ' + this.filteredClients[1]?.lastName || 'Second Client',
                metric: 'Best Sleep Average',
                value: (Math.random() * 1 + 7.5).toFixed(1) + ' hrs'
            },
            {
                name: this.filteredClients[2]?.firstName + ' ' + this.filteredClients[2]?.lastName || 'Third Client',
                metric: 'Most Consistent',
                value: Math.floor(Math.random() * 20 + 80) + '%'
            }
        ];
    }

    calculateRecentActivity() {
        // Mock recent activities
        return [
            {
                type: 'new',
                icon: 'bi-person-plus',
                description: `${this.filteredClients[0]?.firstName || 'New client'} joined`,
                time: '2 hours ago'
            },
            {
                type: 'update',
                icon: 'bi-graph-up',
                description: 'Weekly progress updated',
                time: '5 hours ago'
            },
            {
                type: 'milestone',
                icon: 'bi-trophy',
                description: 'Goal achieved by client',
                time: '1 day ago'
            }
        ];
    }

    setupEventListeners() {
        // Filter buttons
        document.querySelectorAll('[data-filter]').forEach(button => {
            button.addEventListener('click', (e) => {
                this.currentFilter = e.target.dataset.filter;
                this.applyFilter();
            });
        });

        // Export buttons
        document.querySelectorAll('[data-export]').forEach(button => {
            button.addEventListener('click', (e) => {
                const format = e.target.dataset.export;
                this.exportReport(format);
            });
        });
    }

    applyFilter() {
        switch (this.currentFilter) {
            case 'active':
                this.filteredClients = this.clients.filter(c => c.activityStatus === 'active');
                break;
            case 'inactive':
                this.filteredClients = this.clients.filter(c => c.activityStatus === 'inactive');
                break;
            case 'new':
                this.filteredClients = this.clients.filter(c => {
                    const joinDate = new Date(c.createdAt || Date.now());
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    return joinDate > thirtyDaysAgo;
                });
                break;
            default:
                this.filteredClients = [...this.clients];
        }
        this.renderReports();
    }

    exportReport(format) {
        const data = {
            summary: this.calculateSummaryStats(),
            clients: this.filteredClients,
            generatedAt: new Date().toISOString()
        };

        if (format === 'csv') {
            this.downloadCSV(data);
        } else if (format === 'pdf') {
            this.downloadPDF(data);
        }
    }

    downloadCSV(data) {
        const csv = this.convertToCSV(data.clients);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `client-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    }

    convertToCSV(clients) {
        const headers = ['Name', 'Email', 'Status', 'Join Date'];
        const rows = clients.map(client => [
            `${client.firstName} ${client.lastName}`,
            client.email,
            client.activityStatus || 'Unknown',
            new Date(client.createdAt || Date.now()).toLocaleDateString()
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    downloadPDF(data) {
        // Simple PDF generation using window.print()
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head><title>Client Report</title></head>
                <body>
                    <h1>Client Report</h1>
                    <p>Generated: ${new Date().toLocaleString()}</p>
                    <h2>Summary</h2>
                    <p>Total Clients: ${data.summary.totalClients}</p>
                    <p>Active Clients: ${data.summary.activeClients}</p>
                    <h2>Client List</h2>
                    <table border="1">
                        <tr><th>Name</th><th>Email</th><th>Status</th></tr>
                        ${data.clients.map(c => `
                            <tr>
                                <td>${c.firstName} ${c.lastName}</td>
                                <td>${c.email}</td>
                                <td>${c.activityStatus || 'Unknown'}</td>
                            </tr>
                        `).join('')}
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }

    showError(message) {
        const container = document.getElementById('reports-error');
        if (container) {
            container.innerHTML = `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">${message}</div>`;
        }
    }
}

// Initialize reports when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const reports = new ClientReports();
    reports.initialize();
});
