const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com';

let currentPage = 1;
let currentSearch = '';
let currentSortBy = 'firstName';
let currentSortOrder = 'asc';
let currentStatus = '';
let currentAppointmentsSortBy = 'date';
let currentAppointmentsSortOrder = 'asc';
let currentOrdersPage = 1;
let currentOrdersSearch = '';
let currentOrdersSortBy = 'createdAt';
let currentOrdersSortOrder = 'desc';

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
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'}</td>
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
    content.innerHTML = '';
    content.appendChild(loading);

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
        content.innerHTML = '';

        // Build comprehensive user profile HTML
        let htmlContent = `
            <!-- Personal Information -->
            <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 rounded-lg">
                <h3 class="flex items-center text-lg font-bold text-gray-900 mb-4"><i class="bi bi-person-fill text-blue-600 me-2"></i>Personal Information</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Full Name</p>
                        <p class="text-gray-900 font-semibold">${user.firstName} ${user.lastName}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Email</p>
                        <p class="text-gray-900 font-semibold break-all">${user.email}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Phone</p>
                        <p class="text-gray-900 font-semibold">${user.phone || '—'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Gender</p>
                        <p class="text-gray-900 font-semibold capitalize">${user.gender || '—'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Date of Birth</p>
                        <p class="text-gray-900 font-semibold">${user.dob ? new Date(user.dob).toLocaleDateString() : '—'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Member Since</p>
                        <p class="text-gray-900 font-semibold">${new Date(user.createdAt).toLocaleDateString()}</p>
                    </div>
                </div>
            </div>

            <!-- Fitness Information -->
            <div class="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 p-4 rounded-lg">
                <h3 class="flex items-center text-lg font-bold text-gray-900 mb-4"><i class="bi bi-bar-chart-fill text-green-600 me-2"></i>Fitness Information</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Current Weight</p>
                        <p class="text-gray-900 font-semibold">${user.currentWeight ? user.currentWeight + ' lbs' : '—'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Starting Weight</p>
                        <p class="text-gray-900 font-semibold">${user.startWeight ? user.startWeight + ' lbs' : '—'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Activity Status</p>
                        <p class="text-gray-900 font-semibold">
                            <span class="inline-block px-3 py-1 rounded-full text-sm font-medium ${
                                user.activityStatus === 'active' ? 'bg-green-200 text-green-800' :
                                user.activityStatus === 'inactive' ? 'bg-red-200 text-red-800' :
                                'bg-yellow-200 text-yellow-800'
                            }">
                                ${user.activityStatus || '—'}
                            </span>
                        </p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 font-medium">Last Login</p>
                        <p class="text-gray-900 font-semibold">${user.lastLoggedIn ? new Date(user.lastLoggedIn).toLocaleDateString() : 'Never'}</p>
                    </div>
                    <div class="md:col-span-2">
                        <p class="text-sm text-gray-600 font-medium mb-2">Fitness Goals</p>
                        <p class="text-gray-800 whitespace-pre-wrap text-sm bg-white p-3 rounded border border-gray-200">${user.goals || '—'}</p>
                    </div>
                </div>
            </div>
        `;

        // Medical Information Section
        if (user.hasMedical || (user.medicalDocuments && user.medicalDocuments.length > 0)) {
            htmlContent += `
                <div class="bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-500 p-4 rounded-lg">
                    <h3 class="flex items-center text-lg font-bold text-gray-900 mb-4"><i class="bi bi-file-medical text-red-600 me-2"></i>Medical Information</h3>
                    ${user.medicalConditions ? `
                        <div class="mb-4">
                            <p class="text-sm text-gray-600 font-medium mb-2">Reported Conditions</p>
                            <p class="text-gray-800 whitespace-pre-wrap text-sm bg-white p-3 rounded border border-red-200">${user.medicalConditions}</p>
                        </div>
                    ` : ''}
                    ${user.medicalDocuments && user.medicalDocuments.length > 0 ? `
                        <div>
                            <p class="text-sm text-gray-600 font-medium mb-3">Uploaded Medical Documents</p>
                            <div class="space-y-2">
                                ${user.medicalDocuments.map(doc => `
                                    <div class="flex items-center justify-between bg-white p-3 rounded border border-red-200">
                                        <div class="flex items-center gap-2 flex-1">
                                            <i class="bi bi-file-earmark-pdf text-red-500 text-lg"></i>
                                            <div>
                                                <p class="font-medium text-sm text-gray-800">${doc.originalName || doc.filename}</p>
                                                <p class="text-xs text-gray-500">${new Date(doc.uploadedAt).toLocaleDateString()} • ${(doc.size / 1024).toFixed(2)} KB</p>
                                            </div>
                                        </div>
                                        <button class="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1 hover:bg-blue-50 rounded transition" onclick="downloadMedicalDoc('${doc.filename}')">
                                            <i class="bi bi-download me-1"></i> View
                                        </button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : '<p class="text-sm text-gray-600">No medical documents uploaded</p>'}
                </div>
            `;
        }

        // Account Summary
        htmlContent += `
            <div class="bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-purple-500 p-4 rounded-lg">
                <h3 class="flex items-center text-lg font-bold text-gray-900 mb-4"><i class="bi bi-info-circle-fill text-purple-600 me-2"></i>Account Summary</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-white p-3 rounded border border-purple-200">
                        <p class="text-xs text-gray-600 font-medium">Role</p>
                        <p class="text-gray-900 font-semibold capitalize">${user.role}</p>
                    </div>
                    <div class="bg-white p-3 rounded border border-purple-200">
                        <p class="text-xs text-gray-600 font-medium">Email Verified</p>
                        <p class="text-gray-900 font-semibold">
                            <span class="inline-block px-2 py-1 rounded text-xs font-medium ${user.isEmailVerified ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}">
                                ${user.isEmailVerified ? 'Yes' : 'No'}
                            </span>
                        </p>
                    </div>
                    <div class="bg-white p-3 rounded border border-purple-200">
                        <p class="text-xs text-gray-600 font-medium">Onboarding</p>
                        <p class="text-gray-900 font-semibold">
                            <span class="inline-block px-2 py-1 rounded text-xs font-medium ${user.onboardingCompleted ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}">
                                ${user.onboardingCompleted ? 'Complete' : 'Pending'}
                            </span>
                        </p>
                    </div>
                    <div class="bg-white p-3 rounded border border-purple-200">
                        <p class="text-xs text-gray-600 font-medium">Medical Info</p>
                        <p class="text-gray-900 font-semibold">
                            <span class="inline-block px-2 py-1 rounded text-xs font-medium ${user.hasMedical ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-800'}">
                                ${user.hasMedical ? 'Yes' : 'No'}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        `;

        content.innerHTML = htmlContent;
    } catch (error) {
        console.error('Error loading user details:', error);
        loading.style.display = 'none';
        content.innerHTML = `<p class="text-red-600 font-semibold">Failed to load user details. Please try again.</p>`;
    }
}

// Download medical document
window.downloadMedicalDoc = function(filename) {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/api/medical-documents/download/${filename}`, {
        headers: {
            'Authorization': 'Bearer ' + token
        }
    })
    .then(response => {
        if (!response.ok) throw new Error('Download failed');
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    })
    .catch(err => alert('Error downloading file: ' + err.message));
};

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

    // Close appointment details modal
    const closeAppointmentBtn = document.getElementById('closeAppointmentDetailsModal');
    const appointmentModal = document.getElementById('appointmentDetailsModal');

    closeAppointmentBtn.addEventListener('click', () => {
        appointmentModal.classList.add('hidden');
    });

    // Close appointment modal on outside click
    appointmentModal.addEventListener('click', (e) => {
        if (e.target === appointmentModal) {
            appointmentModal.classList.add('hidden');
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

// Handle appointments sort
function handleAppointmentsSort(column) {
    if (currentAppointmentsSortBy === column) {
        currentAppointmentsSortOrder = currentAppointmentsSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentAppointmentsSortBy = column;
        currentAppointmentsSortOrder = 'asc';
    }
    loadAppointments(1, '', currentAppointmentsSortBy, currentAppointmentsSortOrder, '');
    updateAppointmentsSortIndicators();
}

// Update appointments sort indicators
function updateAppointmentsSortIndicators() {
    document.querySelectorAll('#appointments-section [data-sort]').forEach(header => {
        const column = header.dataset.sort;
        const icon = header.querySelector('i');

        if (column === currentAppointmentsSortBy) {
            icon.className = currentAppointmentsSortOrder === 'asc'
                ? 'bi bi-sort-up ml-1'
                : 'bi bi-sort-down ml-1';
        } else {
            icon.className = 'bi bi-sort-down ml-1';
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

// Load appointments with search, sort, and pagination
async function loadAppointments(page = 1, search = '', sortBy = currentAppointmentsSortBy, sortOrder = currentAppointmentsSortOrder, status = '') {
    try {
        const params = new URLSearchParams({
            page,
            limit: 10,
            search,
            sortBy,
            sortOrder,
            status
        });

        const response = await fetch(`${API_BASE_URL}/api/appointments?${params}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const { appointments, pagination } = data;

        displayAppointments(appointments);
        updateAppointmentsPagination(pagination);
    } catch (error) {
        console.error('Error loading appointments:', error);
        showAppointmentsError('Failed to load appointments. Please try again.');
    }
}

// Display appointments in table
function displayAppointments(appointments) {
    const tbody = document.getElementById('appointmentsTableBody');
    tbody.innerHTML = '';

    if (appointments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-sm text-gray-500">
                    No appointments found
                </td>
            </tr>
        `;
        return;
    }

    appointments.forEach(appointment => {
        const row = document.createElement('tr');
        const date = new Date(appointment.date).toLocaleDateString();
        const statusClass = appointment.status === 'scheduled' ? 'bg-green-100 text-green-800' :
                           appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                           'bg-yellow-100 text-yellow-800';

        const clientName = appointment.clientId ? `${appointment.clientId.firstName || 'N/A'} ${appointment.clientId.lastName || ''}` : 'N/A';
        const trainerName = appointment.trainerId ? `${appointment.trainerId.firstName || 'N/A'} ${appointment.trainerId.lastName || ''}` : 'N/A';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${date}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${appointment.time}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${clientName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${trainerName}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                    ${appointment.status}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button data-id="${appointment._id}" class="text-blue-600 hover:text-blue-900 mr-3 view-appointment-btn">View</button>
                <button data-id="${appointment._id}" class="text-blue-600 hover:text-blue-900 mr-3 edit-appointment-btn">Edit</button>
                <button data-id="${appointment._id}" class="text-red-600 hover:text-red-900 delete-appointment-btn">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Add event listeners for view, edit and delete buttons
    document.querySelectorAll('.view-appointment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => viewAppointment(e.target.dataset.id));
    });

    document.querySelectorAll('.edit-appointment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editAppointment(e.target.dataset.id));
    });

    document.querySelectorAll('.delete-appointment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => confirmDeleteAppointment(e.target.dataset.id));
    });
}

// Update appointments pagination controls
function updateAppointmentsPagination(pagination) {
    const paginationInfo = document.getElementById('appointmentsPaginationInfo');
    const paginationContainer = document.getElementById('appointmentsPagination');

    const { currentPage, totalPages, totalAppointments } = pagination;

    // Update pagination info text
    const startEntry = (currentPage - 1) * 10 + 1;
    const endEntry = Math.min(currentPage * 10, totalAppointments);
    paginationInfo.textContent = `Showing ${startEntry} to ${endEntry} of ${totalAppointments} entries`;

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
        prevLi.querySelector('button').addEventListener('click', () => changeAppointmentsPage(currentPage - 1));
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
            pageLi.querySelector('button').addEventListener('click', () => changeAppointmentsPage(i));
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
        nextLi.querySelector('button').addEventListener('click', () => changeAppointmentsPage(currentPage + 1));
    }
    paginationContainer.appendChild(nextLi);
}

// Change appointments page
function changeAppointmentsPage(page) {
    loadAppointments(page, '', currentAppointmentsSortBy, currentAppointmentsSortOrder, '');
}

// Show appointments error message
function showAppointmentsError(message) {
    const tbody = document.getElementById('appointmentsTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="px-6 py-4 text-center text-red-600">
                <i class="bi bi-exclamation-triangle mr-2"></i>${message}
            </td>
        </tr>
    `;
}

// View appointment details
async function viewAppointment(appointmentId) {
    const modal = document.getElementById('appointmentDetailsModal');
    const content = document.getElementById('appointmentDetailsContent');
    const loading = document.getElementById('appointmentDetailsLoading');

    // Show modal and loading
    modal.classList.remove('hidden');
    loading.style.display = 'block';
    content.querySelectorAll(':not(#appointmentDetailsLoading)').forEach(el => el.remove());

    try {
        const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const appointment = await response.json();

        // Hide loading
        loading.style.display = 'none';

        // Populate modal
        document.getElementById('modalAppointmentDate').textContent = new Date(appointment.date).toLocaleDateString();
        document.getElementById('modalAppointmentTime').textContent = appointment.time;
        document.getElementById('modalAppointmentClient').textContent = appointment.clientId ? `${appointment.clientId.firstName} ${appointment.clientId.lastName}` : 'N/A';
        document.getElementById('modalAppointmentTrainer').textContent = appointment.trainerId ? `${appointment.trainerId.firstName} ${appointment.trainerId.lastName}` : 'N/A';
        document.getElementById('modalAppointmentStatus').textContent = appointment.status;
        document.getElementById('modalAppointmentNotes').textContent = appointment.notes || 'N/A';
        document.getElementById('modalAppointmentCreatedAt').textContent = new Date(appointment.createdAt).toLocaleString();
        document.getElementById('modalAppointmentUpdatedAt').textContent = new Date(appointment.updatedAt).toLocaleString();
    } catch (error) {
        console.error('Error loading appointment details:', error);
        loading.style.display = 'none';
        content.innerHTML = `<p class="text-red-600">Failed to load appointment details. Please try again.</p>`;
    }
}

// Edit appointment
function editAppointment(appointmentId) {
    console.log('Edit appointment:', appointmentId);
    // TODO: Implement edit functionality
}

// Confirm delete appointment
function confirmDeleteAppointment(appointmentId) {
    if (confirm('Are you sure you want to delete this appointment?')) {
        deleteAppointment(appointmentId);
    }
}

// Delete appointment
async function deleteAppointment(appointmentId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        // Reload appointments after deletion
        loadAppointments(1, '', 'date', 'asc', '');
    } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Failed to delete appointment. Please try again.');
    }
}

// Export appointments to CSV
function exportAppointments() {
    // Get all appointments for export
    fetch(`${API_BASE_URL}/api/appointments`, {
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('token')
        }
    })
    .then(response => response.json())
    .then(data => {
        const appointments = data.appointments || [];

        if (appointments.length === 0) {
            alert('No appointments to export');
            return;
        }

        // Create CSV content
        const csvContent = [
            ['Date', 'Time', 'Client Name', 'Client Email', 'Trainer Name', 'Trainer Email', 'Status', 'Notes'],
            ...appointments.map(appointment => [
                new Date(appointment.date).toLocaleDateString(),
                appointment.time,
                `${appointment.clientId.firstName} ${appointment.clientId.lastName}`,
                appointment.clientId.email,
                `${appointment.trainerId.firstName} ${appointment.trainerId.lastName}`,
                appointment.trainerId.email,
                appointment.status,
                appointment.notes || ''
            ])
        ].map(row => row.join(',')).join('\n');

        // Create and download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `appointments_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error('Error exporting appointments:', error);
        alert('Failed to export appointments. Please try again.');
    });
}

// Load orders with search, sort, and pagination
async function loadOrders(page = 1, search = '', sortBy = currentOrdersSortBy, sortOrder = currentOrdersSortOrder) {
    try {
        const params = new URLSearchParams({
            page,
            limit: 10,
            search,
            sortBy,
            sortOrder
        });

        const response = await fetch(`${API_BASE_URL}/api/orders/admin/all?${params}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const { orders, pagination } = data;

        displayOrders(orders);
        updateOrdersPagination(pagination);
    } catch (error) {
        console.error('Error loading orders:', error);
        showOrdersError('Failed to load orders. Please try again.');
    }
}

// Display orders in table
function displayOrders(orders) {
    const tbody = document.getElementById('ordersTableBody');
    tbody.innerHTML = '';

    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-sm text-gray-500">
                    ${currentOrdersSearch ? 'No orders found matching your search.' : 'No orders found'}
                </td>
            </tr>
        `;
        return;
    }

    orders.forEach(order => {
        const row = document.createElement('tr');
        const customerName = order.user ? `${order.user.firstName || 'N/A'} ${order.user.lastName || ''}` : 'N/A';
        const statusClass = order.status === 'completed' ? 'bg-green-100 text-green-800' :
                           order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                           order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                           'bg-gray-100 text-gray-800';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${order.orderNumber}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${customerName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">$${order.total.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                    ${order.status}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${new Date(order.createdAt).toLocaleDateString()}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button data-id="${order._id}" class="text-blue-600 hover:text-blue-900 mr-3 view-order-btn">View</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Add event listeners for view button
    document.querySelectorAll('.view-order-btn').forEach(btn => {
        btn.addEventListener('click', (e) => viewOrder(e.target.dataset.id));
    });
}

// Update orders pagination controls
function updateOrdersPagination(pagination) {
    const paginationInfo = document.getElementById('ordersPaginationInfo');
    const paginationContainer = document.getElementById('ordersPagination');

    const { currentPage, totalPages, totalOrders } = pagination;

    // Update pagination info text
    const startEntry = (currentPage - 1) * 10 + 1;
    const endEntry = Math.min(currentPage * 10, totalOrders);
    paginationInfo.textContent = `Showing ${startEntry} to ${endEntry} of ${totalOrders} entries`;

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
        prevLi.querySelector('button').addEventListener('click', () => changeOrdersPage(currentPage - 1));
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
            pageLi.querySelector('button').addEventListener('click', () => changeOrdersPage(i));
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
        nextLi.querySelector('button').addEventListener('click', () => changeOrdersPage(currentPage + 1));
    }
    paginationContainer.appendChild(nextLi);
}

// Change orders page
function changeOrdersPage(page) {
    currentOrdersPage = page;
    loadOrders(currentOrdersPage, currentOrdersSearch, currentOrdersSortBy, currentOrdersSortOrder);
}

// Show orders error message
function showOrdersError(message) {
    const tbody = document.getElementById('ordersTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="px-6 py-4 text-center text-red-600">
                <i class="bi bi-exclamation-triangle mr-2"></i>${message}
            </td>
        </tr>
    `;
}

// View order details
async function viewOrder(orderId) {
    // For now, just log the order ID. You can implement a modal to show order details
    console.log('View order:', orderId);
    // TODO: Implement order details modal
}

// Handle orders sort
function handleOrdersSort(column) {
    if (currentOrdersSortBy === column) {
        currentOrdersSortOrder = currentOrdersSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentOrdersSortBy = column;
        currentOrdersSortOrder = 'asc';
    }
    currentOrdersPage = 1;
    loadOrders(currentOrdersPage, currentOrdersSearch, currentOrdersSortBy, currentOrdersSortOrder);
    updateOrdersSortIndicators();
}

// Update orders sort indicators
function updateOrdersSortIndicators() {
    document.querySelectorAll('#orders-section [data-sort]').forEach(header => {
        const column = header.dataset.sort;
        const icon = header.querySelector('i');

        if (column === currentOrdersSortBy) {
            icon.className = currentOrdersSortOrder === 'asc'
                ? 'bi bi-sort-up ml-1'
                : 'bi bi-sort-down ml-1';
        } else {
            icon.className = 'bi bi-sort-down ml-1';
        }
    });
}

// Export orders to CSV
function exportOrders() {
    // Get all orders for export
    fetch(`${API_BASE_URL}/api/orders/admin/all`, {
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('token')
        }
    })
    .then(response => response.json())
    .then(data => {
        const orders = data.orders || [];

        if (orders.length === 0) {
            alert('No orders to export');
            return;
        }

        // Create CSV content
        const csvContent = [
            ['Order Number', 'Customer Name', 'Customer Email', 'Total', 'Status', 'Date'],
            ...orders.map(order => [
                order.orderNumber,
                order.user ? `${order.user.firstName} ${order.user.lastName}` : 'N/A',
                order.user ? order.user.email : 'N/A',
                order.total.toFixed(2),
                order.status,
                new Date(order.createdAt).toLocaleDateString()
            ])
        ].map(row => row.join(',')).join('\n');

        // Create and download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error('Error exporting orders:', error);
        alert('Failed to export orders. Please try again.');
    });
}

// Attach logout listener
function attachLogoutListener() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/pages/login.html';
        });
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadClients();
    loadAppointments();
    loadOrders();
    attachLogoutListener();

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

    // Appointments refresh button
    const refreshAppointmentsBtn = document.getElementById('refreshAppointments');
    if (refreshAppointmentsBtn) {
        refreshAppointmentsBtn.addEventListener('click', () => {
            loadAppointments(1, '', currentAppointmentsSortBy, currentAppointmentsSortOrder, '');
        });
    }

    // Appointments sort headers
    document.querySelectorAll('#appointments-section [data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            handleAppointmentsSort(header.dataset.sort);
        });
    });

    // Appointments export button
    const exportAppointmentsBtn = document.getElementById('exportAppointments');
    if (exportAppointmentsBtn) {
        exportAppointmentsBtn.addEventListener('click', exportAppointments);
    }

    // Clients refresh button
    const refreshClientsBtn = document.getElementById('refreshClients');
    if (refreshClientsBtn) {
        refreshClientsBtn.addEventListener('click', () => {
            loadClients(currentPage, currentSearch, currentSortBy, currentSortOrder, currentStatus);
        });
    }

    // Orders search input
    const ordersSearchInput = document.getElementById('ordersSearch');
    if (ordersSearchInput) {
        ordersSearchInput.addEventListener('input', (e) => {
            currentOrdersSearch = e.target.value;
            currentOrdersPage = 1;
            loadOrders(currentOrdersPage, currentOrdersSearch, currentOrdersSortBy, currentOrdersSortOrder);
        });
    }

    // Orders sort headers
    document.querySelectorAll('#orders-section [data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            handleOrdersSort(header.dataset.sort);
        });
    });

    // Orders refresh button
    const refreshOrdersBtn = document.getElementById('refreshOrders');
    if (refreshOrdersBtn) {
        refreshOrdersBtn.addEventListener('click', () => {
            loadOrders(1, '', currentOrdersSortBy, currentOrdersSortOrder);
        });
    }

    // Orders export button
    const exportOrdersBtn = document.getElementById('exportOrders');
    if (exportOrdersBtn) {
        exportOrdersBtn.addEventListener('click', exportOrders);
    }
});
