document.addEventListener('DOMContentLoaded', () => {
    const hasMedicalRadios = document.querySelectorAll('input[name="hasMedical"]');
    const medicalDocumentsSection = document.getElementById('medicalDocumentsSection');
    const uploadDropZone = document.getElementById('uploadDropZone');
    const browseFilesBtn = document.getElementById('browseFilesBtn');
    const medicalFileInput = document.getElementById('medicalFileInput');
    const uploadedFilesList = document.getElementById('uploadedFilesList');
    const medicalConditions = document.getElementById('medicalConditions');
    const uploadProgressContainer = document.getElementById('uploadProgressContainer');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    const uploadStatus = document.getElementById('uploadStatus');

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalhost
        ? 'http://localhost:10000'
        : 'https://jefitness.onrender.com';

    let uploadedFiles = [];

    // Toggle medical documents section based on radio selection
    hasMedicalRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'yes') {
                medicalDocumentsSection.style.display = 'block';
            } else {
                medicalDocumentsSection.style.display = 'none';
            }
        });
    });

    // Browse files button
    browseFilesBtn.addEventListener('click', () => {
        medicalFileInput.click();
    });

    // Handle file input change
    medicalFileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // Drag and drop functionality
    uploadDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadDropZone.classList.add('dragover');
    });

    uploadDropZone.addEventListener('dragleave', () => {
        uploadDropZone.classList.remove('dragover');
    });

    uploadDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadDropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    // File validation
    function validateFile(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['application/pdf', 'application/msword', 
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            'image/jpeg', 'image/png'];
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];

        if (file.size > maxSize) {
            return { valid: false, error: `File "${file.name}" exceeds 5MB limit` };
        }

        const extension = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(extension) && !allowedTypes.includes(file.type)) {
            return { valid: false, error: `File type not allowed for "${file.name}". Allowed: PDF, DOC, DOCX, JPG, PNG` };
        }

        return { valid: true };
    }

    // Handle files
    function handleFiles(files) {
        const validFiles = [];
        let errors = [];

        for (let file of files) {
            const validation = validateFile(file);
            if (!validation.valid) {
                errors.push(validation.error);
            } else {
                validFiles.push(file);
            }
        }

        if (errors.length > 0) {
            alert('Validation Errors:\n' + errors.join('\n'));
        }

        // Upload valid files
        validFiles.forEach(file => {
            uploadFile(file);
        });
    }

    // Upload file
    function uploadFile(file) {
        const fileId = Date.now() + Math.random();
        const formData = new FormData();
        formData.append('file', file);

        // Create file item in UI
        const fileItem = createFileItem(fileId, file);
        uploadedFilesList.appendChild(fileItem);

        const statusEl = fileItem.querySelector('.medical-file-status');
        const statusText = fileItem.querySelector('.medical-file-status');

        // Upload to server
        fetch(`${API_BASE_URL}/api/medical-documents/upload`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            uploadedFiles.push({
                fileId: fileId,
                filename: file.name,
                size: file.size,
                uploadedAt: new Date(),
                serverPath: data.path || data.filename
            });

            statusEl.className = 'medical-file-status success';
            statusEl.innerHTML = '<i class="bi bi-check-circle-fill"></i> Uploaded';

            // Enable remove button
            const removeBtn = fileItem.querySelector('.remove-file-btn');
            removeBtn.disabled = false;
        })
        .catch(error => {
            console.error('Upload error:', error);
            statusEl.className = 'medical-file-status error';
            statusEl.innerHTML = '<i class="bi bi-exclamation-circle-fill"></i> Failed';

            const removeBtn = fileItem.querySelector('.remove-file-btn');
            removeBtn.textContent = 'Retry';
            removeBtn.disabled = false;
            removeBtn.addEventListener('click', () => {
                fileItem.remove();
                uploadFile(file);
            });
        });
    }

    // Create file item element
    function createFileItem(fileId, file) {
        const fileItem = document.createElement('div');
        fileItem.className = 'medical-file-item';
        fileItem.id = 'file-' + fileId;

        const fileIcon = getFileIcon(file.name);
        const fileSize = (file.size / 1024).toFixed(2) + ' KB';

        fileItem.innerHTML = `
            <div class="medical-file-icon">${fileIcon}</div>
            <div class="medical-file-info">
                <div class="medical-file-name" title="${file.name}">${truncateFileName(file.name)}</div>
                <div class="medical-file-meta">${fileSize}</div>
            </div>
            <div class="medical-file-status uploading">
                <div class="medical-upload-spinner"></div>
                <span>Uploading...</span>
            </div>
            <div class="medical-file-actions">
                <button type="button" class="btn btn-sm btn-outline-danger remove-file-btn" disabled>Remove</button>
            </div>
        `;

        // Remove button handler
        const removeBtn = fileItem.querySelector('.remove-file-btn');
        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const fileToRemove = uploadedFiles.find(f => f.fileId === fileId);
            if (fileToRemove) {
                // Delete from server
                fetch(`${API_BASE_URL}/api/medical-documents/delete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + localStorage.getItem('token')
                    },
                    body: JSON.stringify({ filename: fileToRemove.serverPath })
                })
                .then(response => response.json())
                .then(() => {
                    uploadedFiles = uploadedFiles.filter(f => f.fileId !== fileId);
                    fileItem.remove();
                })
                .catch(err => console.error('Delete error:', err));
            } else {
                fileItem.remove();
            }
        });

        return fileItem;
    }

    // Get file icon based on extension
    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            'pdf': '<i class="bi bi-file-pdf"></i>',
            'doc': '<i class="bi bi-file-word"></i>',
            'docx': '<i class="bi bi-file-word"></i>',
            'jpg': '<i class="bi bi-image"></i>',
            'jpeg': '<i class="bi bi-image"></i>',
            'png': '<i class="bi bi-image"></i>'
        };
        return icons[ext] || '<i class="bi bi-file-earmark"></i>';
    }

    // Truncate long filenames
    function truncateFileName(filename, maxLength = 40) {
        return filename.length > maxLength ? filename.substring(0, maxLength) + '...' : filename;
    }

    // Load existing medical documents and conditions on page load
    async function loadMedicalData() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/medical-documents/get`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });

            if (response.ok) {
                const data = await response.json();
                
                if (data.hasMedical) {
                    document.getElementById('hasMedicalYes').checked = true;
                    medicalDocumentsSection.style.display = 'block';
                }

                if (data.medicalConditions) {
                    medicalConditions.value = data.medicalConditions;
                }

                if (data.documents && data.documents.length > 0) {
                    data.documents.forEach(doc => {
                        const fileItem = document.createElement('div');
                        fileItem.className = 'medical-file-item';
                        
                        const fileIcon = getFileIcon(doc.filename);
                        const fileSize = (doc.size / 1024).toFixed(2) + ' KB';
                        const uploadDate = new Date(doc.uploadedAt).toLocaleDateString();

                        fileItem.innerHTML = `
                            <div class="medical-file-icon">${fileIcon}</div>
                            <div class="medical-file-info">
                                <div class="medical-file-name" title="${doc.filename}">${truncateFileName(doc.filename)}</div>
                                <div class="medical-file-meta">${fileSize} • Uploaded ${uploadDate}</div>
                            </div>
                            <div class="medical-file-status success">
                                <i class="bi bi-check-circle-fill"></i> Uploaded
                            </div>
                            <div class="medical-file-actions">
                                <button type="button" class="btn btn-sm btn-outline-danger delete-file-btn" data-filename="${doc.filename}">Delete</button>
                            </div>
                        `;

                        uploadedFilesList.appendChild(fileItem);
                        uploadedFiles.push(doc);

                        // Delete button handler
                        fileItem.querySelector('.delete-file-btn').addEventListener('click', (e) => {
                            e.preventDefault();
                            if (confirm('Are you sure you want to delete this document?')) {
                                fetch(`${API_BASE_URL}/api/medical-documents/delete`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': 'Bearer ' + localStorage.getItem('token')
                                    },
                                    body: JSON.stringify({ filename: doc.filename })
                                })
                                .then(response => response.json())
                                .then(() => {
                                    fileItem.remove();
                                    uploadedFiles = uploadedFiles.filter(f => f.filename !== doc.filename);
                                })
                                .catch(err => console.error('Delete error:', err));
                            }
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Error loading medical data:', error);
        }
    }

    // Hook into profile form submission to save medical data
    const userProfileForm = document.getElementById('userProfileForm');
    const originalSubmitHandler = userProfileForm.onsubmit;

    userProfileForm.addEventListener('submit', async (e) => {
        // Get medical data before form submission
        const hasMedical = document.getElementById('hasMedicalYes').checked ? 'yes' : 'no';
        const medicalConditionsValue = medicalConditions.value.trim() || null;

        // Save medical data to server
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_BASE_URL}/api/medical-documents/save-info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    hasMedical: hasMedical === 'yes',
                    medicalConditions: medicalConditionsValue
                })
            });
        } catch (error) {
            console.error('Error saving medical info:', error);
        }
    });

    // Load medical data on page load
    loadMedicalData();
});
