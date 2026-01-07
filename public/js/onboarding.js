/**
 * Interactive Onboarding Guide for JE Fitness
 * Guides users through profile setup, medical info, and feature introduction
 */

class OnboardingGuide {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 5;
        this.currentFeature = 0;
        this.totalFeatures = 4;
        this.profileData = {};
        this.medicalData = { hasMedical: false, conditions: '', files: [] };
        
        this.isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        this.API_BASE_URL = this.isLocalhost
            ? 'http://localhost:10000'
            : 'https://jefitness.onrender.com';

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateProgress();
    }

    setupEventListeners() {
        // Medical condition toggle
        const medicalRadios = document.querySelectorAll('input[name="hasMedical"]');
        medicalRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('medicalConditionsDiv').style.display = 
                    e.target.value === 'yes' ? 'block' : 'none';
                this.medicalData.hasMedical = e.target.value === 'yes';
            });
        });

        // Medical file upload
        const uploadZone = document.getElementById('onbUploadZone');
        const fileInput = document.getElementById('onbMedicalFile');

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            this.handleFileUpload(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });
    }

    handleFileUpload(files) {
        const uploadedFilesDiv = document.getElementById('onbUploadedFiles');
        
        for (let file of files) {
            // Basic validation
            const maxSize = 5 * 1024 * 1024; // 5MB
            const allowedTypes = ['application/pdf', 'application/msword',
                                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'image/jpeg', 'image/png'];
            
            if (file.size > maxSize) {
                alert(`File "${file.name}" exceeds 5MB limit`);
                continue;
            }

            this.medicalData.files.push(file);

            // Display file
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item mt-2';
            fileItem.innerHTML = `
                <div class="d-flex align-items-center p-2 bg-light rounded">
                    <i class="bi bi-file-earmark me-2"></i>
                    <span>${file.name}</span>
                    <small class="ms-auto text-muted">${(file.size / 1024).toFixed(2)} KB</small>
                </div>
            `;
            uploadedFilesDiv.appendChild(fileItem);
        }
    }

    nextStep() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateProgress();
            this.showStep(this.currentStep);
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateProgress();
            this.showStep(this.currentStep);
        }
    }

    showStep(stepNum) {
        // Hide all steps
        document.querySelectorAll('.onboarding-step').forEach(step => {
            step.classList.remove('active');
        });

        // Show current step
        const currentStepEl = document.getElementById(`step-${this.getStepName(stepNum)}`);
        if (currentStepEl) {
            currentStepEl.classList.add('active');
        }

        // Scroll to top
        document.querySelector('.onboarding-wrapper').scrollIntoView({ behavior: 'smooth' });
    }

    getStepName(num) {
        const names = ['welcome', 'profile', 'medical', 'features', 'complete'];
        return names[num - 1] || 'welcome';
    }

    updateProgress() {
        const progressPercent = (this.currentStep / this.totalSteps) * 100;
        document.getElementById('progressBar').style.width = progressPercent + '%';
        document.getElementById('currentStep').textContent = this.currentStep;
        document.getElementById('totalSteps').textContent = this.totalSteps;
    }

    saveProfile() {
        const fullName = document.getElementById('onbFullName').value.trim();
        const [firstName, ...lastNameParts] = fullName.split(' ');
        const lastName = lastNameParts.join(' ') || '';

        if (!firstName || !lastName) {
            alert('Please enter your full name (first and last).');
            return;
        }

        this.profileData = {
            firstName: firstName,
            lastName: lastName,
            dob: document.getElementById('onbDob').value || null,
            gender: document.getElementById('onbGender').value || null,
            phone: document.getElementById('onbPhone').value.trim() || null,
            currentWeight: parseFloat(document.getElementById('onbWeight').value) || null,
            goals: document.getElementById('onbGoals').value.trim() || null
        };

        // Save to backend
        this.updateProfileData(this.profileData);
        this.nextStep();
    }

    saveMedical() {
        const hasMedical = document.getElementById('medicalYes').checked;
        const conditions = document.getElementById('onbMedicalConditions').value.trim() || null;

        this.medicalData.hasMedical = hasMedical;
        this.medicalData.conditions = conditions;

        // Save medical info to backend
        this.saveMedicalData(this.medicalData);
        this.nextStep();
    }

    nextFeature() {
        if (this.currentFeature < this.totalFeatures - 1) {
            this.showFeature(this.currentFeature + 1);
        }
    }

    prevFeature() {
        if (this.currentFeature > 0) {
            this.showFeature(this.currentFeature - 1);
        }
    }

    showFeature(featureNum) {
        // Hide all features
        document.querySelectorAll('.feature-card').forEach(card => {
            card.classList.remove('active');
        });

        // Show current feature
        document.getElementById(`feature-${featureNum}`).classList.add('active');

        // Update counter
        document.getElementById('featureCounter').textContent = `${featureNum + 1} / ${this.totalFeatures}`;

        // Update navigation buttons
        document.getElementById('prevFeatureBtn').disabled = featureNum === 0;
        document.getElementById('nextFeatureBtn').disabled = featureNum === this.totalFeatures - 1;

        this.currentFeature = featureNum;
    }

    async updateProfileData(data) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                console.error('Error updating profile');
            }
        } catch (error) {
            console.error('Profile update error:', error);
        }
    }

    async saveMedicalData(data) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/medical-documents/save-info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({
                    hasMedical: data.hasMedical,
                    medicalConditions: data.conditions
                })
            });

            if (response.ok) {
                // Upload files if any
                for (let file of data.files) {
                    await this.uploadMedicalFile(file);
                }
            }
        } catch (error) {
            console.error('Medical data save error:', error);
        }
    }

    async uploadMedicalFile(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${this.API_BASE_URL}/api/medical-documents/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: formData
            });

            if (!response.ok) {
                console.error('Error uploading medical file');
            }
        } catch (error) {
            console.error('File upload error:', error);
        }
    }

    skipOnboarding() {
        if (confirm('Are you sure? You can complete setup anytime from your profile.')) {
            this.markOnboardingComplete();
            window.location.href = './dashboard.html';
        }
    }

    completeOnboarding() {
        this.markOnboardingComplete();
        window.location.href = './dashboard.html';
    }

    markOnboardingComplete() {
        try {
            const token = localStorage.getItem('token');
            fetch(`${this.API_BASE_URL}/api/auth/onboarding-complete`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            }).catch(err => console.error('Onboarding completion error:', err));
        } catch (error) {
            console.error('Error marking onboarding complete:', error);
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.onboardingGuide = new OnboardingGuide();
});
