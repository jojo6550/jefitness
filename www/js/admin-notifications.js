// Admin Notifications Management
(function() {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

    document.addEventListener('DOMContentLoaded', function() {
    const sendNotificationBtn = document.getElementById('sendNotificationBtn');
    const notificationForm = document.querySelector('#notifications-section form');
    const broadcastCheckbox = document.getElementById('broadcastNotification');
    const userSelectContainer = document.getElementById('userSelectContainer');
    const selectedUsers = document.getElementById('selectedUsers');
    const refreshNotificationsBtn = document.getElementById('refreshNotifications');
    const notificationsTableBody = document.getElementById('notificationsTableBody');

    // Toggle user selection based on broadcast checkbox
    broadcastCheckbox.addEventListener('change', function() {
        if (this.checked) {
            userSelectContainer.style.display = 'none';
            selectedUsers.required = false;
        } else {
            userSelectContainer.style.display = 'block';
            selectedUsers.required = true;
            loadUsersForSelection();
        }
    });

    // Send notification
    sendNotificationBtn.addEventListener('click', async function() {
        const title = document.getElementById('notificationTitle').value.trim();
        const message = document.getElementById('notificationMessage').value.trim();
        const type = document.getElementById('notificationType').value;
        const priority = document.getElementById('notificationPriority').value;
        const isBroadcast = broadcastCheckbox.checked;
        const selectedUserIds = Array.from(selectedUsers.selectedOptions).map(option => option.value);

        if (!title || !message) {
            alert('Please fill in both title and message');
            return;
        }

        if (!isBroadcast && selectedUserIds.length === 0) {
            alert('Please select users or enable broadcast');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/notifications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    title,
                    message,
                    type,
                    priority,
                    isBroadcast,
                    selectedUsers: isBroadcast ? [] : selectedUserIds
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Notification sent successfully!');
                // Clear form
                document.getElementById('notificationTitle').value = '';
                document.getElementById('notificationMessage').value = '';
                document.getElementById('notificationType').value = 'general-announcement';
                document.getElementById('notificationPriority').value = 'medium';
                broadcastCheckbox.checked = false;
                userSelectContainer.style.display = 'block';
                selectedUsers.innerHTML = '';
                selectedUsers.required = true;

                // Refresh notifications list
                loadNotifications();
            } else {
                alert(data.msg || 'Failed to send notification');
            }
        } catch (error) {
            console.error('Error sending notification:', error);
            alert('Error sending notification. Please try again.');
        }
    });

    // Load users for selection
    async function loadUsersForSelection() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/users`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const users = await response.json();
                selectedUsers.innerHTML = '';

                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user._id;
                    option.textContent = `${user.firstName} ${user.lastName} (${user.email})`;
                    selectedUsers.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    // Load notifications history
    async function loadNotifications() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/notifications/admin`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                displayNotifications(data.notifications);
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    // Display notifications in table
    function displayNotifications(notifications) {
        notificationsTableBody.innerHTML = '';

        if (notifications.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">No notifications sent yet</td>';
            notificationsTableBody.appendChild(row);
            return;
        }

        notifications.forEach(notification => {
            const row = document.createElement('tr');
            const sentAt = new Date(notification.sentAt).toLocaleString();
            const recipientCount = notification.isBroadcast ?
                'All Users' :
                `${notification.recipients.length} User${notification.recipients.length !== 1 ? 's' : ''}`;

            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${notification.title}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${notification.type.replace('-', ' ')}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${sentAt}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${recipientCount}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${notification.status}</td>
            `;
            notificationsTableBody.appendChild(row);
        });
    }

    // Refresh notifications
    refreshNotificationsBtn.addEventListener('click', loadNotifications);

    // Load initial data
    loadNotifications();
    });
})();
