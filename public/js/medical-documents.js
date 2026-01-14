document.addEventListener('DOMContentLoaded', () => {
    const hasMedicalRadios = document.querySelectorAll('input[name="hasMedical"]');
    const medicalDocumentsSection = document.getElementById('medicalDocumentsSection');
    const uploadDropZone = document.getElementById('uploadDropZone');
    const browseFilesBtn = document.getElementById('browseFilesBtn');
    const medicalFileInput = document.getElementById('medicalFileInput');
    const uploadedFilesList = document.getElementById('uploadedFilesList');
    const medicalConditions = document.getElementById('medicalConditions');

    window.API_BASE = window.ApiConfig.getAPI_BASE();
    let uploadedFiles = [];

    // Toggle medical documents section
    hasMedicalRadios.forEach(radio => {
        radio.addEventListener('change', e => {
            medicalDocumentsSection.style.display = e.target.value === 'yes' ? 'block' : 'none';
        });
    });

    // Browse files
    browseFilesBtn.addEventListener('click', () => medicalFileInput.click());

    // File input change
    medicalFileInput.addEventListener('change', e => handleFiles(e.target.files));

    // Drag & drop
    uploadDropZone.addEventListener('dragover', e => {
        e.preventDefault();
        uploadDropZone.classList.add('dragover');
    });

    uploadDropZone.addEventListener('dragleave', () => uploadDropZone.classList.remove('dragover'));
    uploadDropZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadDropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    // Validate file
    function validateFile(file) {
        const maxSize = 5 * 1024 * 1024;
        const allowedExts = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (file.size > maxSize) return { valid: false, error: `${file.name} exceeds 5MB` };
        if (!allowedExts.includes(ext)) return { valid: false, error: `${file.name} type not allowed` };
        return { valid: true };
    }

    function handleFiles(files) {
        const validFiles = [];
        const errors = [];
        for (const file of files) {
            const validation = validateFile(file);
            validation.valid ? validFiles.push(file) : errors.push(validation.error);
        }
        if (errors.length) alert('Validation errors:\n' + errors.join('\n'));
        validFiles.forEach(uploadFile);
    }

    // Upload file
    async function uploadFile(file) {
        const fileId = Date.now() + Math.random();
        const formData = new FormData();
        formData.append('file', file);

        const fileItem = createFileItem(fileId, file);
        uploadedFilesList.appendChild(fileItem);
        const statusEl = fileItem.querySelector('.medical-file-status');

        try {
            const res = await fetch(`${window.API_BASE}/api/v1/medical-documents/upload`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                body: formData
            });
            if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
            const data = await res.json();

            uploadedFiles.push({
                fileId,
                filename: data.filename,
                size: file.size,
                uploadedAt: new Date(),
            });

            statusEl.className = 'medical-file-status success';
            statusEl.innerHTML = '<i class="bi bi-check-circle-fill"></i> Uploaded';
            fileItem.querySelector('.remove-file-btn').disabled = false;
        } catch (err) {
            console.error('Upload error:', err);
            statusEl.className = 'medical-file-status error';
            statusEl.innerHTML = '<i class="bi bi-exclamation-circle-fill"></i> Failed';
            const removeBtn = fileItem.querySelector('.remove-file-btn');
            removeBtn.disabled = false;
            removeBtn.textContent = 'Retry';
            removeBtn.addEventListener('click', () => {
                fileItem.remove();
                uploadFile(file);
            });
        }
    }

    // Create file item UI
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
            <div class="medical-file-status uploading"><span>Uploading...</span></div>
            <div class="medical-file-actions">
                <button type="button" class="btn btn-sm btn-outline-danger remove-file-btn" disabled>Remove</button>
            </div>
        `;

        fileItem.querySelector('.remove-file-btn').addEventListener('click', async () => {
            const fileToRemove = uploadedFiles.find(f => f.fileId === fileId);
            if (fileToRemove) {
                try {
                    await fetch(`${window.API_BASE}/api/v1/medical-documents/delete`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + localStorage.getItem('token')
                        },
                        body: JSON.stringify({ filename: fileToRemove.filename })
                    });
                } catch (err) { console.error(err); }
                uploadedFiles = uploadedFiles.filter(f => f.fileId !== fileId);
            }
            fileItem.remove();
        });

        return fileItem;
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            pdf: '<i class="bi bi-file-pdf"></i>',
            doc: '<i class="bi bi-file-word"></i>',
            docx: '<i class="bi bi-file-word"></i>',
            jpg: '<i class="bi bi-image"></i>',
            jpeg: '<i class="bi bi-image"></i>',
            png: '<i class="bi bi-image"></i>'
        };
        return icons[ext] || '<i class="bi bi-file-earmark"></i>';
    }

    function truncateFileName(filename, maxLength = 40) {
        return filename.length > maxLength ? filename.substring(0, maxLength) + '...' : filename;
    }

    // Load existing medical documents
    async function loadMedicalData() {
        try {
            const res = await fetch(`${window.API_BASE}/api/v1/medical-documents/get`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
            });
            if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
            const data = await res.json();

            if (data.hasMedical) {
                document.getElementById('hasMedicalYes').checked = true;
                medicalDocumentsSection.style.display = 'block';
            }
            if (data.medicalConditions) medicalConditions.value = data.medicalConditions;

            if (Array.isArray(data.documents)) {
                data.documents.forEach(doc => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'medical-file-item';
                    const fileSize = (doc.size / 1024).toFixed(2) + ' KB';
                    const uploadDate = doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '';
                    fileItem.innerHTML = `
                        <div class="medical-file-icon">${getFileIcon(doc.filename)}</div>
                        <div class="medical-file-info">
                            <div class="medical-file-name" title="${doc.filename}">${truncateFileName(doc.filename)}</div>
                            <div class="medical-file-meta">${fileSize} • Uploaded ${uploadDate}</div>
                        </div>
                        <div class="medical-file-status success"><i class="bi bi-check-circle-fill"></i> Uploaded</div>
                        <div class="medical-file-actions">
                            <button type="button" class="btn btn-sm btn-outline-danger delete-file-btn" data-filename="${doc.filename}">Delete</button>
                        </div>
                    `;
                    uploadedFilesList.appendChild(fileItem);
                    uploadedFiles.push(doc);

                    fileItem.querySelector('.delete-file-btn').addEventListener('click', async () => {
                        if (confirm('Delete this document?')) {
                            try {
                                await fetch(`${window.API_BASE}/api/v1/medical-documents/delete`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': 'Bearer ' + localStorage.getItem('token')
                                    },
                                    body: JSON.stringify({ filename: doc.filename })
                                });
                                uploadedFiles = uploadedFiles.filter(f => f.filename !== doc.filename);
                                fileItem.remove();
                            } catch (err) { console.error(err); }
                        }
                    });
                });
            }
        } catch (err) {
            console.error('Load medical data error:', err);
        }
    }

    // Save medical info on profile submit
    const userProfileForm = document.getElementById('userProfileForm');
    if (userProfileForm) {
        userProfileForm.addEventListener('submit', async e => {
            const hasMedical = document.getElementById('hasMedicalYes').checked;
            const medicalConditionsValue = medicalConditions.value.trim() || null;

            try {
                await fetch(`${window.API_BASE}/api/v1/medical-documents/save-info`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + localStorage.getItem('token')
                    },
                    body: JSON.stringify({ hasMedical, medicalConditions: medicalConditionsValue })
                });
            } catch (err) { console.error('Save info error:', err); }
        });
    }

    loadMedicalData();
});
