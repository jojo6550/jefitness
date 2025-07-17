document.addEventListener('DOMContentLoaded', async function() {
    const clientTableBody = document.getElementById('clientTableBody');
    const clientSearchInput = document.getElementById('clientSearch');
    const totalClientsCount = document.getElementById('totalClientsCount');
    const activeClientsCount = document.getElementById('activeClientsCount');
    const newClientsCount = document.getElementById('newClientsCount');
    const clientPagination = document.getElementById('clientPagination');
    const paginationInfo = document.getElementById('paginationInfo');
    const addClientBtn = document.getElementById('addClientBtn');
    const clientFormModal = new bootstrap.Modal(document.getElementById('clientFormModal'));
    const clientFormModalLabel = document.getElementById('clientFormModalLabel');
    const clientForm = document.getElementById('clientForm');
    const saveClientBtn = document.getElementById('saveClientBtn');
    const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    let allClients = []; // Stores all clients fetched from backend
    let filteredClients = []; // Stores clients after search/filter
    let currentPage = 1;
    const clientsPerPage = 10; // Number of clients to show per page
    let currentSortColumn = 'firstName';
    let currentSortOrder = 'asc'; // 'asc' or 'desc'

    // Helper function to get JWT from localStorage
    function getAuthToken() {
        return localStorage.getItem('token');
    }

    // Helper function to decode JWT and get user role
    function getUserRoleFromToken() {
        const token = getAuthToken();
        if (token) {
            try {
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const payload = JSON.parse(atob(base64));
                return payload.role; // Assuming 'role' is in the JWT payload
            } catch (e) {
                console.error('Error decoding token:', e);
                return null;
            }
        }
        return null;
    }

    // Function to check admin access on page load
    async function checkAdminAccess() {
        const userRole = getUserRoleFromToken();
        if (userRole !== 'admin') {
            clientTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Access Denied: You must be an administrator to view this page.</td></tr>`;
            // Optionally hide other UI elements or redirect
            document.querySelector('main.container-fluid').innerHTML = `
                <div class="alert alert-danger text-center" role="alert">
                    <h3>Access Denied!</h3>
                    <p>You do not have administrator privileges to view this page.</p>
                    <a href="../index.html" class="btn btn-primary">Go to Home Page</a>
                    <a href="login.html" class="btn btn-secondary ms-2">Login as Admin</a>
                </div>
            `;
            // Hide navbar items specific to admin if needed
            document.getElementById('adminNavbar').innerHTML = `
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item"><a class="nav-link" href="../index.html">Home</a></li>
                    <li class="nav-item"><a class="nav-link" href="login.html">Login</a></li>
                </ul>
            `;
            return false;
        }
        return true;
    }

    // Function to fetch clients from the backend
    async function fetchClients() {
        const hasAccess = await checkAdminAccess();
        if (!hasAccess) {
            return; // Stop if not an admin
        }

        const token = getAuthToken();
        if (!token) {
            console.error('Admin: No authentication token found. Cannot fetch clients.');
            clientTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Authentication required. Please log in.</td></tr>`;
            updateDashboardOverview([]);
            return;
        }

        try {
            const response = await fetch('/api/clients', { // Endpoint to get all clients (users with role 'user')
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 403) { // Forbidden, not an admin
                console.error('Admin: Access denied by server.');
                await checkAdminAccess(); // Re-run check to show proper message
                return;
            }
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.msg || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            allClients = data.clients || data;
            console.log('Admin: Clients fetched from backend:', allClients);

            updateDashboardOverview(allClients);
            applyFiltersAndSort();
        } catch (error) {
            console.error('Admin: Error fetching clients:', error);
            clientTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Failed to load clients: ${error.message}. Please check console for details.</td></tr>`;
            updateDashboardOverview([]);
        }
    }

    // Function to update dashboard overview cards
    function updateDashboardOverview(clients) {
        totalClientsCount.textContent = clients.length;
        activeClientsCount.textContent = clients.filter(c => c.activityStatus === 'active').length;
        newClientsCount.textContent = 'N/A'; // Still needs backend logic for accurate count
    }

    // Function to apply search filter and sorting (unchanged)
    function applyFiltersAndSort() {
        const searchTerm = clientSearchInput.value.toLowerCase();
        filteredClients = allClients.filter(client =>
            (client.firstName && client.firstName.toLowerCase().includes(searchTerm)) ||
            (client.lastName && client.lastName.toLowerCase().includes(searchTerm)) ||
            (client.email && client.email.toLowerCase().includes(searchTerm))
        );

        filteredClients.sort((a, b) => {
            const aValue = a[currentSortColumn];
            const bValue = b[currentSortColumn];

            if (aValue === null || aValue === undefined) return currentSortOrder === 'asc' ? 1 : -1;
            if (bValue === null || bValue === undefined) return currentSortOrder === 'asc' ? -1 : 1;

            if (typeof aValue === 'string') {
                return currentSortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
            }
            return currentSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        });

        currentPage = 1;
        renderClientTable();
        renderPagination();
    }

    // Function to render client table rows (unchanged)
    function renderClientTable() {
        clientTableBody.innerHTML = '';

        const startIndex = (currentPage - 1) * clientsPerPage;
        const endIndex = startIndex + clientsPerPage;
        const clientsToDisplay = filteredClients.slice(startIndex, endIndex);

        if (clientsToDisplay.length === 0) {
            clientTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No clients found.</td></tr>`;
            return;
        }

        clientsToDisplay.forEach(client => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${client.firstName || ''}</td>
                <td>${client.lastName || ''}</td>
                <td>${client.email || ''}</td>
                <td><span class="badge bg-${getClientStatusBadge(client.activityStatus || 'unknown')}">${(client.activityStatus ? client.activityStatus.charAt(0).toUpperCase() + client.activityStatus.slice(1) : 'Unknown')}</span></td>
                <td>
                    <button class="btn btn-sm btn-edit me-2" data-id="${client._id}" data-bs-toggle="modal" data-bs-target="#clientFormModal"><i class="bi bi-pencil-fill"></i> Edit</button>
                    <button class="btn btn-sm btn-delete" data-id="${client._id}" data-bs-toggle="modal" data-bs-target="#deleteConfirmModal"><i class="bi bi-trash-fill"></i> Delete</button>
                </td>
            `;
            clientTableBody.appendChild(row);
        });
    }

    // Helper for status badges (unchanged)
    function getClientStatusBadge(status) {
        switch (status) {
            case 'active': return 'success';
            case 'inactive': return 'secondary';
            case 'on-break': return 'warning';
            default: return 'info';
        }
    }

    // Function to render pagination controls (unchanged)
    function renderPagination() {
        clientPagination.innerHTML = '';
        const totalPages = Math.ceil(filteredClients.length / clientsPerPage);

        if (totalPages <= 1) {
            paginationInfo.textContent = `Showing ${filteredClients.length} entries`;
            return;
        }

        const prevItem = document.createElement('li');
        prevItem.classList.add('page-item');
        if (currentPage === 1) prevItem.classList.add('disabled');
        prevItem.innerHTML = `<a class="page-link" href="#" aria-label="Previous" data-page="${currentPage - 1}"><span aria-hidden="true">&laquo;</span></a>`;
        clientPagination.appendChild(prevItem);

        for (let i = 1; i <= totalPages; i++) {
            const pageItem = document.createElement('li');
            pageItem.classList.add('page-item');
            if (i === currentPage) pageItem.classList.add('active');
            pageItem.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
            clientPagination.appendChild(pageItem);
        }

        const nextItem = document.createElement('li');
        nextItem.classList.add('page-item');
        if (currentPage === totalPages) nextItem.classList.add('disabled');
        nextItem.innerHTML = `<a class="page-link" href="#" aria-label="Next" data-page="${currentPage + 1}"><span aria-hidden="true">&raquo;</span></a>`;
        clientPagination.appendChild(nextItem);

        const startIndex = (currentPage - 1) * clientsPerPage + 1;
        const endIndex = Math.min(startIndex + clientsPerPage - 1, filteredClients.length);
        paginationInfo.textContent = `Showing ${startIndex} to ${endIndex} of ${filteredClients.length} entries`;
    }

    // Event Listeners (unchanged logic, but now interacts with backend)
    clientSearchInput.addEventListener('input', applyFiltersAndSort);

    clientPagination.addEventListener('click', function(e) {
        e.preventDefault();
        const targetPage = parseInt(e.target.dataset.page);
        if (!isNaN(targetPage) && targetPage > 0 && targetPage <= Math.ceil(filteredClients.length / clientsPerPage)) {
            currentPage = targetPage;
            renderClientTable();
            renderPagination();
        }
    });

    document.querySelectorAll('.client-table thead th[data-sort]').forEach(header => {
        header.addEventListener('click', function() {
            const column = this.dataset.sort;
            if (currentSortColumn === column) {
                currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = column;
                currentSortOrder = 'asc';
            }
            document.querySelectorAll('.client-table thead th i').forEach(icon => {
                icon.className = 'bi bi-sort-alpha-down ms-1';
            });
            const currentIcon = this.querySelector('i');
            if (currentIcon) {
                currentIcon.className = currentSortOrder === 'asc' ? 'bi bi-sort-alpha-down ms-1' : 'bi bi-sort-alpha-up ms-1';
            }
            applyFiltersAndSort();
        });
    });

    addClientBtn.addEventListener('click', function() {
        clientFormModalLabel.textContent = 'Add New Client';
        clientForm.reset();
        document.getElementById('clientId').value = '';
        clientFormModal.show();
    });

    clientTableBody.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-edit') || e.target.closest('.btn-edit')) {
            const button = e.target.closest('.btn-edit');
            const clientId = button.dataset.id;
            const client = allClients.find(c => c._id === clientId);

            if (client) {
                clientFormModalLabel.textContent = 'Edit Client';
                document.getElementById('clientId').value = client._id;
                document.getElementById('formFirstName').value = client.firstName || '';
                document.getElementById('formLastName').value = client.lastName || '';
                document.getElementById('formEmail').value = client.email || '';
                document.getElementById('formPhone').value = client.phone || '';
                document.getElementById('formDOB').value = client.dob ? new Date(client.dob).toISOString().split('T')[0] : '';
                document.getElementById('formGender').value = client.gender || '';
                document.getElementById('formActivityStatus').value = client.activityStatus || 'active';
                document.getElementById('formStartWeight').value = client.startWeight || '';
                document.getElementById('formCurrentWeight').value = client.currentWeight || '';
                document.getElementById('formGoals').value = client.goals || '';
                document.getElementById('formReason').value = client.reason || '';
                clientFormModal.show();
            }
        }
    });

    saveClientBtn.addEventListener('click', async function() {
        const clientId = document.getElementById('clientId').value;
        const isEditing = !!clientId;

        const clientData = {
            firstName: document.getElementById('formFirstName').value,
            lastName: document.getElementById('formLastName').value,
            email: document.getElementById('formEmail').value,
            phone: document.getElementById('formPhone').value,
            dob: document.getElementById('formDOB').value,
            gender: document.getElementById('formGender').value,
            activityStatus: document.getElementById('formActivityStatus').value,
            startWeight: parseFloat(document.getElementById('formStartWeight').value) || null,
            currentWeight: parseFloat(document.getElementById('formCurrentWeight').value) || null,
            goals: document.getElementById('formGoals').value,
            reason: document.getElementById('formReason').value
        };

        if (!clientData.firstName || !clientData.lastName || !clientData.email || !clientData.activityStatus) {
            alert('Please fill in all required fields (First Name, Last Name, Email, Activity Status).');
            return;
        }

        const token = getAuthToken();
        if (!token) {
            alert('Authentication token missing. Please log in.');
            return;
        }

        try {
            const method = isEditing ? 'PUT' : 'POST';
            const url = isEditing ? `/api/clients/${clientId}` : '/api/clients';
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(clientData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.msg || `Failed to ${isEditing ? 'update' : 'add'} client`);
            }

            alert(`Client ${isEditing ? 'updated' : 'added'} successfully!`);
            clientFormModal.hide();
            fetchClients();
        } catch (error) {
            console.error('Error saving client:', error);
            alert(`Error saving client: ${error.message}`);
        }
    });

    clientTableBody.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-delete') || e.target.closest('.btn-delete')) {
            const button = e.target.closest('.btn-delete');
            const clientId = button.dataset.id;
            document.getElementById('deleteClientId').value = clientId;
            deleteConfirmModal.show();
        }
    });

    confirmDeleteBtn.addEventListener('click', async function() {
        const clientIdToDelete = document.getElementById('deleteClientId').value;

        const token = getAuthToken();
        if (!token) {
            alert('Authentication token missing. Please log in.');
            return;
        }

        try {
            const response = await fetch(`/api/clients/${clientIdToDelete}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.msg || 'Failed to delete client');
            }

            alert('Client deleted successfully!');
            deleteConfirmModal.hide();
            fetchClients();
        } catch (error) {
            console.error('Error deleting client:', error);
            alert(`Error deleting client: ${error.message}`);
        }
    });

    // Initial check and fetch
    checkAdminAccess().then(hasAccess => {
        if (hasAccess) {
            fetchClients();
        }
    });
});
