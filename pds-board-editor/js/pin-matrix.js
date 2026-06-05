// Pinleaf Forge - Pin Matrix Management
// Pin row creation, drag-and-drop, sorting

function generatePinRows() {
    const totalPins = parseInt(document.getElementById('totalPinsInput').value) || 22;
    pin_capabilities = [];

    const display = document.getElementById('pinoutDisplay');
    display.innerHTML = '';

    // Generate a row for each pin
    for (let i = 0; i < totalPins; i++) {
        const pinRow = createPinRow(i);
        display.appendChild(pinRow);
    }

    updatePreview();
}

function addPinRow() {
    const display = document.getElementById('pinoutDisplay');
    const existingRows = display.querySelectorAll('.pin-row');
    const nextPinNum = existingRows.length;
    
    const pinRow = createPinRow(nextPinNum);
    display.appendChild(pinRow);
    
    updatePreview();
}

function createPinRow(pinNum) {
    const row = document.createElement('div');
    row.className = 'pin-row';
    row.draggable = true;
    
    // Header ID field (editable text)
    const headerField = document.createElement('div');
    headerField.className = 'pin-header';
    headerField.contentEditable = true;
    headerField.textContent = 'J1';
    headerField.dataset.pin = pinNum;
    headerField.title = 'Header/Connector ID (e.g., J1, J2, P1, Main, etc.)';
    
    headerField.addEventListener('blur', updatePreview);
    headerField.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });
    
    row.appendChild(headerField);
    
    // Group field (editable text)
    const groupField = document.createElement('div');
    groupField.className = 'pin-group';
    groupField.contentEditable = true;
    groupField.textContent = 'Uncategorized';
    groupField.dataset.pin = pinNum;
    groupField.title = 'Pin functional group (e.g., Power, GPIO, Communication, Analog, Special)';
    
    groupField.addEventListener('blur', updatePreview);
    groupField.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });
    
    row.appendChild(groupField);
    
    // Var Alias field (editable text for programming variable names)
    const varAliasField = document.createElement('div');
    varAliasField.className = 'pin-var-alias';
    varAliasField.contentEditable = true;
    varAliasField.textContent = `gpio${pinNum}`;
    varAliasField.dataset.pin = pinNum;
    varAliasField.title = 'Variable alias for programming (e.g., led_red, btn_start, sensor_temp)';
    
    varAliasField.addEventListener('blur', updatePreview);
    varAliasField.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });
    
    row.appendChild(varAliasField);
    
    // Physical pin number (editable)
    const physical = document.createElement('div');
    physical.className = 'pin-physical';
    physical.contentEditable = true;
    physical.textContent = pinNum + 1; // Default: 1-indexed
    physical.dataset.pin = pinNum;
    physical.title = 'Physical pin number on the board';
    
    physical.addEventListener('blur', updatePreview);
    physical.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });
    
    row.appendChild(physical);
    
    // Pin name/label (editable)
    const label = document.createElement('div');
    label.className = 'pin-label';
    label.contentEditable = true;
    label.textContent = `GPIO ${pinNum}`;
    label.dataset.pin = pinNum;
    
    // Update preview when label is edited
    label.addEventListener('blur', updatePreview);
    label.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });
    
    row.appendChild(label);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'capability-buttons';

    ALL_CAPABILITIES.forEach(cap => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `capability-btn ${cap}`;
        btn.textContent = cap;
        btn.dataset.pin = pinNum;
        btn.dataset.capability = cap;
        
        btn.addEventListener('click', function() {
            this.classList.toggle('active');
            updatePreview();
        });

        buttonsContainer.appendChild(btn);
    });

    row.appendChild(buttonsContainer);
    
    // Add drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '??';
    dragHandle.title = 'Drag to reorder';
    row.appendChild(dragHandle);
    
    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-pin-btn';
    deleteBtn.textContent = '??? Delete';
    deleteBtn.addEventListener('click', function() {
        if (confirm(`Delete pin "${label.textContent}"?`)) {
            row.remove();
            updatePreview();
        }
    });
    
    row.appendChild(deleteBtn);
    
    // Drag and drop event listeners
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('drop', handleDrop);
    row.addEventListener('dragend', handleDragEnd);
    
    return row;
}

// Drag and drop functions
let draggedElement = null;

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const afterElement = getDragAfterElement(this.parentNode, e.clientY);
    if (afterElement == null) {
        this.parentNode.appendChild(draggedElement);
    } else {
        this.parentNode.insertBefore(draggedElement, afterElement);
    }
    
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    updatePreview();
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedElement = null;
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.pin-row:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Sorting functions
function sortPins(column) {
    const display = document.getElementById('pinoutDisplay');
    const rows = Array.from(display.querySelectorAll('.pin-row'));

    // Toggle sort direction
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }

    // Update UI indicators
    document.querySelectorAll('.sort-header').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    const activeHeader = document.querySelector(`.sort-header:nth-child(${getColumnIndex(column)})`);
    if (activeHeader) {
        activeHeader.classList.add(`sort-${currentSortDirection}`);
    }

    // Sort rows
    rows.sort((a, b) => {
        let aVal, bVal;

        switch(column) {
            case 'header':
                aVal = a.querySelector('.pin-header')?.textContent || '';
                bVal = b.querySelector('.pin-header')?.textContent || '';
                break;
            case 'group':
                aVal = a.querySelector('.pin-group')?.textContent || '';
                bVal = b.querySelector('.pin-group')?.textContent || '';
                break;
            case 'varalias':
                aVal = a.querySelector('.pin-var-alias')?.textContent || '';
                bVal = b.querySelector('.pin-var-alias')?.textContent || '';
                break;
            case 'physical':
                aVal = parseInt(a.querySelector('.pin-physical')?.textContent) || 0;
                bVal = parseInt(b.querySelector('.pin-physical')?.textContent) || 0;
                break;
            case 'name':
                aVal = a.querySelector('.pin-label')?.textContent || '';
                bVal = b.querySelector('.pin-label')?.textContent || '';
                break;
        }

        if (typeof aVal === 'number') {
            return currentSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        } else {
            return currentSortDirection === 'asc' ? 
                aVal.localeCompare(bVal) : 
                bVal.localeCompare(aVal);
        }
    });

    // Re-append sorted rows
    rows.forEach(row => display.appendChild(row));
    updatePreview();
}

function getColumnIndex(column) {
    const map = { 'header': 1, 'group': 2, 'varalias': 3, 'physical': 4, 'name': 5 };
    return map[column] || 1;
}

function showSortOptions() {
    const options = prompt(
        'Multi-column sort:\n\n' +
        'Enter column numbers separated by commas:\n' +
        '1 = Header\n' +
        '2 = Group\n' +
        '3 = Var Alias\n' +
        '4 = Physical\n' +
        '5 = Pin Name\n\n' +
        'Example: "1,4" sorts by Header then Physical',
        '1,4'
    );

    if (options) {
        multiColumnSort(options.split(',').map(n => parseInt(n.trim())));
    }
}

function multiColumnSort(columns) {
    const display = document.getElementById('pinoutDisplay');
    const rows = Array.from(display.querySelectorAll('.pin-row'));

    rows.sort((a, b) => {
        for (const col of columns) {
            let aVal, bVal;

            switch(col) {
                case 1: // Header
                    aVal = a.querySelector('.pin-header')?.textContent || '';
                    bVal = b.querySelector('.pin-header')?.textContent || '';
                    break;
                case 2: // Group
                    aVal = a.querySelector('.pin-group')?.textContent || '';
                    bVal = b.querySelector('.pin-group')?.textContent || '';
                    break;
                case 3: // Var Alias
                    aVal = a.querySelector('.pin-var-alias')?.textContent || '';
                    bVal = b.querySelector('.pin-var-alias')?.textContent || '';
                    break;
                case 4: // Physical
                    aVal = parseInt(a.querySelector('.pin-physical')?.textContent) || 0;
                    bVal = parseInt(b.querySelector('.pin-physical')?.textContent) || 0;
                    break;
                case 5: // Pin Name
                    aVal = a.querySelector('.pin-label')?.textContent || '';
                    bVal = b.querySelector('.pin-label')?.textContent || '';
                    break;
            }

            const comparison = typeof aVal === 'number' ? 
                aVal - bVal : 
                aVal.localeCompare(bVal);

            if (comparison !== 0) return comparison;
        }
        return 0;
    });

    rows.forEach(row => display.appendChild(row));
    updatePreview();
}
