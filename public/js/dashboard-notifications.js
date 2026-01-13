// Dashboard Notifications Management
document.addEventListener('DOMContentLoaded', function() {
    // Load notifications when dashboard initializes
    if (window.initDashboard) {
        const originalInitDashboard = window.initDashboard;
        window.initDashboard = async () => {
            await originalInitDashboard();
            await loadNotifications();
            await registerPushNotifications();
        };
    } else {
        // Fallback if initDashboard doesn't exist
        loadNotifications();
        registerPushNotifications();
    }
});

// Load and display user notifications
async function loadNotifications() {
    const token = localStorage.getItem('token');
    if (!token) return;

    
    const API_BASE = window.ApiConfig.getAPI_BASE();
    try {
        const response = await fetch(`${API_BASE}/api/notifications`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayNotifications(data.notifications.slice(0, 5)); // Show latest 5 notifications
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Display notifications on dashboard
function displayNotifications(notifications) {
    // Remove existing notification section if present
    const existingSection = document.querySelector('.notifications-section');
    if (existingSection) {
        existingSection.remove();
    }

    if (notifications.length === 0) {
        return; // No notifications to display
    }

    // Create notifications section
    const notificationsSection = document.createElement('div');
    notificationsSection.className = 'notifications-section mb-5';
    notificationsSection.innerHTML = `
        <div class="welcome-section text-center mb-4 p-3 rounded-4 shadow-sm bg-light">
            <h2 class="h4 fw-bold text-primary mb-3">📢 Recent Notifications</h2>
            <div class="notifications-list">
                ${notifications.map(notification => `
                    <div class="notification-item p-3 mb-2 bg-white rounded shadow-sm border-start border-4 ${
                        notification.priority === 'urgent' ? 'border-danger' :
                        notification.priority === 'high' ? 'border-warning' :
                        notification.priority === 'medium' ? 'border-info' : 'border-secondary'
                    }">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <h6 class="mb-1 fw-bold">${notification.title}</h6>
                                <p class="mb-1 text-muted small">${notification.message}</p>
                                <small class="text-muted">
                                    ${new Date(notification.sentAt).toLocaleDateString()} •
                                    ${notification.type.replace('-', ' ')}
                                </small>
                            </div>
                            <span class="badge ${
                                notification.priority === 'urgent' ? 'bg-danger' :
                                notification.priority === 'high' ? 'bg-warning' :
                                notification.priority === 'medium' ? 'bg-info' : 'bg-secondary'
                            }">${notification.priority}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
            <a href="#" class="btn btn-outline-primary btn-sm mt-2" onclick="showAllNotifications()">View All Notifications</a>
        </div>
    `;

    // Insert after welcome section
    const welcomeSection = document.querySelector('.welcome-section');
    if (welcomeSection) {
        welcomeSection.insertAdjacentElement('afterend', notificationsSection);
    }
}

// Show all notifications (placeholder for future implementation)
function showAllNotifications() {
    alert('Full notifications view coming soon!');
}

// Register for push notifications
async function registerPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in navigator)) {
        console.log('Push notifications not supported');
        return;
    }

    
    const API_BASE = window.ApiConfig.getAPI_BASE();
    try {
        const registration = await navigator.serviceWorker.ready;

        // Check if already subscribed
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // Request permission and subscribe
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array('YOUR_VAPID_PUBLIC_KEY') // Replace with actual key
                });

                // Send subscription to server
                const token = localStorage.getItem('token');
                if (token && subscription) {
                    await fetch(`${API_BASE}/api/notifications/subscribe`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ subscription })
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error registering push notifications:', error);
    }
}

// Initialize WebSocket for real-time notifications
function initializeWebSocket() {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Connect to WebSocket
    window.wsManager.connect(token);

    // Handle connection
    window.wsManager.onConnect = () => {
        console.log('WebSocket connected for notifications');
    };

    // Handle incoming messages
    window.wsManager.addMessageHandler('notification', (data) => {
        handleRealTimeNotification(data.notification);
    });

    window.wsManager.addMessageHandler('appointment_update', (data) => {
        handleAppointmentUpdate(data.appointment);
    });

    window.wsManager.addMessageHandler('message', (data) => {
        handleNewMessage(data.message);
    });
}

// Handle real-time notification
function handleRealTimeNotification(notification) {
    // Show toast notification
    showToastNotification(notification);

    // Add to notifications list if on dashboard
    if (document.querySelector('.notifications-list')) {
        addNotificationToList(notification);
    }

    // Play notification sound if supported
    if ('Audio' in window) {
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.play().catch(() => {}); // Ignore errors if sound fails
        } catch (e) {
            // Sound not available
        }
    }
}

// Handle appointment updates
function handleAppointmentUpdate(appointment) {
    const notification = {
        title: 'Appointment Update',
        message: `Your appointment on ${new Date(appointment.date).toLocaleDateString()} has been ${appointment.status}`,
        type: 'appointment',
        priority: 'high',
        sentAt: new Date()
    };
    handleRealTimeNotification(notification);
}

// Handle new messages
function handleNewMessage(message) {
    const notification = {
        title: 'New Message',
        message: `You have a new message from ${message.sender}`,
        type: 'message',
        priority: 'medium',
        sentAt: new Date()
    };
    handleRealTimeNotification(notification);
}

// Show toast notification
function showToastNotification(notification) {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        toastContainer.style.zIndex = '1070';
        document.body.appendChild(toastContainer);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-primary border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                <strong>${notification.title}</strong><br>
                <small>${notification.message}</small>
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;

    toastContainer.appendChild(toast);

    // Initialize and show toast
    const bsToast = new bootstrap.Toast(toast, { delay: 5000 });
    bsToast.show();

    // Remove toast after it's hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

// Add notification to existing list
function addNotificationToList(notification) {
    const notificationsList = document.querySelector('.notifications-list');
    if (!notificationsList) return;

    const notificationElement = document.createElement('div');
    notificationElement.className = `notification-item p-3 mb-2 bg-white rounded shadow-sm border-start border-4 ${
        notification.priority === 'urgent' ? 'border-danger' :
        notification.priority === 'high' ? 'border-warning' :
        notification.priority === 'medium' ? 'border-info' : 'border-secondary'
    }`;
    notificationElement.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
                <h6 class="mb-1 fw-bold">${notification.title}</h6>
                <p class="mb-1 text-muted small">${notification.message}</p>
                <small class="text-muted">
                    Just now • ${notification.type.replace('-', ' ')}
                </small>
            </div>
            <span class="badge ${
                notification.priority === 'urgent' ? 'bg-danger' :
                notification.priority === 'high' ? 'bg-warning' :
                notification.priority === 'medium' ? 'bg-info' : 'bg-secondary'
            }">${notification.priority}</span>
        </div>
    `;

    // Insert at the beginning
    notificationsList.insertBefore(notificationElement, notificationsList.firstChild);

    // Animate the new notification
    notificationElement.style.animation = 'slideInLeft 0.5s ease-out';
}

// Utility function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
