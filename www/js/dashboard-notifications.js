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

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

    try {
        const response = await fetch(`${API_BASE_URL}/api/notifications`, {
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

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

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
                    await fetch(`${API_BASE_URL}/api/notifications/subscribe`, {
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
