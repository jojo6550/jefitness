// frontend/js/profile.js

document.addEventListener('DOMContentLoaded', async function() {
    const userProfileForm = document.getElementById('userProfileForm');
    const formMessage = document.getElementById('formMessage');

    // Form fields (ensure these IDs match your HTML)
    const profileAvatar = document.getElementById('profileAvatar');
    const avatarUpload = document.getElementById('avatarUpload');
    const fullNameInput = document.getElementById('fullName');
    const dobInput = document.getElementById('dob');
    const genderSelect = document.getElementById('gender');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const enrolledDaysInput = document.getElementById('enrolledDays'); // Read-only
    const activityStatusSelect = document.getElementById('activityStatus');
    const startWeightInput = document.getElementById('startWeight');
    const currentWeightInput = document.getElementById('currentWeight');
    const goalsTextarea = document.getElementById('goals');
    const reasonTextarea = document.getElementById('reason');

    // Helper function to get JWT from localStorage
    function getAuthToken() {
        return localStorage.getItem('token');
    }

    // Function to display messages (success/error)
    function showMessage(message, type = 'success') {
        formMessage.textContent = message;
        formMessage.classList.remove('d-none', 'alert-success', 'alert-danger');
        formMessage.classList.add(`alert-${type}`);
        // Hide message after 5 seconds
        setTimeout(() => {
            formMessage.classList.add('d-none');
        }, 5000);
    }

    // Function to fetch user profile data
    async function fetchUserProfile() {
        const token = getAuthToken();
        if (!token) {
            console.error('Profile: No authentication token found. Redirecting to login.');
            // Assuming your login page is at /pages/login.html
            window.location.href = '/pages/login.html';
            return;
        }

        try {
            // This endpoint fetches the currently logged-in user's profile
            const response = await fetch('/api/profile/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                // Token expired or invalid, clear it and redirect to login
                console.error('Profile: Token expired or invalid. Redirecting to login.');
                localStorage.removeItem('token');
                window.location.href = '/pages/login.html';
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.msg || `HTTP error! status: ${response.status}`);
            }

            const userData = await response.json();
            console.log('Profile: User data fetched:', userData);
            populateForm(userData);

        } catch (error) {
            console.error('Profile: Error fetching user profile:', error);
            // Handle cases where the response might not be valid JSON (e.g., HTML error page)
            if (error.message.includes('json') || error.message.includes('JSON')) {
                showMessage(`Failed to load profile. Server might have sent an invalid response. Check your backend console for errors.`, 'danger');
            } else {
                showMessage(`Failed to load profile: ${error.message}`, 'danger');
            }
        }
    }

    // Function to populate form fields with fetched data
    function populateForm(userData) {
        // Combine firstName and lastName for the fullName input
        fullNameInput.value = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();

        // Format Date of Birth for HTML date input
        if (userData.dob) {
            const dobDate = new Date(userData.dob);
            dobInput.value = dobDate.toISOString().split('T')[0];
        } else {
            dobInput.value = '';
        }

        genderSelect.value = userData.gender || '';
        emailInput.value = userData.email || '';
        emailInput.readOnly = true; // Email is typically not editable from profile page
        emailInput.classList.add('readonly-field'); // Add class for styling read-only fields

        phoneInput.value = userData.phone || '';

        // Calculate and display "Days Enrolled"
        if (userData.createdAt) {
            const joinDate = new Date(userData.createdAt);
            const today = new Date();
            const diffTime = Math.abs(today - joinDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            enrolledDaysInput.value = diffDays;
        } else {
            enrolledDaysInput.value = 'N/A';
        }

        activityStatusSelect.value = userData.activityStatus || 'active';
        // Display numerical values, handle null/undefined by showing empty string
        startWeightInput.value = userData.startWeight !== null && userData.startWeight !== undefined ? userData.startWeight : '';
        currentWeightInput.value = userData.currentWeight !== null && userData.currentWeight !== undefined ? userData.currentWeight : '';
        goalsTextarea.value = userData.goals || '';
        reasonTextarea.value = userData.reason || '';

        // Set profile picture source
        if (userData.profilePicture) {
            // Assuming profilePicture is a URL relative to your static files root
            profileAvatar.src = userData.profilePicture;
        } else {
            profileAvatar.src = '../images/default-avatar.png'; // Default avatar path
        }
    }

    // Handle form submission (Save Changes)
    userProfileForm.addEventListener('submit', async function(event) {
        event.preventDefault(); // IMPORTANT: Prevent default form submission (page reload)

        const token = getAuthToken();
        if (!token) {
            console.error('Profile: No authentication token found. Redirecting to login.');
            window.location.href = '/pages/login.html';
            return;
        }

        // Extract data from form fields
        const fullName = fullNameInput.value.trim();
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const profileData = {
            firstName: firstName,
            lastName: lastName,
            phone: phoneInput.value,
            dob: dobInput.value, // Send as YYYY-MM-DD string
            gender: genderSelect.value,
            activityStatus: activityStatusSelect.value,
            // Convert to number or null if empty string/null
            startWeight: startWeightInput.value === '' ? null : parseFloat(startWeightInput.value),
            currentWeight: currentWeightInput.value === '' ? null : parseFloat(currentWeightInput.value),
            goals: goalsTextarea.value,
            reason: reasonTextarea.value,
            // profilePicture is not handled in this save logic; it would require file upload
        };

        // Basic client-side validation
        if (!profileData.firstName || !profileData.lastName || !profileData.activityStatus) {
            showMessage('Please fill in First Name, Last Name, and Activity Status.', 'danger');
            return;
        }

        try {
            // Send PUT request to update profile
            const response = await fetch('/api/profile/me', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profileData)
            });

            if (!response.ok) {
                // Attempt to parse error JSON from backend
                const errorData = await response.json();
                throw new Error(errorData.msg || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Profile update successful:', result);
            showMessage('Profile updated successfully!', 'success');
            // Re-fetch profile data to ensure form reflects any backend-processed values
            fetchUserProfile();

        } catch (error) {
            console.error('Profile: Error updating profile:', error);
            if (error.message.includes('json') || error.message.includes('JSON')) {
                showMessage(`Failed to update profile. Server sent an invalid response. Check your backend console.`, 'danger');
            } else {
                showMessage(`Failed to update profile: ${error.message}`, 'danger');
            }
        }
    });

    // Initial fetch of user profile data when the page loads
    fetchUserProfile();

    // Optional: Basic local preview for avatar upload (does not save to backend)
    avatarUpload.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                profileAvatar.src = e.target.result;
            };
            reader.readAsDataURL(this.files[0]);
        }
    });
});
