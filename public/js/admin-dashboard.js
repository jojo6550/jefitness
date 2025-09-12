const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jojo6550-github-io.onrender.com';

let currentPage = 1;
let currentSearch = '';
let currentSortBy = 'firstName';
let currentSortOrder = 'asc';
let currentStatus = '';

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Load clients with search, sort, and pagination
async function loadClients(page = 1, search = '', sortBy = 'firstName', sortOrder = 'asc', status = '') {
    try {
        showLoading(true);
        
        const params = new URLSearchParams({
            page,
            limit: 10,
            search,
            sortBy,
            sortOrder,
            status
        });

        const response = await fetch(`${API_BASE_URL}/api/clients?${params}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const { clients, pagination } = data;

        displayClients(clients);
        updatePagination(pagination);
        updateStatistics();
        showLoading(false);
    } catch (error) {
        console.error('Error loading clients:', error);
        showError('Failed to load clients. Please try again.');
        showLoading(false);
    }
}

// Display clients in table
function displayClients(clients) {
    const tbody = document.getElementById('clientTableBody');
    tbody.innerHTML = '';

    if (clients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-sm text-gray-500">
                    ${currentSearch ? 'No clients found matching your search.' : 'No clients found'}
                </td>
            </tr>
        `;
        return;
    }

    clients.forEach(client => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer user-detail" data-id="${client._id}">${client.firstName || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer user-detail" data-id="${client._id}">${client.lastName || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer user-detail" data-id="${client._id}">${client.email || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    client.activityStatus === 'active' ? 'bg-green-100 text-green-800' : 
                    client.activityStatus === 'inactive' ? 'bg-red-100 text-red-800' : 
                    'bg-gray-100 text-gray-800'
                }">
                    ${client.activityStatus || 'Unknown'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button data-id="${client._id}" class="text-blue-600 hover:text-blue-900 mr-3 view-btn">View</button>
                <button data-id="${client._id}" class="text-blue-600 hover:text-blue-900 mr-3 edit-btn">Edit</button>
                <button data-id="${client._id}" class="text-red-600 hover:text-red-900 delete-btn">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Add event listeners for view, edit and delete buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => showUserDetails(e.target.dataset.id));
    });

    document.querySelectorAll('.user-detail').forEach(cell => {
        cell.addEventListener('click', (e) => showUserDetails(e.target.dataset.id));
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editClient(e.target.dataset.id));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => confirmDeleteClient(e.target.dataset.id));
    });
}

// Show user details in modal
async function showUserDetails(userId) {
    const modal = document.getElementById('userDetailsModal');
    const content = document.getElementById('userDetailsContent');
    const loading = document.getElementById('userDetailsLoading');

    // Show modal and loading
    modal.classList.remove('hidden');
    loading.style.display = 'block';
    content.querySelectorAll(':not(#userDetailsLoading)').forEach(el => el.remove());

    try {
        const response = await fetch(`${API_BASE_URL}/api/clients/${userId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const user = data.client;

        // Hide loading
        loading.style.display = 'none';

        // Create user details elements
        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('space-y-2');

        const fields = [
            { label: 'First Name', value: user.firstName },
            { label: 'Last Name', value: user.lastName },
            { label: 'Email', value: user.email },
            { label: 'Date of Birth', value: user.dob ? new Date(user.dob).toLocaleDateString() : 'N/A' },
            { label: 'Gender', value: user.gender || 'N/A' },
            { label: 'Phone', value: user.phone || 'N/A' },
            { label: 'Activity Status', value: user.activityStatus || 'N/A' },
            { label: 'Start Weight', value: user.startWeight !== undefined ? user.startWeight : 'N/A' },
            { label: 'Current Weight', value: user.currentWeight !== undefined ? user.currentWeight : 'N/A' },
            { label: 'Goals', value: user.goals || 'N/A' },
            { label: 'Reason', value: user.reason || 'N/A' }
        ];

        fields.forEach(field => {
            const p = document.createElement('p');
            p.innerHTML = `<strong>${field.label}:</strong> ${field.value}`;
            detailsDiv.appendChild(p);
        });

        // Nutrition Logs summary
        if (user.nutritionLogs && user.nutritionLogs.length > 0) {
            const nutritionHeader = document.createElement('h3');
            nutritionHeader.textContent = 'Nutrition Logs';
            nutritionHeader.classList.add('text-lg', 'font-semibold', 'mt-4');
            detailsDiv.appendChild(nutritionHeader);

            const nutritionList = document.createElement('ul');
            nutritionList.classList.add('list-disc', 'pl-5', 'max-h-40', 'overflow-y-auto', 'border', 'p-2', 'rounded');

            user.nutritionLogs.forEach(log => {
                const li = document.createElement('li');
                li.textContent = `${log.date} - ${log.mealType}: ${log.foodItem} (${log.calories} cal)`;
                nutritionList.appendChild(li);
            });

            detailsDiv.appendChild(nutritionList);
        }

        // Sleep Logs summary
        if (user.sleepLogs && user.sleepLogs.length > 0) {
            const sleepHeader = document.createElement('h3');
            sleepHeader.textContent = 'Sleep Logs';
            sleepHeader.classList.add('text-lg', 'font-semibold', 'mt-4');
            detailsDiv.appendChild(sleepHeader);

            const sleepList = document.createElement('ul');
            sleepList.classList.add('list-disc', 'pl-5', 'max-h-40', 'overflow-y-auto', 'border', 'p-2', 'rounded');

            user.sleepLogs.forEach(log => {
                const li = document.createElement('li');
                li.textContent = `${new Date(log.date).toLocaleDateString()}: ${log.hoursSlept} hours`;
                sleepList.appendChild(li);
            });

            detailsDiv.appendChild(sleepList);
        }

        content.appendChild(detailsDiv);
    } catch (error) {
        console.error('Error loading user details:', error);
        loading.style.display = 'none';
        content.innerHTML = `<p class="text-red-600">Failed to load user details. Please try again.</p>`;
    }
}

// Close user details modal
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeUserDetailsModal');
    const modal = document.getElementById('userDetailsModal');

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Close modal on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

// Update pagination controls
function updatePagination(pagination) {
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationContainer = document.getElementById('clientPagination');
    
    const { currentPage, totalPages, totalClients } = pagination;
    
    // Update pagination info text
    const startEntry = (currentPage - 1) * 10 + 1;
    const endEntry = Math.min(currentPage * 10, totalClients);
    paginationInfo.textContent = `Showing ${startEntry} to ${endEntry} of ${totalClients} entries`;
    
    // Clear existing pagination
    paginationContainer.innerHTML = '';
    
    if (totalPages <= 1) return;

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.innerHTML = `
        <button class="px-3 py-1 rounded-md ${currentPage === 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}" 
                ${currentPage === 1 ? 'disabled' : ''}>
            Previous
        </button>
    `;
    if (currentPage > 1) {
        prevLi.querySelector('button').addEventListener('click', () => changePage(currentPage - 1));
    }
    paginationContainer.appendChild(prevLi);

    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageLi = document.createElement('li');
        pageLi.innerHTML = `
            <button class="px-3 py-1 rounded-md ${i === currentPage ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}">
                ${i}
            </button>
        `;
        if (i !== currentPage) {
            pageLi.querySelector('button').addEventListener('click', () => changePage(i));
        }
        paginationContainer.appendChild(pageLi);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.innerHTML = `
        <button class="px-3 py-1 rounded-md ${currentPage === totalPages ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}" 
                ${currentPage === totalPages ? 'disabled' : ''}>
            Next
        </button>
    `;
    if (currentPage < totalPages) {
        nextLi.querySelector('button').addEventListener('click', () => changePage(currentPage + 1));
    }
    paginationContainer.appendChild(nextLi);
}

// Update statistics from database
async function updateStatistics() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/clients/statistics`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const stats = await response.json();
        
        const totalClientsCount = document.getElementById('totalClientsCount');
        const activeClientsCount = document.getElementById('activeClientsCount');
        const avgCaloriesCount = document.getElementById('avgCaloriesCount');
        const avgSleepCount = document.getElementById('avgSleepCount');
        
        if (totalClientsCount) {
            totalClientsCount.textContent = stats.totalClients;
        }
        
        if (activeClientsCount) {
            activeClientsCount.textContent = stats.activeClients;
        }
        
        if (avgCaloriesCount) {
            avgCaloriesCount.textContent = stats.avgCalories;
        }
        
        if (avgSleepCount) {
            avgSleepCount.textContent = stats.avgSleep;
        }

        // Update top clients with database data
        updateTopClientsFromStats(stats.topPerformers);
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Update top clients with database statistics
function updateTopClientsFromStats(topPerformers) {
    const topCalorieElement = document.querySelector('#top-clients-section .bg-red-100 p.text-xl');
    if (topCalorieElement && topPerformers.topCalorieBurner) {
        topCalorieElement.textContent = topPerformers.topCalorieBurner.name;
    }

    const bestSleeperElement = document.querySelector('#top-clients-section .bg-indigo-100 p.text-xl');
    if (bestSleeperElement && topPerformers.bestSleeper) {
        bestSleeperElement.textContent = topPerformers.bestSleeper.name;
    }

    const mostActiveElement = document.querySelector('#top-clients-section .bg-green-100 p.text-xl');
    if (mostActiveElement && topPerformers.mostActive) {
        mostActiveElement.textContent = topPerformers.mostActive.name;
    }
}

// Change page
function changePage(page) {
    currentPage = page;
    loadClients(currentPage, currentSearch, currentSortBy, currentSortOrder, currentStatus);
}

// Handle search
const debouncedSearch = debounce((searchTerm) => {
    currentSearch = searchTerm;
    currentPage = 1;
    loadClients(currentPage, currentSearch, currentSortBy, currentSortOrder, currentStatus);
}, 300);

// Handle sort
function handleSort(column) {
    if (currentSortBy === column) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortBy = column;
        currentSortOrder = 'asc';
    }
    currentPage = 1;
    loadClients(currentPage, currentSearch, currentSortBy, currentSortOrder, currentStatus);
    updateSortIndicators();
}

// Update sort indicators
function updateSortIndicators() {
    document.querySelectorAll('[data-sort]').forEach(header => {
        const column = header.dataset.sort;
        const icon = header.querySelector('i');
        
        if (column === currentSortBy) {
            icon.className = currentSortOrder === 'asc' 
                ? 'bi bi-sort-alpha-up ml-1' 
                : 'bi bi-sort-alpha-down-alt ml-1';
        } else {
            icon.className = 'bi bi-sort-alpha-down ml-1';
        }
    });
}

// Show loading state
function showLoading(show) {
    const tbody = document.getElementById('clientTableBody');
    if (show) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center">
                    <div class="flex items-center justify-center">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span class="ml-2">Loading clients...</span>
                    </div>
                </td>
            </tr>
        `;
    }
}

// Show error message
function showError(message) {
    const tbody = document.getElementById('clientTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="px-6 py-4 text-center text-red-600">
                <i class="bi bi-exclamation-triangle mr-2"></i>${message}
            </td>
        </tr>
    `;
}

// Edit client (placeholder)
function editClient(clientId) {
    console.log('Edit client:', clientId);
    // TODO: Implement edit functionality
}

// Confirm delete client
function confirmDeleteClient(clientId) {
    if (confirm('Are you sure you want to delete this client?')) {
        deleteClient(clientId);
    }
}

// Delete client
async function deleteClient(clientId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        // Reload clients after deletion
        loadClients(currentPage, currentSearch, currentSortBy, currentSortOrder, currentStatus);
    } catch (error) {
        console.error('Error deleting client:', error);
        alert('Failed to delete client. Please try again.');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadClients();
    
    // Search input
    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });
    }

    // Sort headers
    document.querySelectorAll('[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            handleSort(header.dataset.sort);
        });
    });

    // Status filter (if added to UI)
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            currentStatus = e.target.value;
            currentPage = 1;
            loadClients(currentPage, currentSearch, currentSortBy, currentSortOrder, currentStatus);
        });
    }
});
