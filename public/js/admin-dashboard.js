const API_BASE_URL = 'http://localhost:5000';

async function loadClients() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/clients`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const clients = await response.json();

        const tbody = document.getElementById('clientTableBody');
        tbody.innerHTML = '';

        if (clients.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">No clients found</td></tr>`;
            return;
        }

        clients.forEach(client => {
            tbody.innerHTML += `
                <tr>
                    <td class="px-6 py-4">${client.firstName}</td>
                    <td class="px-6 py-4">${client.lastName}</td>
                    <td class="px-6 py-4">${client.email}</td>
                    <td class="px-6 py-4">${client.activityStatus || ''}</td>
                    <td class="px-6 py-4">
                        <button data-id="${client._id}" class="text-blue-600 hover:text-blue-900">Edit</button>
                        <button data-id="${client._id}" class="text-red-600 hover:text-red-900">Delete</button>
                    </td>
                </tr>
            `;
        });

    } catch (error) {
        console.error('Error loading clients:', error);
    }
}

document.addEventListener('DOMContentLoaded', loadClients);
