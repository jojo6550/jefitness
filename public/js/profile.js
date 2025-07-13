// profile.js
document.addEventListener('DOMContentLoaded', function() {
    // JavaScript for Profile Avatar Preview
    const avatarUpload = document.getElementById('avatarUpload');
    const profileAvatar = document.getElementById('profileAvatar');

    if (avatarUpload && profileAvatar) {
        avatarUpload.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    profileAvatar.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Function to get the JWT from localStorage (or wherever you store it)
    function getAuthToken() {
        return localStorage.getItem('token'); // Assuming you store the token here after login
    }

    // Function to load user profile data when the page loads
    async function loadUserProfile() {
        const token = getAuthToken();
        if (!token) {
            console.log('No token found, user not authenticated.');
            // Redirect to login page or show a message
            return;
        }

        try {
            const response = await fetch('/api/profile/me', { // GET request to fetch current user profile
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const userData = await response.json();

            if (response.ok) {
                // Populate the form fields with fetched data
                document.getElementById('fullName').value = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
                document.getElementById('dob').value = userData.dob ? new Date(userData.dob).toISOString().split('T')[0] : '';
                document.getElementById('gender').value = userData.gender || '';
                document.getElementById('email').value = userData.email || '';
                document.getElementById('phone').value = userData.phone || '';
                document.getElementById('activityStatus').value = userData.activityStatus || 'active';
                document.getElementById('startWeight').value = userData.startWeight || '';
                document.getElementById('currentWeight').value = userData.currentWeight || '';
                document.getElementById('goals').value = userData.goals || '';
                document.getElementById('reason').value = userData.reason || '';
                if (userData.profilePicture) {
                    profileAvatar.src = userData.profilePicture;
                }

                // Populate 'Days Enrolled' (example dynamic calculation)
                const enrolledDaysInput = document.getElementById('enrolledDays');
                if (enrolledDaysInput) {
                    // In a real app, 'days enrolled' would likely come from the user's signup date from the backend.
                    // For demonstration, let's just set a static value or calculate from a hypothetical join date.
                    const joinDate = new Date(userData.createdAt || '2024-07-12'); // Use user's creation date if available
                    const today = new Date();
                    const diffTime = Math.abs(today - joinDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    enrolledDaysInput.value = diffDays;
                }

            } else {
                console.error('Failed to load user profile:', userData.msg);
                // Handle error, e.g., redirect to login or show error message
            }
        } catch (error) {
            console.error('Network error while loading profile:', error);
        }
    }

    // Call loadUserProfile when the page loads
    loadUserProfile();


    // JavaScript for Form Submission
    const userProfileForm = document.getElementById('userProfileForm');
    const formMessage = document.getElementById('formMessage');

    if (userProfileForm && formMessage) {
        userProfileForm.addEventListener('submit', async function(event) {
            event.preventDefault(); // Prevent default form submission

            const token = getAuthToken();
            if (!token) {
                formMessage.classList.remove('d-none', 'alert-success');
                formMessage.classList.add('alert-danger');
                formMessage.textContent = 'You must be logged in to update your profile.';
                setTimeout(() => formMessage.classList.add('d-none'), 5000);
                return;
            }

            // Collect form data
            const fullName = document.getElementById('fullName').value;
            const [firstName, ...lastNameParts] = fullName.split(' ');
            const lastName = lastNameParts.join(' '); // Handle multi-word last names

            const formData = {
                firstName: firstName,
                lastName: lastName,
                dob: document.getElementById('dob').value,
                gender: document.getElementById('gender').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                activityStatus: document.getElementById('activityStatus').value,
                startWeight: parseFloat(document.getElementById('startWeight').value),
                currentWeight: parseFloat(document.getElementById('currentWeight').value),
                goals: document.getElementById('goals').value,
                reason: document.getElementById('reason').value,
                // profilePicture: // This needs special handling for file uploads
            };

            try {
                const response = await fetch('/api/profile', { // Your backend API endpoint
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` // Send the JWT
                    },
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (response.ok) {
                    formMessage.classList.remove('d-none', 'alert-danger');
                    formMessage.classList.add('alert-success');
                    formMessage.textContent = result.msg || 'Profile updated successfully!';
                    // Optionally update frontend UI with new data from result.user
                } else {
                    formMessage.classList.remove('d-none', 'alert-success');
                    formMessage.classList.add('alert-danger');
                    formMessage.textContent = result.msg || 'Error updating profile. Please try again.';
                }

            } catch (error) {
                console.error('Network or server error:', error);
                formMessage.classList.remove('d-none', 'alert-success');
                formMessage.classList.add('alert-danger');
                formMessage.textContent = 'A network error occurred. Please try again.';
            } finally {
                setTimeout(() => {
                    formMessage.classList.add('d-none');
                }, 5000);
            }
        });
    }
});
