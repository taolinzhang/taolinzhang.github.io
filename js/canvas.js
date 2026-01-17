document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    
    // Global State
    const globalState = {
        canvases: [], // { id, name }
        activeCanvasId: null,
        posts: []
    };

    // Canvas Specific Data (Loaded on switch)
    let currentCanvas = {
        pointX: 0,
        pointY: 0,
        scale: 1,
        cards: [], // { id, x, y, width, height, postData }
        connections: [] // { id, fromCardId, fromPort, toCardId, toPort }
    };

    // Interaction State
    let isPanning = false;
    let isDraggingCard = false;
    let isConnecting = false;
    let isResizing = false;
    let connectStartCardId = null;
    let connectStartPort = null;
    let tempLine = null;
    let panStartX = 0, panStartY = 0;

    // DOM Elements Reference
    let container, grid, cardLayer, connectionLayer, svg, tempPath;

    // Consts
    const DEFAULT_CARD_WIDTH = 300; 

    // --- Initialization ---

    function init() {
        loadGlobalState();
        fetchPosts();
        setupUI();
        setupCanvasDOM();
        
        document.addEventListener('click', () => {
             const menu = document.querySelector('.context-menu');
             if (menu) menu.remove();
        });

        app.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.card') || e.target.closest('.connection-line')) return;
            e.preventDefault(); 
        });
        
        if (globalState.canvases.length === 0) {
            createCanvas("Main Canvas");
        } else {
             const lastActive = localStorage.getItem('activeCanvasId');
             if (lastActive && globalState.canvases.find(c => c.id == lastActive)) {
                 loadCanvas(lastActive);
             } else {
                 loadCanvas(globalState.canvases[0].id);
             }
        }
    }

    function setupCanvasDOM() {
        container = document.createElement('div');
        container.className = 'canvas-container';
        app.appendChild(container);

        grid = document.createElement('div');
        grid.className = 'grid-background';
        container.appendChild(grid);

        connectionLayer = document.createElement('div');
        connectionLayer.className = 'connection-layer';
        container.appendChild(connectionLayer);

        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.overflow = "visible";
        connectionLayer.appendChild(svg);

        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = `
            <marker id="arrowhead" markerWidth="10" markerHeight="7" 
            refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
            </marker>
        `;
        svg.appendChild(defs);

        // Drag Layer (Top Level for temp connection)
        const dragLayer = document.createElement('div');
        dragLayer.className = 'drag-layer';
        container.appendChild(dragLayer);

        const dragSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        dragSvg.style.overflow = "visible";
        dragLayer.appendChild(dragSvg);
        
        // Need arrow marker in dragSvg too
        const dragDefs = defs.cloneNode(true);
        dragSvg.appendChild(dragDefs);

        tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tempPath.setAttribute("class", "connection-line");
        tempPath.setAttribute("marker-end", "url(#arrowhead)");
        tempPath.style.display = "none";
        dragSvg.appendChild(tempPath);

        cardLayer = document.createElement('div');
        cardLayer.className = 'card-layer';
        container.appendChild(cardLayer);

        bindCanvasEvents();
    }

    function setupUI() {
        const sidebar = document.createElement('div');
        sidebar.className = 'sidebar';
        sidebar.innerHTML = `
            <h2>Canvases</h2>
            <div class="canvas-list" id="canvas-list"></div>
            <button class="icon-btn" id="new-canvas-btn" style="width: 100%; border-radius: 8px; margin-top: 10px;">+ New Canvas</button>
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                 <button class="icon-btn" id="back-home-btn" style="width: 100%; border-radius: 8px;">← Back to Home</button>
            </div>
        `;
        app.appendChild(sidebar);

        const controls = document.createElement('div');
        controls.className = 'ui-controls';
        controls.innerHTML = `
            <button class="icon-btn" id="add-card-btn" title="Add Card">+</button>
            <button class="icon-btn" id="reset-view-btn" title="Reset View">⟲</button>
        `;
        app.appendChild(controls);

        document.getElementById('add-card-btn').addEventListener('click', showAddModal);
        document.getElementById('reset-view-btn').addEventListener('click', resetView);
        document.getElementById('back-home-btn').addEventListener('click', () => {
             const homeUrl = (window.siteConfig && window.siteConfig.baseURL) ? window.siteConfig.baseURL : '/';
             window.location.href = homeUrl;
        });
        document.getElementById('new-canvas-btn').addEventListener('click', () => {
            showInputModal("Create New Canvas", "Enter canvas name:", (name) => {
                if (name) createCanvas(name);
            });
        });
    }

    // --- State Management ---

    function loadGlobalState() {
        const stored = localStorage.getItem('canvas_global');
        if (stored) {
            Object.assign(globalState, JSON.parse(stored));
        }
    }

    function saveGlobalState() {
        localStorage.setItem('canvas_global', JSON.stringify(globalState));
    }

    function loadCanvas(id) {
        globalState.activeCanvasId = id;
        localStorage.setItem('activeCanvasId', id);
        updateSidebarUI();

        const stored = localStorage.getItem(`canvas_${id}`);
        if (stored) {
            currentCanvas = JSON.parse(stored);
        } else {
            currentCanvas = { pointX: 0, pointY: 0, scale: 1, cards: [], connections: [] };
        }
        render();
    }

    function saveCurrentCanvas() {
        if (!globalState.activeCanvasId) return;
        localStorage.setItem(`canvas_${globalState.activeCanvasId}`, JSON.stringify(currentCanvas));
    }

    function createCanvas(name) {
        const id = Date.now().toString();
        globalState.canvases.push({ id, name });
        saveGlobalState();
        
        currentCanvas = { pointX: 0, pointY: 0, scale: 1, cards: [], connections: [] };
        globalState.activeCanvasId = id;
        saveCurrentCanvas(); 
        
        loadCanvas(id);
    }

    function deleteCanvas(id) {
        showConfirmModal("Delete Canvas", "Are you sure you want to delete this canvas?", () => {
            globalState.canvases = globalState.canvases.filter(c => c.id !== id);
            localStorage.removeItem(`canvas_${id}`);
            
            if (globalState.activeCanvasId === id) {
                if (globalState.canvases.length > 0) {
                    loadCanvas(globalState.canvases[0].id);
                } else {
                    createCanvas("Main Canvas");
                }
            }
            
            saveGlobalState();
            updateSidebarUI();
        });
    }

    function updateSidebarUI() {
        const list = document.getElementById('canvas-list');
        list.innerHTML = '';
        globalState.canvases.forEach(c => {
            const item = document.createElement('div');
            item.className = 'canvas-item';
            if (c.id == globalState.activeCanvasId) item.classList.add('active');
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = c.name;
            item.appendChild(nameSpan);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-canvas-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = "Delete Canvas";
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCanvas(c.id);
            });
            item.appendChild(deleteBtn);

            item.addEventListener('click', () => loadCanvas(c.id));
            list.appendChild(item);
        });
    }

    function fetchPosts() {
        // Load posts for "Add Card" functionality
        // Use injected config or fallback
        const searchUrl = (window.siteConfig && window.siteConfig.searchIndex) ? window.siteConfig.searchIndex : '/index.json';
        
        // Add cache busting to ensure we get the latest content (fixes sync issues)
        fetch(searchUrl + '?t=' + Date.now())
            .then(response => response.json())
            .then(data => {
                globalState.posts = data;
                
                // Hydrate existing cards if needed (already handled in createCardElement, but ensures data is fresh)
                render(); 
            });
    }

    // --- Rendering ---

    function render() {
        container.style.transform = `translate(${currentCanvas.pointX}px, ${currentCanvas.pointY}px) scale(${currentCanvas.scale})`;
        
        cardLayer.innerHTML = '';
        currentCanvas.cards.forEach(card => {
            cardLayer.appendChild(createCardElement(card));
        });

        requestAnimationFrame(() => {
            renderConnections();
        });
    }

    function renderConnections() {
        Array.from(svg.children).forEach(child => {
            if (child !== tempPath && child.tagName === 'path' && child.id !== 'arrowhead' && child.tagName !== 'defs') {
                child.remove();
            }
        });

        currentCanvas.connections.forEach(conn => {
            const fromCard = currentCanvas.cards.find(c => c.id == conn.fromCardId);
            const toCard = currentCanvas.cards.find(c => c.id == conn.toCardId);
            
            if (fromCard && toCard) {
                const startEl = cardLayer.querySelector(`.card[data-id="${fromCard.id}"]`);
                const endEl = cardLayer.querySelector(`.card[data-id="${toCard.id}"]`);
                
                if (startEl && endEl) {
                    const pathD = calculateFixedPath(fromCard, toCard, startEl, endEl, conn.fromPort, conn.toPort);
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute("d", pathD);
                    path.setAttribute("class", "connection-line");
                    path.setAttribute("marker-end", "url(#arrowhead)");
                    
                    path.addEventListener('contextmenu', (e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         showConnectionContextMenu(e.clientX, e.clientY, conn.id);
                    });
                    
                    svg.prepend(path); 
                }
            }
        });
    }

    // Calculate coordinates for a specific port type based on DOM position
    function getPortCoordinates(card, el, portType) {
        const portEl = el.querySelector(`.connection-port[data-port="${portType}"]`);
        if (!portEl) {
             return { x: card.x + (card.width || DEFAULT_CARD_WIDTH)/2, y: card.y }; 
        }

        const portRect = portEl.getBoundingClientRect();
        const cardRect = el.getBoundingClientRect();

        const portCenterX = portRect.left + portRect.width / 2;
        const portCenterY = portRect.top + portRect.height / 2;
        const offsetX = portCenterX - cardRect.left;
        const offsetY = portCenterY - cardRect.top;

        const canvasOffsetX = offsetX / currentCanvas.scale;
        const canvasOffsetY = offsetY / currentCanvas.scale;

        return {
            x: card.x + canvasOffsetX,
            y: card.y + canvasOffsetY
        };
    }


    function calculateFixedPath(cardA, cardB, elA, elB, portA, portB) {
        // Default ports if missing
        if (!portA) portA = 'right';
        if (!portB) portB = 'left';

        const start = getPortCoordinates(cardA, elA, portA);
        const end = getPortCoordinates(cardB, elB, portB);
        
        return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }

    function createCardElement(card) {
        const el = document.createElement('div');
        el.className = 'card';
        el.style.left = `${card.x}px`;
        el.style.top = `${card.y}px`;
        if (card.width) el.style.width = `${card.width}px`;
        if (card.height) el.style.height = `${card.height}px`;
        el.dataset.id = card.id;

        // Hydrate content: logic to ensure we show latest content even if card data is stale
        // ALWAYS update from globalState to ensure fresh content on reload
        const freshPost = globalState.posts.find(p => p.permalink === card.postData.permalink);
        let displayContent = card.postData.content || card.postData.summary; // Fallback
        
        if (freshPost) {
             card.postData = freshPost; // Sync full post data
             displayContent = freshPost.content || freshPost.summary || 'No content';
        }

        if (!displayContent) displayContent = 'No content';

        el.innerHTML = `
            <div class="card-drag-handle"></div>
            <div class="card-header">${card.postData.title}</div>
            <div class="card-content">${displayContent}</div>
            
            <div class="connection-port port-top" data-port="top" title="Connect Top"></div>
            <div class="connection-port port-right" data-port="right" title="Connect Right"></div>
            <div class="connection-port port-bottom" data-port="bottom" title="Connect Bottom"></div>
            <div class="connection-port port-left" data-port="left" title="Connect Left"></div>
            
            <div class="resize-handle" title="Resize"></div>
        `;

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, card.id);
        });

        // Drag Card Logic
        const dragHandle = el.querySelector('.card-drag-handle');
        dragHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            let startX = e.clientX;
            let startY = e.clientY;
            let initialX = card.x;
            let initialY = card.y;

            function onMouseMove(e) {
                const dx = (e.clientX - startX) / currentCanvas.scale;
                const dy = (e.clientY - startY) / currentCanvas.scale;
                card.x = initialX + dx;
                card.y = initialY + dy;
                el.style.left = `${card.x}px`;
                el.style.top = `${card.y}px`;
                renderConnections(); 
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                saveCurrentCanvas();
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        // Resize Logic
        const resizeHandle = el.querySelector('.resize-handle');
        resizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault(); // Prevent text selection
            
            let startX = e.clientX;
            let startY = e.clientY;
            let startWidth = el.offsetWidth;
            let startHeight = el.offsetHeight;

            function onMouseMove(e) {
                const dx = (e.clientX - startX) / currentCanvas.scale;
                const dy = (e.clientY - startY) / currentCanvas.scale;
                
                const newWidth = Math.max(150, startWidth + dx);
                const newHeight = Math.max(100, startHeight + dy);
                
                card.width = newWidth;
                card.height = newHeight;
                
                el.style.width = `${newWidth}px`;
                el.style.height = `${newHeight}px`;
                renderConnections();
            }
            
            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                saveCurrentCanvas();
            }
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        el.querySelectorAll('.connection-port').forEach(port => {
            port.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                startConnection(card.id, port.dataset.port, port, e);
            });
            port.addEventListener('mouseup', (e) => {
                 if (isConnecting && connectStartCardId && connectStartCardId !== card.id) {
                     e.stopPropagation(); 
                     finishConnection(card.id, port.dataset.port);
                 }
            });
        });

        el.querySelector('.card-header').addEventListener('click', () => {
             window.location.href = card.postData.permalink;
        });

        return el;
    }

    function showContextMenu(x, y, cardId) {
        removeContextMenus();
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.innerHTML = `<div class="context-menu-item" id="ctx-delete"><span>🗑 Delete Card</span></div>`;
        app.appendChild(menu);
        document.getElementById('ctx-delete').addEventListener('click', () => {
             deleteCard(cardId);
             menu.remove();
        });
    }

    function showConnectionContextMenu(x, y, connId) {
        removeContextMenus();
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.innerHTML = `<div class="context-menu-item" id="ctx-delete-conn"><span>🗑 Delete Connection</span></div>`;
        app.appendChild(menu);
        document.getElementById('ctx-delete-conn').addEventListener('click', () => {
             deleteConnection(connId);
             menu.remove();
        });
    }

    function removeContextMenus() {
        const existing = document.querySelectorAll('.context-menu');
        existing.forEach(e => e.remove());
    }

    function deleteCard(id) {
        currentCanvas.cards = currentCanvas.cards.filter(c => c.id !== id);
        currentCanvas.connections = currentCanvas.connections.filter(c => c.fromCardId !== id && c.toCardId !== id);
        render();
        saveCurrentCanvas();
    }

    function deleteConnection(id) {
        currentCanvas.connections = currentCanvas.connections.filter(c => c.id !== id);
        renderConnections();
        saveCurrentCanvas();
    }
    
    // --- Modals ---
    
    function showInputModal(title, message, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <h2>${title}</h2>
                <p>${message}</p>
                <input type="text" id="modal-input" autofocus>
                <div class="modal-buttons">
                    <button class="modal-btn" id="modal-cancel">Cancel</button>
                    <button class="modal-btn primary" id="modal-confirm">Create</button>
                </div>
            </div>
        `;
        app.appendChild(overlay);
        
        const input = overlay.querySelector('#modal-input');
        const confirmBtn = overlay.querySelector('#modal-confirm');
        
        function onConfirm() {
            const val = input.value.trim();
            overlay.remove();
            callback(val);
        }
        
        function onCancel() {
             overlay.remove();
             callback(null);
        }
        
        confirmBtn.addEventListener('click', onConfirm);
        overlay.querySelector('#modal-cancel').addEventListener('click', onCancel);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
        });
        
        input.focus();
    }
    
    function showConfirmModal(title, message, onConfirm) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <h2>${title}</h2>
                <p>${message}</p>
                <div class="modal-buttons">
                    <button class="modal-btn" id="modal-cancel">Cancel</button>
                    <button class="modal-btn primary" id="modal-confirm">Delete</button>
                </div>
            </div>
        `;
        app.appendChild(overlay);
        
        overlay.querySelector('#modal-confirm').addEventListener('click', () => {
            overlay.remove();
            onConfirm();
        });
        overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    }

    // --- Interactions ---

    function startConnection(cardId, portType, portEl, e) {
        isConnecting = true;
        connectStartCardId = cardId;
        connectStartPort = portType;
        
        tempPath.style.display = "block";
        
        // Calculate exact start coordinates
        const cardEl = portEl.closest('.card');
        const startCoords = getPortCoordinates(
            currentCanvas.cards.find(c => c.id == cardId), 
            cardEl, 
            portType
        );

        function onMouseMove(moveEvent) {
            const mx = (moveEvent.clientX - currentCanvas.pointX) / currentCanvas.scale;
            const my = (moveEvent.clientY - currentCanvas.pointY) / currentCanvas.scale;
            tempPath.setAttribute("d", `M ${startCoords.x} ${startCoords.y} L ${mx} ${my}`);
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Verify if we didn't finish connection
            setTimeout(() => {
                if (isConnecting) {
                    isConnecting = false;
                    tempPath.style.display = "none";
                }
            }, 50);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function finishConnection(targetCardId, targetPortType) {
        if (!currentCanvas.connections.find(c => c.fromCardId === connectStartCardId && c.toCardId === targetCardId)) {
            currentCanvas.connections.push({
                id: Date.now(),
                fromCardId: connectStartCardId,
                fromPort: connectStartPort,
                toCardId: targetCardId,
                toPort: targetPortType
            });
            renderConnections();
            saveCurrentCanvas();
        }
        isConnecting = false;
        tempPath.style.display = "none";
    }

    function bindCanvasEvents() {
        app.addEventListener('mousedown', (e) => {
            if (e.target.closest('.card') || e.target.closest('.ui-controls') || e.target.closest('.sidebar') || e.target.closest('.modal') || e.target.closest('.context-menu') || e.target.closest('.connection-line')) return;
            
            isPanning = true;
            panStartX = e.clientX - currentCanvas.pointX;
            panStartY = e.clientY - currentCanvas.pointY;
            app.style.cursor = 'grabbing';
            removeContextMenus();
        });

        document.addEventListener('mousemove', (e) => {
            if (isPanning) {
                e.preventDefault();
                currentCanvas.pointX = e.clientX - panStartX;
                currentCanvas.pointY = e.clientY - panStartY;
                container.style.transform = `translate(${currentCanvas.pointX}px, ${currentCanvas.pointY}px) scale(${currentCanvas.scale})`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isPanning) {
                isPanning = false;
                app.style.cursor = 'grab';
                saveCurrentCanvas();
            }
        });

        app.addEventListener('wheel', (e) => {
            e.preventDefault();
            const xs = (e.clientX - currentCanvas.pointX) / currentCanvas.scale;
            const ys = (e.clientY - currentCanvas.pointY) / currentCanvas.scale;
            const delta = -e.deltaY;
            
            (delta > 0) ? (currentCanvas.scale *= 1.1) : (currentCanvas.scale /= 1.1);
            
            currentCanvas.pointX = e.clientX - xs * currentCanvas.scale;
            currentCanvas.pointY = e.clientY - ys * currentCanvas.scale;
            render(); 
            saveCurrentCanvas();
        });
    }

    function resetView() {
        currentCanvas.pointX = 0;
        currentCanvas.pointY = 0;
        currentCanvas.scale = 1;
        render(); 
        saveCurrentCanvas();
    }

    function showAddModal() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        app.appendChild(overlay); // Append overlay once
        overlay.style.display = 'flex';
        
        // Initial render function
        const renderList = (posts) => {
             return posts.map((post, originalIdx) => `
                <div class="post-item" data-idx="${globalState.posts.indexOf(post)}">
                    <strong>${post.title}</strong>
                    <div style="font-size: 0.8rem; color: #666;">${post.summary ? post.summary.replace(/<[^>]*>?/gm, '').substring(0, 50) + '...' : ''}</div>
                </div>
            `).join('');
        };

        const modalContent = `
            <div class="modal" style="width: 400px; max-height: 80vh; display: flex; flex-direction: column;">
                <h2>Add Card</h2>
                <input type="text" id="modal-search-input" placeholder="Search posts..." autofocus>
                <div class="post-list" id="modal-post-list" style="flex: 1; overflow-y: auto;">
                    ${renderList(globalState.posts)}
                </div>
                <div class="modal-buttons" style="margin-top: 10px;">
                    <button class="icon-btn" id="modal-close" style="width: 100%; border-radius: 8px;">Close</button>
                </div>
            </div>
        `;
        
        overlay.innerHTML = modalContent;
        
        const searchInput = document.getElementById('modal-search-input');
        const listContainer = document.getElementById('modal-post-list');

        // Search Filter
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = globalState.posts.filter(p => 
                p.title.toLowerCase().includes(term) || 
                (p.content && p.content.toLowerCase().includes(term))
            );
            listContainer.innerHTML = renderList(filtered);
            attachItemListeners();
        });

        const attachItemListeners = () => {
            document.querySelectorAll('.post-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const idx = item.dataset.idx;
                    addCard(globalState.posts[idx]);
                    overlay.style.display = 'none';
                });
            });
        };
        attachItemListeners();

        document.getElementById('modal-close').addEventListener('click', () => {
            overlay.style.display = 'none';
        });
        
        // Close on click outside
        overlay.onclick = (e) => {
             if (e.target === overlay) overlay.style.display = 'none';
        };
    }

    function addCard(postData) {
        const sidebarWidth = 250;
        const centerX = ((window.innerWidth - sidebarWidth) / 2 + sidebarWidth - currentCanvas.pointX) / currentCanvas.scale;
        const centerY = (window.innerHeight / 2 - currentCanvas.pointY) / currentCanvas.scale;

        const newCard = {
            id: Date.now(),
            x: centerX - DEFAULT_CARD_WIDTH/2,
            y: centerY - 75,
            width: DEFAULT_CARD_WIDTH, // Default width
            postData: postData
        };
        
        currentCanvas.cards.push(newCard);
        render();
        saveCurrentCanvas();
    }

    init();
});
