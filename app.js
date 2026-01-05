// OKR Tracker - Offline Web Application
// Data stored in a local JSON file using File System Access API

const FILE_HANDLE_KEY = 'okr_last_file';
const LOCALSTORAGE_DATA_KEY = 'okr_data_cache';
let fileHandle = null;
let data = { objectives: [], history: [] };
let selectedGroupFilter = null; // null = show all, 'Personal'/'Team'/'Company' = filter by group

// Check if File System Access API is supported
const isFileSystemSupported = 'showOpenFilePicker' in window;

// Save data to localStorage (autosave cache)
function saveToLocalStorage() {
    try {
        if (!data.objectives) {
            data.objectives = [];
        }
        if (!data.history) {
            data.history = [];
        }
        localStorage.setItem(LOCALSTORAGE_DATA_KEY, JSON.stringify(data));
    } catch (e) {
        // Handle quota exceeded or other localStorage errors gracefully
        if (e.name === 'QuotaExceededError') {
            console.warn('LocalStorage quota exceeded, cache not saved');
        } else {
            console.warn('Failed to save to localStorage:', e);
        }
    }
}

// Load data from localStorage (autosave cache)
function loadFromLocalStorage() {
    try {
        const cached = localStorage.getItem(LOCALSTORAGE_DATA_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            // Ensure history array exists
            if (!parsed.history) {
                parsed.history = [];
            }
            // Ensure objectives array exists
            if (!parsed.objectives) {
                parsed.objectives = [];
            }
            return parsed;
        }
    } catch (e) {
        console.warn('Failed to load from localStorage:', e);
    }
    return null;
}

// Load data from file
async function loadFromFile() {
    try {
        const file = await fileHandle.getFile();
        const text = await file.text();
        data = JSON.parse(text);
        // Ensure history array exists
        if (!data.history) {
            data.history = [];
        }
        // Ensure objectives array exists
        if (!data.objectives) {
            data.objectives = [];
        }
        // Save to localStorage after loading from file
        saveToLocalStorage();
        // Update charts after loading data
        updateDashboardCharts();
    } catch (e) {
        data = { objectives: [], history: [] };
        // Update charts even on error to reset them
        updateDashboardCharts();
    }
}

// Save data to file
async function saveToFile() {
    if (!fileHandle) return;
    try {
        // Ensure data structure is correct before saving
        if (!data.objectives) {
            data.objectives = [];
        }
        if (!data.history) {
            data.history = [];
        }
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        // Save to localStorage after saving to file
        saveToLocalStorage();
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
        updateDashboardCharts();
        renderObjectives();
        updateFileStatus(true);
        setupChartClickHandlers();
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
        data = { objectives: [], history: [] };
        await saveToFile();
        updateDashboardCharts();
        renderObjectives();
        updateFileStatus(true);
        setupChartClickHandlers();
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
        // First, try to load from localStorage cache for immediate display
        const cachedData = loadFromLocalStorage();
        if (cachedData) {
            data = cachedData;
            updateDashboardCharts();
            renderObjectives();
            updateFileStatus(true);
        }
        
        // Then, try to restore the file handle and load from file (to get latest version)
        const storedHandle = await retrieveFileHandle();
        if (storedHandle) {
            // Request permission to access the file
            const permission = await storedHandle.requestPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                fileHandle = storedHandle;
                await loadFromFile(); // This will overwrite cached data with file data and update cache
                updateDashboardCharts();
                renderObjectives();
                updateFileStatus(true);
                return true;
            }
        }
        
        // If we have cached data but no file handle, still return true to indicate we have data
        if (cachedData) {
            return true;
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
    
    // Ensure data.objectives exists and is an array
    if (!data || !data.objectives || !Array.isArray(data.objectives)) {
        data = data || {};
        data.objectives = [];
    }
    
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
        
        // Update count - force to 0 if no objectives
        const countElement = document.getElementById(`${groupLower}-count`);
        if (countElement) {
            countElement.textContent = count;
        }
        
        // Update percent - force to 0% if no objectives
        const percentElement = document.getElementById(`${groupLower}-percent`);
        if (percentElement) {
            percentElement.textContent = `${avgProgress}%`;
        }
        
        // Update ring - reset to 0 if no objectives
        const ring = document.querySelector(`.ring-${groupLower}`);
        if (ring) {
            const offset = circumference - (avgProgress / 100) * circumference;
            ring.style.strokeDashoffset = offset;
        }
    });
}

// Update filter indicators on chart containers
function updateFilterIndicators() {
    const groups = ['Personal', 'Team', 'Company'];
    groups.forEach(group => {
        const chartContainer = document.getElementById(`chart-${group.toLowerCase()}`);
        if (chartContainer) {
            if (selectedGroupFilter === group) {
                chartContainer.classList.add('chart-filter-active');
            } else {
                chartContainer.classList.remove('chart-filter-active');
            }
        }
    });
}

// Filter objectives by group
function filterByGroup(group) {
    // Toggle: if clicking the same group, clear the filter
    if (selectedGroupFilter === group) {
        selectedGroupFilter = null;
    } else {
        selectedGroupFilter = group;
    }
    renderObjectives();
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

// Record progress snapshot for trend tracking
function recordProgressSnapshot() {
    if (!data.objectives || data.objectives.length === 0) return;
    
    const timestamp = new Date().toISOString();
    const snapshot = {
        timestamp: timestamp,
        objectives: {}
    };
    
    data.objectives.forEach(obj => {
        const progress = calculateProgress(obj);
        snapshot.objectives[obj.id] = {
            title: obj.title,
            group: obj.group || 'Personal',
            progress: progress,
            keyResults: {}
        };
        
        if (obj.keyResults) {
            obj.keyResults.forEach(kr => {
                const krProgress = Math.min(100, Math.round((kr.current / kr.target) * 100));
                snapshot.objectives[obj.id].keyResults[kr.id] = {
                    title: kr.title,
                    progress: krProgress,
                    current: kr.current,
                    target: kr.target
                };
            });
        }
    });
    
    // Store in history as progress snapshot
    if (!data.history) {
        data.history = [];
    }
    
    // Always create a new snapshot entry to track progress changes over time
    // This allows the chart to show progression even within the same day
    addHistoryEntry('progress-snapshot', 'system', 'all', 'Progress Snapshot', { snapshot: snapshot }, null);
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
    
    // Always update charts first, even if no objectives
    updateDashboardCharts();
    
    if (data.objectives.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>🎯</span>
                <p>No objectives yet. Add your first objective above!</p>
            </div>
        `;
        return;
    }
    
    updateFilterIndicators();
    
    // Filter objectives based on selected group
    let filteredObjectives = data.objectives;
    if (selectedGroupFilter) {
        filteredObjectives = data.objectives.filter(obj => (obj.group || 'Personal') === selectedGroupFilter);
    }
    
    if (filteredObjectives.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>🎯</span>
                <p>No ${selectedGroupFilter || ''} objectives found.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredObjectives.map(obj => {
        const progress = calculateProgress(obj);
        // Check if objective is past due date or within due date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDate = obj.targetDate ? new Date(obj.targetDate) : null;
        if (targetDate) {
            targetDate.setHours(0, 0, 0, 0);
        }
        const isPastDue = targetDate && targetDate < today;
        const isBeforeOrAtDueDate = targetDate && targetDate >= today;
        
        let overdueClass = '';
        if (isPastDue && progress < 70) {
            // Past due date and progress less than 70% - red outline
            overdueClass = ' objective-overdue';
        } else if (isPastDue && progress >= 70) {
            // Past due date and progress 70% or higher - yellow outline
            overdueClass = ' objective-overdue-yellow';
        } else if (isBeforeOrAtDueDate && progress >= 70 && progress < 100) {
            // Before or at due date and progress 70% or higher (but not 100%) - blue outline
            overdueClass = ' objective-overdue-blue';
        } else if (isBeforeOrAtDueDate && progress >= 100) {
            // Before or at due date and progress at 100% - green outline
            overdueClass = ' objective-overdue-complete';
        }
        return `
            <div class="objective-card${overdueClass}" data-id="${obj.id}">
                <div class="objective-header">
                    <div class="objective-info">
                        <div class="objective-meta">
                            <span class="obj-badge obj-group-${(obj.group || 'Personal').toLowerCase()}">${obj.group || 'Personal'}</span>
                            <span class="obj-badge">${obj.year || ''} Q${obj.quarter || ''}</span>
                            <span class="obj-badge">${obj.weight || 100}%</span>
                            ${(obj.created || obj.createdAt) ? `<span class="obj-badge">Created<br>${formatDateOnly(obj.created || obj.createdAt)}</span>` : ''}
                            ${obj.startDate ? `<span class="obj-badge">Start Date<br>${obj.startDate}</span>` : ''}
                            ${obj.targetDate ? `<span class="obj-badge${getDateWarningClass(obj.targetDate)}">Due Date<br>${obj.targetDate}</span>` : ''}
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
                                        <div class="kr-info-blocks">
                                            <div class="kr-badges-row">
                                                <span class="kr-status-badge kr-status-${status}">${getStatusLabel(status)}</span>
                                                <span class="kr-confidence-badge kr-confidence-${(kr.confidence || 'Medium').toLowerCase()}">Confidence: ${kr.confidence || 'Medium'}</span>
                                            <span class="kr-weight-badge">Weight: ${kr.weight || 100}%</span>
                                                </div>
                                            <div class="kr-dates-row">
                                                ${(kr.created || kr.createdAt) ? `<span class="kr-meta-item">Created: ${formatDateOnly(kr.created || kr.createdAt)}</span>` : ''}
                                                ${kr.startDate ? `<span class="kr-meta-item">Start: ${kr.startDate}</span>` : ''}
                                                ${kr.targetDate ? `<span class="kr-meta-item${getDateWarningClass(kr.targetDate)}">Target: ${kr.targetDate}</span>` : ''}
                                                ${kr.lastCheckin ? `<span class="kr-meta-item ${isCheckinOverdue(kr.lastCheckin) ? 'kr-checkin-overdue' : ''}">Last Check-in: ${kr.lastCheckin}</span>` : ''}
                                            </div>
                                        </div>
                                        <div class="kr-controls">
                                            <button onclick="updateKR('${obj.id}', '${kr.id}', -10)" title="Decrease">−</button>
                                            <button onclick="updateKR('${obj.id}', '${kr.id}', 10)" title="Increase">+</button>
                                            <button onclick="openKRModal('${obj.id}', '${kr.id}')" title="Edit">✎</button>
                                            <button class="btn-delete-kr" onclick="deleteKR('${obj.id}', '${kr.id}')" title="Delete">×</button>
                                        </div>
                                        <div class="kr-description">
                                            <div class="kr-title">${escapeHtml(kr.title)}</div>
                                            ${kr.evidence ? `<div class="kr-evidence-section"><label class="kr-section-label">Evidence:</label><div class="kr-evidence-content">${escapeHtml(kr.evidence)}</div></div>` : ''}
                                            ${kr.comments ? `<div class="kr-comments-section"><label class="kr-section-label">Comments:</label><div class="kr-comments-content">${escapeHtml(kr.comments)}</div></div>` : ''}
                                        </div>
                                        <div class="kr-progress-row">
                                            <div class="kr-progress-bar">
                                                <div class="kr-progress-fill" style="width: ${krProgress}%"></div>
                                            </div>
                                            <span class="kr-value">${kr.current} / ${kr.target}</span>
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

// Add history entry
function addHistoryEntry(type, itemType, itemId, itemTitle, changes, group = null) {
    if (!data.history) {
        data.history = [];
    }
    
    const entry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        type: type, // 'created', 'updated', 'progress', 'status', 'deleted'
        itemType: itemType, // 'objective' or 'keyresult'
        itemId: itemId,
        itemTitle: itemTitle,
        changes: changes, // Object describing what changed
        group: group
    };
    
    data.history.unshift(entry); // Add to beginning
    
    // Keep only last 1000 history entries to prevent file bloat
    if (data.history.length > 1000) {
        data.history = data.history.slice(0, 1000);
    }
}

// Check if last check-in is 8 days or more ago
function isCheckinOverdue(checkinDate) {
    if (!checkinDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkin = new Date(checkinDate);
    checkin.setHours(0, 0, 0, 0);
    const diffTime = today - checkin;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 8;
}

// Get date warning class based on target date proximity
function getDateWarningClass(targetDate) {
    if (!targetDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    const diffTime = target - today;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        // Past the target date - red
        return ' date-warning-red';
    } else if (diffDays <= 7) {
        // One week or less left - yellow
        return ' date-warning-yellow';
    }
    return '';
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
            const changes = {};
            
            // Track all possible changes
            if (obj.title !== formData.title) changes.title = { from: obj.title, to: formData.title };
            if (obj.group !== formData.group) changes.group = { from: obj.group, to: formData.group };
            if (obj.year !== formData.year) changes.year = { from: obj.year, to: formData.year };
            if (obj.quarter !== formData.quarter) changes.quarter = { from: obj.quarter, to: formData.quarter };
            if (obj.purpose !== formData.purpose) changes.purpose = { from: obj.purpose || '', to: formData.purpose || '' };
            if (obj.startDate !== formData.startDate) changes.startDate = { from: obj.startDate || '', to: formData.startDate || '' };
            if (obj.targetDate !== formData.targetDate) changes.targetDate = { from: obj.targetDate || '', to: formData.targetDate || '' };
            if (obj.weight !== formData.weight) changes.weight = { from: obj.weight, to: formData.weight };
            if (obj.lastCheckin !== formData.lastCheckin) changes.lastCheckin = { from: obj.lastCheckin || '', to: formData.lastCheckin || '' };
            
            obj.group = formData.group;
            obj.year = formData.year;
            obj.quarter = formData.quarter;
            obj.title = formData.title;
            obj.purpose = formData.purpose;
            obj.startDate = formData.startDate;
            obj.targetDate = formData.targetDate;
            obj.weight = formData.weight;
            obj.lastCheckin = formData.lastCheckin;
            
            // Track changes in history (record if any field changed)
            if (Object.keys(changes).length > 0) {
                addHistoryEntry('updated', 'objective', editId, formData.title, changes, formData.group);
            }
            
            // If weight changed, balance other objectives
            if (oldWeight !== formData.weight) {
                balanceOtherObjectives(editId, formData.weight);
            }
        }
    } else {
        // Add new
        const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD
        const newId = generateId();
        data.objectives.push({
            id: newId,
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
        // Track creation in history
        addHistoryEntry('created', 'objective', newId, formData.title, { created: true }, formData.group);
    }
    
    recordProgressSnapshot(); // Record snapshot before saving
    await saveToFile(); // Save including the snapshot
    // Update charts immediately before rendering to ensure they reflect the new objective
    updateDashboardCharts();
    renderObjectives();
}

// Delete objective
async function deleteObjective(id) {
    if (!confirm('Delete this objective and all its key results?')) return;
    const obj = data.objectives.find(o => o.id === id);
    if (obj) {
        addHistoryEntry('deleted', 'objective', id, obj.title, { deleted: true }, obj.group);
    }
    data.objectives = data.objectives.filter(obj => obj.id !== id);
    recordProgressSnapshot(); // Record snapshot before saving
    await saveToFile(); // Save including the snapshot
    // Update charts immediately to reflect deletion
    updateDashboardCharts();
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
            document.getElementById('kr-confidence').value = kr.confidence || 'Medium';
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
        document.getElementById('kr-confidence').value = 'Medium';
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
async function saveKeyResult(objectiveId, title, target, startDate, targetDate, weight, status, confidence, lastCheckin, evidence, comments, editId = null) {
    const objective = data.objectives.find(obj => obj.id === objectiveId);
    if (objective) {
        if (!objective.keyResults) objective.keyResults = [];
        
        if (editId) {
            // Update existing
            const kr = objective.keyResults.find(k => k.id === editId);
            if (kr) {
                const oldWeight = kr.weight;
                const changes = {};
                
                // Track all possible changes
                if (kr.title !== title) changes.title = { from: kr.title, to: title };
                if (kr.status !== status) changes.status = { from: kr.status, to: status };
                if (kr.confidence !== confidence) changes.confidence = { from: kr.confidence || 'Medium', to: confidence };
                if (kr.target !== parseInt(target)) changes.target = { from: kr.target, to: parseInt(target) };
                if (kr.startDate !== startDate) changes.startDate = { from: kr.startDate || '', to: startDate || '' };
                if (kr.targetDate !== targetDate) changes.targetDate = { from: kr.targetDate || '', to: targetDate || '' };
                if (kr.weight !== parseInt(weight)) changes.weight = { from: kr.weight, to: parseInt(weight) };
                if (kr.lastCheckin !== lastCheckin) changes.lastCheckin = { from: kr.lastCheckin || '', to: lastCheckin || '' };
                if (kr.evidence !== evidence) changes.evidence = { from: kr.evidence || '', to: evidence || '' };
                if (kr.comments !== comments) changes.comments = { from: kr.comments || '', to: comments || '' };
                
                kr.title = title;
                kr.target = parseInt(target);
                kr.current = Math.min(kr.current, parseInt(target));
                kr.startDate = startDate;
                kr.targetDate = targetDate;
                kr.weight = parseInt(weight);
                kr.status = status;
                kr.confidence = confidence;
                kr.lastCheckin = lastCheckin;
                kr.evidence = evidence;
                kr.comments = comments;
                
                // Track changes in history (record if any field changed)
                if (Object.keys(changes).length > 0) {
                    addHistoryEntry('updated', 'keyresult', editId, title, changes, objective.group);
                }
                
                // If weight changed, balance other KRs
                if (oldWeight !== parseInt(weight)) {
                    balanceOtherKRs(objectiveId, editId, parseInt(weight));
                }
            }
        } else {
            // Add new
            const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD
            const newKrId = generateId();
            objective.keyResults.push({
                id: newKrId,
                title: title,
                target: parseInt(target),
                current: 0,
                startDate: startDate,
                targetDate: targetDate,
                weight: 0, // Will be balanced
                status: status,
                confidence: confidence,
                lastCheckin: lastCheckin,
                evidence: evidence,
                comments: comments,
                createdAt: today
            });
            // Auto-balance all KR weights for this objective
            autoBalanceKRWeights(objectiveId);
            // Track creation in history
            addHistoryEntry('created', 'keyresult', newKrId, title, { created: true }, objective.group);
        }
        recordProgressSnapshot(); // Record snapshot before saving
        await saveToFile(); // Save including the snapshot
        renderObjectives();
        // Explicitly update charts to ensure they reflect the new KR
        updateDashboardCharts();
    }
}

// Update key result progress
async function updateKR(objectiveId, krId, delta) {
    const objective = data.objectives.find(obj => obj.id === objectiveId);
    if (objective) {
        const kr = objective.keyResults.find(k => k.id === krId);
        if (kr) {
            const oldCurrent = kr.current;
            const oldProgress = Math.min(100, Math.round((oldCurrent / kr.target) * 100));
            kr.current = Math.max(0, Math.min(kr.target, kr.current + delta));
            const newProgress = Math.min(100, Math.round((kr.current / kr.target) * 100));
            
            // Track progress change in history
            if (oldCurrent !== kr.current) {
                addHistoryEntry('progress', 'keyresult', krId, kr.title, {
                    progress: {
                        from: `${oldCurrent}/${kr.target} (${oldProgress}%)`,
                        to: `${kr.current}/${kr.target} (${newProgress}%)`,
                        delta: delta
                    }
                }, objective.group);
            }
            
            recordProgressSnapshot(); // Record snapshot before saving
            await saveToFile(); // Save including the snapshot
            renderObjectives();
        }
    }
}

// Delete key result
async function deleteKR(objectiveId, krId) {
    const objective = data.objectives.find(obj => obj.id === objectiveId);
    if (objective) {
        const kr = objective.keyResults.find(k => k.id === krId);
        if (kr) {
            addHistoryEntry('deleted', 'keyresult', krId, kr.title, { deleted: true }, objective.group);
        }
        objective.keyResults = objective.keyResults.filter(k => k.id !== krId);
        recordProgressSnapshot(); // Record snapshot before saving
        await saveToFile(); // Save including the snapshot
        // Update charts immediately to reflect deletion
        updateDashboardCharts();
        renderObjectives();
    }
}

// Open progress trends modal
function openProgressTrendsModal() {
    // Set up event listeners before rendering
    setupProgressTrendsFilters();
    renderProgressTrends();
    document.getElementById('progress-trends-modal').classList.add('active');
}

// Render progress trends visualization
function renderProgressTrends() {
    const container = document.getElementById('progress-trends-charts');
    if (!container) return;
    
    // Get progress snapshots from history
    const snapshots = (data.history || []).filter(h => h.type === 'progress-snapshot' && h.changes && h.changes.snapshot);
    
    if (snapshots.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>📈</span>
                <p>No progress history available yet. Progress will be tracked as you update your OKRs.</p>
            </div>
        `;
        return;
    }
    
    // Check which view mode is selected
    const viewMode = document.querySelector('input[name="trends-view"]:checked')?.value || 'grouped';
    const individualFilters = document.getElementById('trends-individual-filters');
    if (individualFilters) {
        individualFilters.style.display = viewMode === 'individual' ? 'flex' : 'none';
    }
    
    if (viewMode === 'grouped') {
        renderGroupedProgressTrends(container, snapshots);
    } else {
        renderIndividualProgressTrends(container, snapshots);
    }
}

// Render grouped progress trends (one chart for Personal, Team, Company)
function renderGroupedProgressTrends(container, snapshots) {
    const groups = ['Personal', 'Team', 'Company'];
    const groupColors = {
        'Personal': '#10b981',
        'Team': '#eab308',
        'Company': '#3b82f6'
    };
    
    // Extract progress data by group
    const groupProgressData = {};
    groups.forEach(group => {
        groupProgressData[group] = [];
    });
    
    const existingObjectiveIds = new Set((data.objectives || []).map(obj => obj.id));
    
    // Get current groups that have objectives (to filter out groups with no current objectives)
    const currentGroupsWithObjectives = new Set();
    (data.objectives || []).forEach(obj => {
        currentGroupsWithObjectives.add(obj.group || 'Personal');
    });
    
    snapshots.forEach(snapshot => {
        const date = new Date(snapshot.timestamp).toLocaleDateString();
        const snapshotData = snapshot.changes.snapshot;
        
        // Calculate average progress for each group
        groups.forEach(group => {
            // Skip groups that don't currently have any objectives
            if (!currentGroupsWithObjectives.has(group)) return;
            
            let totalProgress = 0;
            let count = 0;
            
            Object.keys(snapshotData.objectives).forEach(objId => {
                // Only include data for objectives that still exist
                if (!existingObjectiveIds.has(objId)) return;
                
                const objData = snapshotData.objectives[objId];
                if (objData.group === group) {
                    totalProgress += objData.progress;
                    count++;
                }
            });
            
            // Only add data point if there are objectives in this group
            if (count > 0) {
                const avgProgress = Math.round(totalProgress / count);
                groupProgressData[group].push({
                    date: date,
                    progress: avgProgress,
                    timestamp: snapshot.timestamp,
                    count: count
                });
            }
        });
    });
    
    // Sort data points by timestamp for each group
    groups.forEach(group => {
        groupProgressData[group].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });
    
    // Find all unique dates
    const allDates = new Set();
    groups.forEach(group => {
        groupProgressData[group].forEach(point => allDates.add(point.timestamp));
    });
    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
    
    if (sortedDates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>📈</span>
                <p>No data matches the selected filters.</p>
            </div>
        `;
        return;
    }
    
    // Create a single chart with all groups
    const chartHeight = 300;
    const chartWidth = 800;
    const padding = 50;
    const usableWidth = chartWidth - (padding * 2);
    const usableHeight = chartHeight - (padding * 2);
    const maxProgress = 100;
    
    // Generate paths for each group
    const paths = groups.map(group => {
        const dataPoints = groupProgressData[group];
        if (dataPoints.length === 0) return null;
        
        let pathData = '';
        dataPoints.forEach((point, index) => {
            const dateIndex = sortedDates.indexOf(point.timestamp);
            const x = padding + (dateIndex / (sortedDates.length - 1 || 1)) * usableWidth;
            const y = padding + usableHeight - (point.progress / maxProgress) * usableHeight;
            
            if (index === 0) {
                pathData += `M ${x} ${y}`;
            } else {
                pathData += ` L ${x} ${y}`;
            }
        });
        
        return { group, pathData, dataPoints, color: groupColors[group] };
    }).filter(p => p !== null);
    
    // Generate points for tooltips
    const allPoints = [];
    paths.forEach(path => {
        path.dataPoints.forEach((point, index) => {
            const dateIndex = sortedDates.indexOf(point.timestamp);
            const x = padding + (dateIndex / (sortedDates.length - 1 || 1)) * usableWidth;
            const y = padding + usableHeight - (point.progress / maxProgress) * usableHeight;
            allPoints.push({ x, y, progress: point.progress, date: point.date, group: path.group, count: point.count });
        });
    });
    
    container.innerHTML = `
        <div class="trend-chart-container">
            <div class="trend-chart-header">
                <h4>Overall Progress by Category</h4>
            </div>
            <div class="trend-chart-wrapper">
                <svg class="trend-chart" viewBox="0 0 ${chartWidth} ${chartHeight}">
                    <!-- Grid lines -->
                    ${[0, 25, 50, 75, 100].map(percent => {
                        const y = padding + usableHeight - (percent / maxProgress) * usableHeight;
                        return `<line x1="${padding}" y1="${y}" x2="${chartWidth - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2" opacity="0.3"/>`;
                    }).join('')}
                    
                    <!-- Progress lines for each group -->
                    ${paths.map(path => `
                        <path d="${path.pathData}" fill="none" stroke="${path.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    `).join('')}
                    
                    <!-- Data points -->
                    ${allPoints.map(p => `
                        <circle cx="${p.x}" cy="${p.y}" r="4" fill="${groupColors[p.group]}" stroke="var(--bg-card)" stroke-width="2">
                            <title>${p.group}: ${p.date} - ${p.progress}% (${p.count} objective${p.count !== 1 ? 's' : ''})</title>
                        </circle>
                    `).join('')}
                    
                    <!-- Y-axis labels -->
                    ${[0, 25, 50, 75, 100].map(percent => {
                        const y = padding + usableHeight - (percent / maxProgress) * usableHeight;
                        return `<text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-secondary)">${percent}%</text>`;
                    }).join('')}
                    
                    <!-- X-axis labels -->
                    ${sortedDates.map((timestamp, index) => {
                        const date = new Date(timestamp).toLocaleDateString();
                        const x = padding + (index / (sortedDates.length - 1 || 1)) * usableWidth;
                        const showLabel = index === 0 || index === sortedDates.length - 1 || sortedDates.length <= 5;
                        if (!showLabel) return '';
                        return `<text x="${x}" y="${chartHeight - padding + 20}" text-anchor="middle" font-size="10" fill="var(--text-secondary)">${date}</text>`;
                    }).join('')}
                </svg>
            </div>
            <div class="trend-chart-legend">
                ${paths.map(path => `
                    <div class="trend-legend-item">
                        <span class="trend-legend-color" style="background: ${path.color}"></span>
                        <span class="trend-legend-label">${path.group}</span>
                        ${path.dataPoints.length > 0 ? `
                            <span class="trend-legend-value">${path.dataPoints[path.dataPoints.length - 1].progress}%</span>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Render individual progress trends (original implementation)
function renderIndividualProgressTrends(container, snapshots) {
    const filterGroup = document.getElementById('trends-filter-group')?.value || 'all';
    const filterObjective = document.getElementById('trends-filter-objective')?.value || 'all';
    
    // Extract progress data - only for objectives that still exist
    const progressData = {};
    const existingObjectiveIds = new Set((data.objectives || []).map(obj => obj.id));
    
    snapshots.forEach(snapshot => {
        const date = new Date(snapshot.timestamp).toLocaleDateString();
        const snapshotData = snapshot.changes.snapshot;
        
        Object.keys(snapshotData.objectives).forEach(objId => {
            // Only include data for objectives that still exist
            if (!existingObjectiveIds.has(objId)) return;
            
            const objData = snapshotData.objectives[objId];
            
            // Apply filters
            if (filterGroup !== 'all' && objData.group !== filterGroup) return;
            if (filterObjective !== 'all' && objId !== filterObjective) return;
            
            if (!progressData[objId]) {
                // Use current objective title if it exists, otherwise use snapshot title
                const currentObj = data.objectives.find(o => o.id === objId);
                progressData[objId] = {
                    title: currentObj ? currentObj.title : objData.title,
                    group: objData.group,
                    dataPoints: []
                };
            }
            
            progressData[objId].dataPoints.push({
                date: date,
                progress: objData.progress,
                timestamp: snapshot.timestamp
            });
        });
    });
    
    if (Object.keys(progressData).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>📈</span>
                <p>No data matches the selected filters.</p>
            </div>
        `;
        return;
    }
    
    // Update objective filter dropdown
    updateTrendsObjectiveFilter(progressData, filterObjective);
    
    // Render charts
    container.innerHTML = Object.keys(progressData).map(objId => {
        const objData = progressData[objId];
        const dataPoints = objData.dataPoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        if (dataPoints.length === 0) return '';
        
        const maxProgress = Math.max(...dataPoints.map(d => d.progress), 100);
        const chartHeight = 200;
        const chartWidth = 600;
        const padding = 40;
        const usableWidth = chartWidth - (padding * 2);
        const usableHeight = chartHeight - (padding * 2);
        
        // Generate SVG path for line chart
        let pathData = '';
        dataPoints.forEach((point, index) => {
            const x = padding + (index / (dataPoints.length - 1 || 1)) * usableWidth;
            const y = padding + usableHeight - (point.progress / maxProgress) * usableHeight;
            
            if (index === 0) {
                pathData += `M ${x} ${y}`;
            } else {
                pathData += ` L ${x} ${y}`;
            }
        });
        
        // Generate points
        const points = dataPoints.map((point, index) => {
            const x = padding + (index / (dataPoints.length - 1 || 1)) * usableWidth;
            const y = padding + usableHeight - (point.progress / maxProgress) * usableHeight;
            return { x, y, progress: point.progress, date: point.date };
        });
        
        return `
            <div class="trend-chart-container">
                <div class="trend-chart-header">
                    <h4>${escapeHtml(objData.title)}</h4>
                    <span class="trend-group-badge trend-group-${objData.group.toLowerCase()}">${objData.group}</span>
                </div>
                <div class="trend-chart-wrapper">
                    <svg class="trend-chart" viewBox="0 0 ${chartWidth} ${chartHeight}">
                        <!-- Grid lines -->
                        ${[0, 25, 50, 75, 100].map(percent => {
                            const y = padding + usableHeight - (percent / maxProgress) * usableHeight;
                            return `<line x1="${padding}" y1="${y}" x2="${chartWidth - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2" opacity="0.3"/>`;
                        }).join('')}
                        
                        <!-- Progress line -->
                        <path d="${pathData}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                        
                        <!-- Data points -->
                        ${points.map(p => `
                            <circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent)" stroke="var(--bg-card)" stroke-width="2">
                                <title>${p.date}: ${p.progress}%</title>
                            </circle>
                        `).join('')}
                        
                        <!-- Y-axis labels -->
                        ${[0, 25, 50, 75, 100].map(percent => {
                            const y = padding + usableHeight - (percent / maxProgress) * usableHeight;
                            return `<text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-secondary)">${percent}%</text>`;
                        }).join('')}
                        
                        <!-- X-axis labels -->
                        ${dataPoints.map((point, index) => {
                            const x = padding + (index / (dataPoints.length - 1 || 1)) * usableWidth;
                            const showLabel = index === 0 || index === dataPoints.length - 1 || dataPoints.length <= 5;
                            if (!showLabel) return '';
                            return `<text x="${x}" y="${chartHeight - padding + 20}" text-anchor="middle" font-size="10" fill="var(--text-secondary)">${point.date}</text>`;
                        }).join('')}
                    </svg>
                </div>
                <div class="trend-chart-stats">
                    <div class="trend-stat">
                        <span class="trend-stat-label">Current:</span>
                        <span class="trend-stat-value">${dataPoints[dataPoints.length - 1].progress}%</span>
                    </div>
                    ${dataPoints.length > 1 ? `
                        <div class="trend-stat">
                            <span class="trend-stat-label">Change:</span>
                            <span class="trend-stat-value ${dataPoints[dataPoints.length - 1].progress >= dataPoints[0].progress ? 'trend-positive' : 'trend-negative'}">
                                ${dataPoints[dataPoints.length - 1].progress >= dataPoints[0].progress ? '+' : ''}${dataPoints[dataPoints.length - 1].progress - dataPoints[0].progress}%
                            </span>
                        </div>
                        <div class="trend-stat">
                            <span class="trend-stat-label">Data Points:</span>
                            <span class="trend-stat-value">${dataPoints.length}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Update trends objective filter dropdown
function updateTrendsObjectiveFilter(progressData, selectedId) {
    const filterSelect = document.getElementById('trends-filter-objective');
    if (!filterSelect) return;
    
    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="all">All Objectives</option>';
    
    Object.keys(progressData).forEach(objId => {
        const obj = data.objectives.find(o => o.id === objId);
        if (obj) {
            const option = document.createElement('option');
            option.value = objId;
            option.textContent = obj.title;
            if (objId === currentValue) {
                option.selected = true;
            }
            filterSelect.appendChild(option);
        }
    });
}

// Set up progress trends filter listeners
function setupProgressTrendsFilters() {
    const groupFilter = document.getElementById('trends-filter-group');
    const objectiveFilter = document.getElementById('trends-filter-objective');
    const viewModeRadios = document.querySelectorAll('input[name="trends-view"]');
    
    if (groupFilter) {
        groupFilter.addEventListener('change', () => {
            renderProgressTrends();
        });
    }
    if (objectiveFilter) {
        objectiveFilter.addEventListener('change', () => {
            renderProgressTrends();
        });
    }
    if (viewModeRadios.length > 0) {
        viewModeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                renderProgressTrends();
            });
        });
    }
}

// Open history modal
function openHistoryModal() {
    renderHistory();
    document.getElementById('history-modal').classList.add('active');
}

// Render history view
function renderHistory() {
    const container = document.getElementById('history-list');
    if (!container) return;
    
    if (!data.history || data.history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>📊</span>
                <p>No history available yet. Changes will be tracked as you work with your OKRs.</p>
            </div>
        `;
        return;
    }
    
    const filterType = document.getElementById('history-filter-type')?.value || 'all';
    const filterGroup = document.getElementById('history-filter-group')?.value || 'all';
    
    let filteredHistory = data.history;
    
    if (filterType !== 'all') {
        filteredHistory = filteredHistory.filter(entry => entry.itemType === filterType);
    }
    
    if (filterGroup !== 'all') {
        filteredHistory = filteredHistory.filter(entry => entry.group === filterGroup);
    }
    
    if (filteredHistory.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>📊</span>
                <p>No history matches the selected filters.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredHistory.map(entry => {
        const date = new Date(entry.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        const typeIcon = entry.itemType === 'objective' ? '🎯' : '📊';
        const typeLabel = entry.itemType === 'objective' ? 'Objective' : 'Key Result';
        
        let changeDescription = '';
        if (entry.type === 'created') {
            changeDescription = ''; // Badge already shows "Created"
        } else if (entry.type === 'deleted') {
            changeDescription = ''; // Badge already shows "Deleted"
        } else if (entry.type === 'progress') {
            changeDescription = `${entry.changes.progress.from} → ${entry.changes.progress.to}`; // Badge already shows "Progress"
        } else if (entry.type === 'updated') {
            const changeList = Object.keys(entry.changes).map(key => {
                const change = entry.changes[key];
                if (key === 'status') {
                    return `${key}: ${getStatusLabel(change.from)} → ${getStatusLabel(change.to)}`;
                }
                return `${key}: ${change.from} → ${change.to}`;
            }).join(', ');
            changeDescription = changeList; // Badge already shows "Updated"
        }
        
        return `
            <div class="history-entry">
                <div class="history-entry-header">
                    <span class="history-type-icon">${typeIcon}</span>
                    <span class="history-item-type">${typeLabel}</span>
                    <span class="history-item-title">${escapeHtml(entry.itemTitle)}</span>
                    ${entry.group ? `<span class="history-group-badge history-group-${entry.group.toLowerCase()}">${entry.group}</span>` : ''}
                    <span class="history-timestamp">${dateStr}</span>
                </div>
                <div class="history-entry-details">
                    <span class="history-change-type history-change-${entry.type}">${entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}</span>
                    <span class="history-change-description">${changeDescription}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Set up history filter listeners
function setupHistoryFilters() {
    const typeFilter = document.getElementById('history-filter-type');
    const groupFilter = document.getElementById('history-filter-group');
    
    if (typeFilter) {
        typeFilter.addEventListener('change', renderHistory);
    }
    if (groupFilter) {
        groupFilter.addEventListener('change', renderHistory);
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
                    text += `     Confidence: ${kr.confidence || 'Medium'}\n`;
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

document.getElementById('objective-form').addEventListener('submit', async (e) => {
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
        await saveObjective(formData);
        closeModal('objective-modal');
    }
});

document.getElementById('kr-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const objectiveId = document.getElementById('kr-objective-id').value;
    const editId = document.getElementById('kr-edit-id').value;
    const title = document.getElementById('kr-title').value.trim();
    const target = document.getElementById('kr-target').value;
    const startDate = document.getElementById('kr-start-date').value;
    const targetDate = document.getElementById('kr-target-date').value;
    const weight = document.getElementById('kr-weight').value;
    const status = document.getElementById('kr-status').value;
    const confidence = document.getElementById('kr-confidence').value;
    const lastCheckin = document.getElementById('kr-last-checkin').value;
    const evidence = document.getElementById('kr-evidence').value.trim();
    const comments = document.getElementById('kr-comments').value.trim();
    if (title && target && startDate && targetDate) {
        await saveKeyResult(objectiveId, title, target, startDate, targetDate, weight, status, confidence, lastCheckin, evidence, comments, editId || null);
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

document.getElementById('btn-progress-trends').addEventListener('click', () => {
    openProgressTrendsModal();
});

document.getElementById('btn-history').addEventListener('click', () => {
    openHistoryModal();
});

document.getElementById('btn-help').addEventListener('click', () => {
    document.getElementById('help-modal').classList.add('active');
});

// Set up click handlers for chart containers to filter by group
function setupChartClickHandlers() {
    const chartContainers = ['chart-personal', 'chart-team', 'chart-company'];
    chartContainers.forEach(chartId => {
        const container = document.getElementById(chartId);
        if (container) {
            container.style.cursor = 'pointer';
            // Remove existing event listeners by cloning
            const newContainer = container.cloneNode(true);
            container.parentNode.replaceChild(newContainer, container);
            // Add click handler to the new container
            const updatedContainer = document.getElementById(chartId);
            if (updatedContainer) {
                updatedContainer.addEventListener('click', () => {
                    const group = updatedContainer.dataset.group;
                    filterByGroup(group);
                });
            }
        }
    });
}

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
        // Set up chart click handlers after initial render
        setupChartClickHandlers();
        setupHistoryFilters();
        setupProgressTrendsFilters();
        // Record initial progress snapshot
        recordProgressSnapshot();
    });
    // Also set up handlers if file is already restored
    setupChartClickHandlers();
    setupHistoryFilters();
    setupProgressTrendsFilters();
    // Record initial progress snapshot if data exists
    if (data && data.objectives && data.objectives.length > 0) {
        recordProgressSnapshot();
    }
}
