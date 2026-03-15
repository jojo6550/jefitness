document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('userProfileForm');
    const formMessage = document.getElementById('formMessage');

    window.API_BASE = window.ApiConfig.getAPI_BASE();

    let currentUserId = null;

    // Helper to show messages
    function showMessage(message, type = 'success') {
        formMessage.textContent = message;
        formMessage.className = 'alert alert-' + type;
        formMessage.classList.remove('d-none');
        setTimeout(() => {
            formMessage.classList.add('d-none');
        }, 5000);
    }

    // Fetch profile data and populate form
    async function loadProfile() {
        try {
            const response = await fetch(`${window.API_BASE}/api/v1/users/profile`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });
            if (!response.ok) {
                throw new Error('Failed to load profile data');
            }
            const data = await response.json();

            // Store user ID for updates
            currentUserId = data._id;

            // Populate form fields
            document.getElementById('fullName').value = (data.firstName || '') + ' ' + (data.lastName || '');
            if (data.dob) document.getElementById('dob').value = new Date(data.dob).toISOString().split('T')[0];
            if (data.gender) document.getElementById('gender').value = data.gender;
            if (data.email) document.getElementById('email').value = data.email;
            if (data.phone) document.getElementById('phone').value = data.phone;
            if (data.activityStatus) document.getElementById('activityStatus').value = data.activityStatus;
            if (data.startWeight !== undefined && data.startWeight !== null) document.getElementById('startWeight').value = data.startWeight;
            if (data.currentWeight !== undefined && data.currentWeight !== null) document.getElementById('currentWeight').value = data.currentWeight;
            if (data.goals) document.getElementById('goals').value = data.goals;
            if (data.reason) document.getElementById('reason').value = data.reason;

            // Calculate days enrolled
            if (data.createdAt) {
                const createdDate = new Date(data.createdAt);
                const now = new Date();
                const diffTime = Math.abs(now - createdDate);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                document.getElementById('enrolledDays').value = diffDays;
            }
        } catch (error) {
            showMessage(error.message, 'danger');
        }
    }

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUserId) {
            showMessage('Profile not loaded yet. Please wait and try again.', 'danger');
            return;
        }

        // Extract form values
        const fullName = document.getElementById('fullName').value.trim();
        const [firstName, ...lastNameParts] = fullName.split(' ');
        const lastName = lastNameParts.join(' ');
        const dob = document.getElementById('dob').value || null;
        const gender = document.getElementById('gender').value || null;
        const phone = document.getElementById('phone').value.trim() || null;
        const activityStatus = document.getElementById('activityStatus').value || null;
        const startWeight = parseFloat(document.getElementById('startWeight').value) || null;
        const currentWeight = parseFloat(document.getElementById('currentWeight').value) || null;
        const goals = document.getElementById('goals').value.trim() || null;
        const reason = document.getElementById('reason').value.trim() || null;

        // Validate required fields
        if (!firstName || !lastName) {
            showMessage('Please enter your full name (first and last).', 'danger');
            return;
        }

        // Prepare payload
        const payload = {
            firstName,
            lastName,
            dob,
            gender,
            phone,
            activityStatus,
            startWeight,
            currentWeight,
            goals,
            reason
        };

        try {
            const response = await fetch(`${window.API_BASE}/api/v1/users/${currentUserId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || errorData.msg || 'Failed to update profile');
            }

            await response.json();
            window.Toast.success('Profile updated successfully.');

            // Dispatch event so medical-documents.js can save medical info
            window.dispatchEvent(new Event('profileFormSubmitted'));

        } catch (error) {
            window.Toast.error(error.message || 'Failed to update profile');
        }
    });

    loadProfile();
});
