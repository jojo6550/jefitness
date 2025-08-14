const API_BASE_URL = 'http://localhost:5000';

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
        updateStatistics(clients);
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
                <td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">
                    ${currentSearch ? 'No clients found matching your search.' : 'No clients found'}
                </td>
            </tr>
        `;
        return;
    }

    clients.forEach(client => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${client.firstName || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${client.lastName || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${client.email || 'N/A'}</td>
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
                <button data-id="${client._id}" class="text-blue-600 hover:text-blue-900 mr-3 edit-btn">Edit</button>
                <button data-id="${client._id}" class="text-red-600 hover:text-red-900 delete-btn">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editClient(e.target.dataset.id));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => confirmDeleteClient(e.target.dataset.id));
    });
}

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

// Update statistics
function updateStatistics(clients) {
    const totalClientsCount = document.getElementById('totalClientsCount');
    const activeClientsCount = document.getElementById('activeClientsCount');
    
    if (totalClientsCount) {
        totalClientsCount.textContent = clients.length;
    }
    
    if (activeClientsCount) {
        const activeClients = clients.filter(client => client.activityStatus === 'active');
        activeClientsCount.textContent = activeClients.length;
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
                <td colspan="5" class="px-6 py-4 text-center">
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
            <td colspan="5" class="px-6 py-4 text-center text-red-600">
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
