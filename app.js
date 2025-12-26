// OKR Tracker - Offline Web Application
// Data stored in a local JSON file using File System Access API

const FILE_HANDLE_KEY = 'okr_last_file';
let fileHandle = null;
let data = { objectives: [] };

// Check if File System Access API is supported
const isFileSystemSupported = 'showOpenFilePicker' in window;

// Load data from file
async function loadFromFile() {
    try {
        const file = await fileHandle.getFile();
        const text = await file.text();
        data = JSON.parse(text);
    } catch (e) {
        data = { objectives: [] };
    }
}

// Save data to file
async function saveToFile() {
    if (!fileHandle) return;
    try {
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        updateFileStatus(true);
    } catch (e) {
        console.error('Failed to save:', e);
        updateFileStatus(false);
    }
}

// Open existing file
async function openFile() {
    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] }
            }]
        });
        await loadFromFile();
        renderObjectives();
        updateFileStatus(true);
        // Store file handle for next session
        await storeFileHandle();
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Failed to open file:', e);
        }
    }
}

// Create new file
async function createFile() {
    try {
        fileHandle = await window.showSaveFilePicker({
            suggestedName: 'okr-data.json',
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] }
            }]
        });
        data = { objectives: [] };
        await saveToFile();
        renderObjectives();
        updateFileStatus(true);
        // Store file handle for next session
        await storeFileHandle();
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Failed to create file:', e);
        }
    }
}

// Store file handle in IndexedDB for persistence
async function storeFileHandle() {
    if (!fileHandle) return;
    try {
        const db = await openIndexedDB();
        const tx = db.transaction('fileHandles', 'readwrite');
        const store = tx.objectStore('fileHandles');
        await store.put(fileHandle, FILE_HANDLE_KEY);
    } catch (e) {
        console.error('Failed to store file handle:', e);
    }
}

// Retrieve file handle from IndexedDB
async function retrieveFileHandle() {
    try {
        const db = await openIndexedDB();
        const tx = db.transaction('fileHandles', 'readonly');
        const store = tx.objectStore('fileHandles');
        return new Promise((resolve, reject) => {
            const request = store.get(FILE_HANDLE_KEY);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('Failed to retrieve file handle:', e);
        return null;
    }
}

// Open IndexedDB
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('OKRTracker', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('fileHandles')) {
                db.createObjectStore('fileHandles');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Try to restore last opened file on page load
async function tryRestoreLastFile() {
    try {
        const storedHandle = await retrieveFileHandle();
        if (storedHandle) {
            // Request permission to access the file
            const permission = await storedHandle.requestPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                fileHandle = storedHandle;
                await loadFromFile();
                renderObjectives();
                updateFileStatus(true);
                return true;
            }
        }
    } catch (e) {
        console.log('Could not restore last file:', e.message);
    }
    return false;
}

// Update file status indicator
function updateFileStatus(connected) {
    const fileName = document.getElementById('file-name');
    if (fileHandle) {
        fileName.textContent = fileHandle.name;
        fileName.classList.add('connected');
    } else {
        fileName.textContent = 'No file selected';
        fileName.classList.remove('connected');
    }
}

// Update dashboard charts
function updateDashboardCharts() {
    const groups = ['Personal', 'Team', 'Company'];
    const circumference = 2 * Math.PI * 52; // 326.73
    
    groups.forEach(group => {
        const groupLower = group.toLowerCase();
        const objectives = data.objectives.filter(obj => (obj.group || 'Personal') === group);
        const count = objectives.length;
        
        // Calculate average progress for this group
        let totalProgress = 0;
        if (count > 0) {
            objectives.forEach(obj => {
                totalProgress += calculateProgress(obj);
            });
        }
        const avgProgress = count > 0 ? Math.round(totalProgress / count) : 0;
        
        // Update count
        document.getElementById(`${groupLower}-count`).textContent = count;
        
        // Update percent
        document.getElementById(`${groupLower}-percent`).textContent = `${avgProgress}%`;
        
        // Update ring
        const ring = document.querySelector(`.ring-${groupLower}`);
        if (ring) {
            const offset = circumference - (avgProgress / 100) * circumference;
            ring.style.strokeDashoffset = offset;
        }
    });
}

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Calculate objective progress based on key results
function calculateProgress(objective) {
    if (!objective.keyResults || objective.keyResults.length === 0) {
        return 0;
    }
    const total = objective.keyResults.reduce((sum, kr) => {
        return sum + (kr.current / kr.target) * 100;
    }, 0);
    return Math.min(100, Math.round(total / objective.keyResults.length));
}

// Render all objectives
function renderObjectives() {
    const container = document.getElementById('objectives-container');
    
    if (!fileHandle) {
        container.innerHTML = `
            <div class="empty-state">
                <span>📁</span>
                <p>Open or create a JSON file to get started</p>
            </div>
        `;
        return;
    }
    
    if (data.objectives.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>🎯</span>
                <p>No objectives yet. Add your first objective above!</p>
            </div>
        `;
        return;
    }
    
    updateDashboardCharts();
    
    container.innerHTML = data.objectives.map(obj => {
        const progress = calculateProgress(obj);
        return `
            <div class="objective-card" data-id="${obj.id}">
                <div class="objective-header">
                    <div class="objective-info">
                        <div class="objective-meta">
                            <span class="obj-badge obj-group-${(obj.group || 'Personal').toLowerCase()}">${obj.group || 'Personal'}</span>
                            <span class="obj-badge">${obj.year || ''} Q${obj.quarter || ''}</span>
                            <span class="obj-badge">${obj.weight || 100}%</span>
                            ${(obj.created || obj.createdAt) ? `<span class="obj-badge">Created<br>${formatDateOnly(obj.created || obj.createdAt)}</span>` : ''}
                            ${obj.startDate ? `<span class="obj-badge">Start Date<br>${obj.startDate}</span>` : ''}
                            ${obj.targetDate ? `<span class="obj-badge">Due Date<br>${obj.targetDate}</span>` : ''}
                            ${obj.lastCheckin ? `<span class="obj-badge">Last Check-in<br>${obj.lastCheckin}</span>` : ''}
                        </div>
                        <div class="objective-content-box">
                            <label class="box-label">Objective</label>
                            <h3 class="objective-title">${escapeHtml(obj.title)}</h3>
                        </div>
                        ${obj.purpose ? `<div class="objective-content-box"><label class="box-label">Purpose</label><p class="objective-purpose">${escapeHtml(obj.purpose)}</p></div>` : ''}
                    </div>
                    <div class="objective-actions">
                        <button class="btn-icon btn-add-kr" onclick="openKRModal('${obj.id}')" title="Add Key Result">+</button>
                        <button class="btn-icon" onclick="openObjectiveModal('${obj.id}')" title="Edit">✎</button>
                        <button class="btn-icon btn-delete" onclick="deleteObjective('${obj.id}')" title="Delete">🗑</button>
                    </div>
                </div>
                    <div class="objective-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%; background: ${getProgressColor(progress)}"></div>
                        </div>
                        <div class="progress-text">
                            <span>${obj.keyResults?.length || 0} Key Results</span>
                            <span>${progress}% Complete</span>
                        </div>
                    </div>
                ${obj.keyResults && obj.keyResults.length > 0 ? `
                    <div class="key-results">
                        <h4>Key Results</h4>
                        <div class="kr-list">
                            ${obj.keyResults.map(kr => {
                                const krProgress = Math.min(100, Math.round((kr.current / kr.target) * 100));
                                const status = kr.status || 'on-track';
                                return `
                                    <div class="kr-item kr-border-${status}" data-kr-id="${kr.id}">
                                        <div class="kr-info">
                                            <div class="kr-title-row">
                                                <div class="kr-title">${escapeHtml(kr.title)}</div>
                                            </div>
                                            <div class="kr-meta-row">
                                                <span class="kr-status-badge kr-status-${status}">${getStatusLabel(status)}</span>
                                                <span class="kr-weight-badge">Weight: ${kr.weight || 100}%</span>
                                                ${(kr.created || kr.createdAt) ? `<span class="kr-meta-item">Created: ${formatDateOnly(kr.created || kr.createdAt)}</span>` : ''}
                                                ${kr.startDate ? `<span class="kr-meta-item">Start: ${kr.startDate}</span>` : ''}
                                                ${kr.targetDate ? `<span class="kr-meta-item">Target: ${kr.targetDate}</span>` : ''}
                                                ${kr.lastCheckin ? `<span class="kr-meta-item">Last Check-in: ${kr.lastCheckin}</span>` : ''}
                                            </div>
                                            <div class="kr-progress-row">
                                                <div class="kr-progress-bar">
                                                    <div class="kr-progress-fill" style="width: ${krProgress}%"></div>
                                                </div>
                                                <span class="kr-value">${kr.current} / ${kr.target}</span>
                                            </div>
                                            ${kr.evidence ? `<div class="kr-evidence-section"><label class="kr-section-label">Evidence:</label><div class="kr-evidence-content">${escapeHtml(kr.evidence)}</div></div>` : ''}
                                            ${kr.comments ? `<div class="kr-comments-section"><label class="kr-section-label">Comments:</label><div class="kr-comments-content">${escapeHtml(kr.comments)}</div></div>` : ''}
                                        </div>
                                        <div class="kr-controls">
                                            <button onclick="updateKR('${obj.id}', '${kr.id}', -10)" title="Decrease">−</button>
                                            <button onclick="updateKR('${obj.id}', '${kr.id}', 10)" title="Increase">+</button>
                                            <button onclick="openKRModal('${obj.id}', '${kr.id}')" title="Edit">✎</button>
                                            <button class="btn-delete-kr" onclick="deleteKR('${obj.id}', '${kr.id}')" title="Delete">×</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format date to show only date part (YYYY-MM-DD)
function formatDateOnly(dateString) {
    if (!dateString) return '';
    // If it's already in YYYY-MM-DD format, return as is
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateString;
    }
    // If it's an ISO string with time, extract just the date part
    if (dateString.includes('T')) {
        return dateString.split('T')[0];
    }
    return dateString;
}

// Get progress bar color based on percentage
// 0-25%: blue, 26-55%: yellowish, 56-69%: light green, 70-100%: dark green
function getProgressColor(percentage) {
    if (percentage <= 25) {
        return '#3b82f6'; // blue
    } else if (percentage <= 55) {
        return '#eab308'; // yellowish
    } else if (percentage <= 69) {
        return '#10b981'; // light green
    } else {
        return '#059669'; // dark green
    }
}

// Get status label from status value
function getStatusLabel(status) {
    const labels = {
        'on-track': 'On Track',
        'off-track': 'Off Track',
        'at-risk': 'At Risk'
    };
    return labels[status] || 'On Track';
}

// Open objective modal
function openObjectiveModal(objectiveId = null) {
    const form = document.getElementById('objective-form');
    form.reset();
    document.getElementById('objective-edit-id').value = objectiveId || '';
    
    if (objectiveId) {
        // Edit mode
        const obj = data.objectives.find(o => o.id === objectiveId);
        if (obj) {
            document.getElementById('objective-modal-title').textContent = 'Edit Objective';
            document.getElementById('objective-group').value = obj.group || 'Personal';
            document.getElementById('objective-year').value = obj.year || new Date().getFullYear();
            document.getElementById('objective-quarter').value = obj.quarter || '1';
            document.getElementById('objective-title').value = obj.title;
            document.getElementById('objective-purpose').value = obj.purpose || '';
            document.getElementById('objective-start-date').value = obj.startDate || '';
            document.getElementById('objective-target-date').value = obj.targetDate || '';
            document.getElementById('objective-weight').value = obj.weight || 100;
            document.getElementById('objective-last-checkin').value = obj.lastCheckin || '';
        }
    } else {
        // Add mode
        document.getElementById('objective-modal-title').textContent = 'Add Objective';
        document.getElementById('objective-year').value = new Date().getFullYear();
        const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
        document.getElementById('objective-quarter').value = currentQuarter;
        document.getElementById('objective-start-date').value = new Date().toISOString().split('T')[0];
    }
    
    document.getElementById('objective-modal').classList.add('active');
    document.getElementById('objective-title').focus();
}

// Auto-balance objective weights (no save, called during add)
function autoBalanceObjectiveWeights() {
    if (data.objectives.length === 0) return;
    const equalWeight = Math.floor(100 / data.objectives.length);
    const remainder = 100 - (equalWeight * data.objectives.length);
    
    data.objectives.forEach((obj, index) => {
        obj.weight = equalWeight + (index < remainder ? 1 : 0);
    });
}

// Balance other objectives after one is manually set
function balanceOtherObjectives(editedId, manualWeight) {
    if (data.objectives.length <= 1) return;
    
    const remainingWeight = 100 - manualWeight;
    const others = data.objectives.filter(o => o.id !== editedId);
    
    if (others.length === 0) return;
    
    const equalWeight = Math.floor(remainingWeight / others.length);
    const remainder = remainingWeight - (equalWeight * others.length);
    
    others.forEach((obj, index) => {
        obj.weight = equalWeight + (index < remainder ? 1 : 0);
    });
}

// Balance all objective weights equally (with save, called from button)
async function balanceObjectiveWeights() {
    autoBalanceObjectiveWeights();
    await saveToFile();
    renderObjectives();
}

// Auto-balance KR weights (no save, called during add)
function autoBalanceKRWeights(objectiveId) {
    const obj = data.objectives.find(o => o.id === objectiveId);
    if (!obj || !obj.keyResults || obj.keyResults.length === 0) return;
    
    const equalWeight = Math.floor(100 / obj.keyResults.length);
    const remainder = 100 - (equalWeight * obj.keyResults.length);
    
    obj.keyResults.forEach((kr, index) => {
        kr.weight = equalWeight + (index < remainder ? 1 : 0);
    });
}

// Balance other KRs after one is manually set
function balanceOtherKRs(objectiveId, editedKRId, manualWeight) {
    const obj = data.objectives.find(o => o.id === objectiveId);
    if (!obj || !obj.keyResults || obj.keyResults.length <= 1) return;
    
    const remainingWeight = 100 - manualWeight;
    const others = obj.keyResults.filter(kr => kr.id !== editedKRId);
    
    if (others.length === 0) return;
    
    const equalWeight = Math.floor(remainingWeight / others.length);
    const remainder = remainingWeight - (equalWeight * others.length);
    
    others.forEach((kr, index) => {
        kr.weight = equalWeight + (index < remainder ? 1 : 0);
    });
}

// Balance key result weights for a specific objective (with save, called from button)
async function balanceKRWeights(objectiveId) {
    autoBalanceKRWeights(objectiveId);
    await saveToFile();
    renderObjectives();
}

// Save objective (add or update)
async function saveObjective(formData) {
    if (!fileHandle) {
        alert('Please open or create a file first');
        return;
    }
    
    const editId = formData.editId;
    
    if (editId) {
        // Update existing
        const obj = data.objectives.find(o => o.id === editId);
        if (obj) {
            const oldWeight = obj.weight;
            obj.group = formData.group;
            obj.year = formData.year;
            obj.quarter = formData.quarter;
        obj.title = formData.title;
        obj.purpose = formData.purpose;
        obj.startDate = formData.startDate;
        obj.targetDate = formData.targetDate;
        obj.weight = formData.weight;
        obj.lastCheckin = formData.lastCheckin;
            
            // If weight changed, balance other objectives
            if (oldWeight !== formData.weight) {
                balanceOtherObjectives(editId, formData.weight);
            }
        }
    } else {
        // Add new
        const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD
        data.objectives.push({
            id: generateId(),
            group: formData.group,
            year: formData.year,
            quarter: formData.quarter,
            title: formData.title,
            purpose: formData.purpose,
            startDate: formData.startDate,
            targetDate: formData.targetDate,
            weight: 0, // Will be balanced
            lastCheckin: formData.lastCheckin,
            keyResults: [],
            createdAt: today
        });
        // Auto-balance all objective weights
        autoBalanceObjectiveWeights();
    }
    
    await saveToFile();
    renderObjectives();
}

// Delete objective
async function deleteObjective(id) {
    if (!confirm('Delete this objective and all its key results?')) return;
    data.objectives = data.objectives.filter(obj => obj.id !== id);
    await saveToFile();
    renderObjectives();
}

// Open modal to add key result
function openKRModal(objectiveId, krId = null) {
    document.getElementById('kr-objective-id').value = objectiveId;
    document.getElementById('kr-edit-id').value = krId || '';
    
    const submitBtn = document.querySelector('#kr-form button[type="submit"]');
    
    if (krId) {
        // Edit mode
        const objective = data.objectives.find(obj => obj.id === objectiveId);
        const kr = objective?.keyResults?.find(k => k.id === krId);
        if (kr) {
            document.getElementById('kr-modal-title').textContent = 'Edit Key Result';
            if (submitBtn) submitBtn.textContent = 'Save Key Result';
            document.getElementById('kr-title').value = kr.title;
            document.getElementById('kr-target').value = kr.target;
            document.getElementById('kr-start-date').value = kr.startDate || '';
            document.getElementById('kr-target-date').value = kr.targetDate || '';
            document.getElementById('kr-weight').value = kr.weight || 100;
            document.getElementById('kr-status').value = kr.status || 'on-track';
            document.getElementById('kr-last-checkin').value = kr.lastCheckin || '';
            document.getElementById('kr-evidence').value = kr.evidence || '';
            document.getElementById('kr-comments').value = kr.comments || '';
        }
    } else {
        // Add mode
        document.getElementById('kr-modal-title').textContent = 'Add Key Result';
        if (submitBtn) submitBtn.textContent = 'Add Key Result';
        document.getElementById('kr-title').value = '';
        document.getElementById('kr-target').value = '100';
        document.getElementById('kr-start-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('kr-target-date').value = '';
        document.getElementById('kr-weight').value = '100';
        document.getElementById('kr-status').value = 'on-track';
        document.getElementById('kr-last-checkin').value = '';
        document.getElementById('kr-evidence').value = '';
        document.getElementById('kr-comments').value = '';
    }
    
    document.getElementById('kr-modal').classList.add('active');
    document.getElementById('kr-title').focus();
}

// Close modal
function closeModal(modalId = 'kr-modal') {
    document.getElementById(modalId).classList.remove('active');
}

// Add or update key result
async function saveKeyResult(objectiveId, title, target, startDate, targetDate, weight, status, lastCheckin, evidence, comments, editId = null) {
    const objective = data.objectives.find(obj => obj.id === objectiveId);
    if (objective) {
        if (!objective.keyResults) objective.keyResults = [];
        
        if (editId) {
            // Update existing
            const kr = objective.keyResults.find(k => k.id === editId);
            if (kr) {
                const oldWeight = kr.weight;
                kr.title = title;
                kr.target = parseInt(target);
                kr.current = Math.min(kr.current, parseInt(target));
                kr.startDate = startDate;
                kr.targetDate = targetDate;
                kr.weight = parseInt(weight);
                kr.status = status;
                kr.lastCheckin = lastCheckin;
                kr.evidence = evidence;
                kr.comments = comments;
                
                // If weight changed, balance other KRs
                if (oldWeight !== parseInt(weight)) {
                    balanceOtherKRs(objectiveId, editId, parseInt(weight));
                }
            }
        } else {
            // Add new
            const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD
            objective.keyResults.push({
                id: generateId(),
                title: title,
                target: parseInt(target),
                current: 0,
                startDate: startDate,
                targetDate: targetDate,
                weight: 0, // Will be balanced
                status: status,
                lastCheckin: lastCheckin,
                evidence: evidence,
                comments: comments,
                createdAt: today
            });
            // Auto-balance all KR weights for this objective
            autoBalanceKRWeights(objectiveId);
        }
        await saveToFile();
        renderObjectives();
    }
}

// Update key result progress
async function updateKR(objectiveId, krId, delta) {
    const objective = data.objectives.find(obj => obj.id === objectiveId);
    if (objective) {
        const kr = objective.keyResults.find(k => k.id === krId);
        if (kr) {
            kr.current = Math.max(0, Math.min(kr.target, kr.current + delta));
            await saveToFile();
            renderObjectives();
        }
    }
}

// Delete key result
async function deleteKR(objectiveId, krId) {
    const objective = data.objectives.find(obj => obj.id === objectiveId);
    if (objective) {
        objective.keyResults = objective.keyResults.filter(k => k.id !== krId);
        await saveToFile();
        renderObjectives();
    }
}

// Export to formatted text file
function exportToText() {
    if (!data.objectives || data.objectives.length === 0) {
        alert('No objectives to export');
        return;
    }
    
    let text = '═'.repeat(60) + '\n';
    text += '                    OKR REPORT\n';
    text += '                 ' + new Date().toLocaleDateString() + '\n';
    text += '═'.repeat(60) + '\n\n';
    
    // Summary by group
    text += 'SUMMARY BY GROUP\n';
    text += '─'.repeat(40) + '\n';
    
    const groups = ['Personal', 'Team', 'Company'];
    groups.forEach(group => {
        const objectives = data.objectives.filter(obj => (obj.group || 'Personal') === group);
        const count = objectives.length;
        let totalProgress = 0;
        if (count > 0) {
            objectives.forEach(obj => {
                totalProgress += calculateProgress(obj);
            });
        }
        const avgProgress = count > 0 ? Math.round(totalProgress / count) : 0;
        text += `  ${group.padEnd(12)} ${count} objective(s)    ${avgProgress}% complete\n`;
    });
    text += '\n' + '═'.repeat(60) + '\n\n';
    
    data.objectives.forEach((obj, index) => {
        const progress = calculateProgress(obj);
        
        text += `OBJECTIVE ${index + 1}\n`;
        text += '─'.repeat(40) + '\n';
        text += `Group:       ${obj.group || 'Personal'}\n`;
        text += `Period:      ${obj.year || ''} Q${obj.quarter || ''}\n`;
        text += `Weight:      ${obj.weight || 100}%\n`;
        const createdDate = obj.created || obj.createdAt;
        text += `Created:     ${createdDate ? formatDateOnly(createdDate) : 'N/A'}\n`;
        text += `Start Date:  ${obj.startDate || 'N/A'}\n`;
        text += `Due Date:    ${obj.targetDate || 'N/A'}\n`;
        text += `Last Check-in: ${obj.lastCheckin || 'N/A'}\n`;
        text += `Progress:    ${progress}%\n\n`;
        text += `Title:\n${obj.title}\n`;
        if (obj.purpose) {
            text += `\nPurpose:\n${obj.purpose}\n`;
        }
        
        if (obj.keyResults && obj.keyResults.length > 0) {
            text += '\nKey Results:\n';
                obj.keyResults.forEach((kr, krIndex) => {
                    const krProgress = Math.min(100, Math.round((kr.current / kr.target) * 100));
                    text += `\n  ${krIndex + 1}. ${kr.title}\n`;
                    text += `     Progress: ${kr.current}/${kr.target} (${krProgress}%)\n`;
                    text += `     Status: ${getStatusLabel(kr.status || 'on-track')}\n`;
                    text += `     Weight: ${kr.weight || 100}%\n`;
                    const krCreatedDate = kr.created || kr.createdAt;
                    text += `     Created: ${krCreatedDate ? formatDateOnly(krCreatedDate) : 'N/A'}\n`;
                    if (kr.startDate && kr.targetDate) {
                        text += `     Period: ${kr.startDate} → ${kr.targetDate}\n`;
                    }
                    text += `     Last Check-in: ${kr.lastCheckin || 'N/A'}\n`;
                    if (kr.evidence) {
                        text += `     Evidence:\n${kr.evidence.split('\n').map(line => `        ${line}`).join('\n')}\n`;
                    }
                    if (kr.comments) {
                        text += `     Comments:\n${kr.comments.split('\n').map(line => `        ${line}`).join('\n')}\n`;
                    }
                });
        }
        
        text += '\n' + '═'.repeat(60) + '\n\n';
    });
    
    // Download the file
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OKR-Report-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Event Listeners
document.getElementById('btn-open-file').addEventListener('click', openFile);
document.getElementById('btn-new-file').addEventListener('click', createFile);
document.getElementById('btn-export-txt').addEventListener('click', exportToText);
document.getElementById('btn-add-objective').addEventListener('click', () => openObjectiveModal());

document.getElementById('objective-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = {
        editId: document.getElementById('objective-edit-id').value || null,
        group: document.getElementById('objective-group').value,
        year: parseInt(document.getElementById('objective-year').value),
        quarter: document.getElementById('objective-quarter').value,
        title: document.getElementById('objective-title').value.trim(),
        purpose: document.getElementById('objective-purpose').value.trim(),
        startDate: document.getElementById('objective-start-date').value,
        targetDate: document.getElementById('objective-target-date').value,
        weight: parseInt(document.getElementById('objective-weight').value),
        lastCheckin: document.getElementById('objective-last-checkin').value
    };
    if (formData.title) {
        saveObjective(formData);
        closeModal('objective-modal');
    }
});

document.getElementById('kr-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const objectiveId = document.getElementById('kr-objective-id').value;
    const editId = document.getElementById('kr-edit-id').value;
    const title = document.getElementById('kr-title').value.trim();
    const target = document.getElementById('kr-target').value;
    const startDate = document.getElementById('kr-start-date').value;
    const targetDate = document.getElementById('kr-target-date').value;
    const weight = document.getElementById('kr-weight').value;
    const status = document.getElementById('kr-status').value;
    const lastCheckin = document.getElementById('kr-last-checkin').value;
    const evidence = document.getElementById('kr-evidence').value.trim();
    const comments = document.getElementById('kr-comments').value.trim();
    if (title && target && startDate && targetDate) {
        saveKeyResult(objectiveId, title, target, startDate, targetDate, weight, status, lastCheckin, evidence, comments, editId || null);
        closeModal();
    }
});

document.getElementById('btn-balance-objectives').addEventListener('click', balanceObjectiveWeights);

document.getElementById('btn-balance-krs').addEventListener('click', () => {
    const objectiveId = document.getElementById('kr-objective-id').value;
    if (objectiveId) {
        balanceKRWeights(objectiveId);
        closeModal();
    }
});

document.getElementById('btn-help').addEventListener('click', () => {
    document.getElementById('help-modal').classList.add('active');
});

document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal || 'kr-modal';
        closeModal(modalId);
    });
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modal.id);
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            closeModal(modal.id);
        });
    }
});

// Check browser support and initial render
if (!isFileSystemSupported) {
    document.getElementById('objectives-container').innerHTML = `
        <div class="empty-state">
            <span>⚠️</span>
            <p>Your browser doesn't support the File System Access API.<br>Please use Chrome, Edge, or Opera.</p>
        </div>
    `;
    document.getElementById('btn-open-file').disabled = true;
    document.getElementById('btn-new-file').disabled = true;
    updateFileStatus(false);
} else {
    // Try to restore last file, otherwise show empty state
    tryRestoreLastFile().then(restored => {
        if (!restored) {
            renderObjectives();
            updateFileStatus(false);
        }
    });
}
