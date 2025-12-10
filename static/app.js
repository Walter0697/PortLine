let currentOrientation = 'horizontal';
let currentData = null;
let apiKey = null;

// Check for API key on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check URL search parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const urlApiKey = urlParams.get('apiKey');

    if (urlApiKey) {
        // Validate the URL API key
        validateAndStoreApiKey(urlApiKey);
    } else {
        // Check localStorage
        apiKey = localStorage.getItem('portline_api_key');

        if (apiKey) {
            showVisualization();
        } else {
            showLogin();
        }
    }
});

// Function to validate and store API key
async function validateAndStoreApiKey(key) {
    try {
        const response = await fetch('/api/validate-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ apiKey: key })
        });

        const data = await response.json();

        if (data.valid) {
            localStorage.setItem('portline_api_key', key);
            apiKey = key;
            showVisualization();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Validation error:', error);
        showLogin();
    }
}

// Handle login form submission
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const apiKeyInput = document.getElementById('api-key-input');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const enteredKey = apiKeyInput.value.trim();

        if (!enteredKey) {
            showError('Please enter an API key');
            return;
        }

        // Validate the API key with the backend
        try {
            const response = await fetch('/api/validate-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ apiKey: enteredKey })
            });

            const data = await response.json();

            if (data.valid) {
                // Store API key and show visualization
                localStorage.setItem('portline_api_key', enteredKey);
                apiKey = enteredKey;
                hideError();
                showVisualization();
            } else {
                showError('Invalid API key');
            }
        } catch (error) {
            console.error('Validation error:', error);
            showError('Failed to validate API key');
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }
});

function showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('visualization').style.display = 'none';
}

function showVisualization() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('visualization').style.display = 'flex';
}

// Intercept HTMX requests to add Authorization header
document.body.addEventListener('htmx:configRequest', (event) => {
    if (apiKey) {
        event.detail.headers['Authorization'] = `Bearer ${apiKey}`;
    }
});

// Listen for HTMX responses
document.body.addEventListener('htmx:afterRequest', (event) => {
    if (event.detail.pathInfo.requestPath === '/api/ports') {
        // Check for 401 Unauthorized
        if (event.detail.xhr.status === 401) {
            localStorage.removeItem('portline_api_key');
            apiKey = null;
            showLogin();
            return;
        }

        try {
            const data = JSON.parse(event.detail.xhr.response);
            currentData = data;
            renderPorts(data);
        } catch (e) {
            console.error('Failed to parse port data:', e);
        }
    }
});

function renderPorts(data) {
    const container = document.getElementById('ports-container');
    const markersContainer = document.getElementById('port-markers');
    container.innerHTML = '';
    markersContainer.innerHTML = '';

    if (!data.ports || data.ports.length === 0) {
        container.innerHTML = '<div class="loading">No containers with exposed ports found</div>';
        return;
    }

    // Round up max port to a nice number
    const actualMaxPort = data.maxPort;
    const roundedMaxPort = roundUpToNiceNumber(actualMaxPort);

    // Calculate dynamic intervals for markers
    const intervals = calculateIntervals(roundedMaxPort);

    // Add min marker (0)
    const minMarker = document.createElement('div');
    minMarker.className = 'port-marker port-marker-minmax';
    minMarker.textContent = '0';
    if (currentOrientation === 'horizontal') {
        minMarker.style.left = '0%';
    } else {
        minMarker.style.top = '0%';
    }
    markersContainer.appendChild(minMarker);

    // Render port markers
    intervals.forEach(port => {
        const marker = document.createElement('div');
        marker.className = 'port-marker';
        marker.textContent = port.toLocaleString();

        const position = (port / roundedMaxPort) * 100;

        if (currentOrientation === 'horizontal') {
            marker.style.left = `${position}%`;
        } else {
            marker.style.top = `${position}%`;
        }

        markersContainer.appendChild(marker);
    });

    // Add max marker
    const maxMarker = document.createElement('div');
    maxMarker.className = 'port-marker port-marker-minmax';
    maxMarker.textContent = roundedMaxPort.toLocaleString();
    if (currentOrientation === 'horizontal') {
        maxMarker.style.left = '100%';
    } else {
        maxMarker.style.top = '100%';
    }
    markersContainer.appendChild(maxMarker);

    // Remove old tooltip if exists
    const oldTooltip = document.getElementById('port-tooltip');
    if (oldTooltip) {
        oldTooltip.remove();
    }

    // Create tooltip element (reused for all dots)
    const tooltip = document.createElement('div');
    tooltip.id = 'port-tooltip';
    tooltip.className = 'port-tooltip';
    document.body.appendChild(tooltip);

    // Detect port ranges (consecutive ports from same container)
    const sortedPorts = [...data.ports].sort((a, b) => a.port - b.port);
    const ranges = [];
    const usedInRange = new Set();

    for (let i = 0; i < sortedPorts.length; i++) {
        if (usedInRange.has(sortedPorts[i].port)) continue;

        const rangeStart = sortedPorts[i];
        let rangeEnd = rangeStart;
        let consecutiveCount = 1;

        // Look for consecutive ports from the same container
        for (let j = i + 1; j < sortedPorts.length; j++) {
            if (sortedPorts[j].containerName === rangeStart.containerName &&
                sortedPorts[j].port === rangeEnd.port + 1) {
                rangeEnd = sortedPorts[j];
                consecutiveCount++;
                usedInRange.add(sortedPorts[j].port);
            } else if (sortedPorts[j].containerName === rangeStart.containerName) {
                break; // Non-consecutive port from same container
            }
        }

        // If we have 3 or more consecutive ports, treat as a range
        if (consecutiveCount >= 3) {
            ranges.push({
                start: rangeStart.port,
                end: rangeEnd.port,
                containerName: rangeStart.containerName,
                imageName: rangeStart.imageName,
                containerId: rangeStart.containerId,
                count: consecutiveCount
            });
            usedInRange.add(rangeStart.port);
        }
    }

    // Render port ranges as bars
    ranges.forEach(range => {
        const startPos = (range.start / roundedMaxPort) * 100;
        const endPos = (range.end / roundedMaxPort) * 100;
        const centerPos = (startPos + endPos) / 2;

        const rangeBar = document.createElement('div');
        rangeBar.className = 'port-range-bar';

        const rangeLabel = document.createElement('div');
        rangeLabel.className = 'port-range-label';
        rangeLabel.textContent = `${range.start}-${range.end}`;

        // Create start connector
        const startConnector = document.createElement('div');
        startConnector.className = 'port-connector range-connector';

        // Create end connector
        const endConnector = document.createElement('div');
        endConnector.className = 'port-connector range-connector';

        if (currentOrientation === 'horizontal') {
            // Start connector
            startConnector.style.left = `${startPos}%`;
            startConnector.style.top = '0px';
            startConnector.style.height = '50px';

            // End connector
            endConnector.style.left = `${endPos}%`;
            endConnector.style.top = '0px';
            endConnector.style.height = '50px';

            // Range bar at dot level (horizontal) - extend slightly beyond connectors
            rangeBar.style.left = `${startPos - 1}%`;
            rangeBar.style.width = `${endPos - startPos + 2}%`;
            rangeBar.style.top = '58px';

            // Label below the range bar
            rangeLabel.style.left = `${centerPos}%`;
            rangeLabel.style.top = '78px';
            rangeLabel.style.transform = 'translateX(-50%)';
        } else {
            // Start connector
            startConnector.style.top = `${startPos}%`;
            startConnector.style.left = '0px';
            startConnector.style.width = '50px';

            // End connector
            endConnector.style.top = `${endPos}%`;
            endConnector.style.left = '0px';
            endConnector.style.width = '50px';

            // Range bar at dot level (vertical) - extend slightly beyond connectors
            rangeBar.style.top = `${startPos - 1}%`;
            rangeBar.style.height = `${endPos - startPos + 2}%`;
            rangeBar.style.left = '55px';

            // Label to the right of range bar
            rangeLabel.style.top = `${centerPos}%`;
            rangeLabel.style.left = '75px';
            rangeLabel.style.transform = 'translateY(-50%)';
        }

        // Add hover events for range bar
        const rangeInfo = {
            port: `${range.start}-${range.end} (${range.count} ports)`,
            containerName: range.containerName,
            imageName: range.imageName,
            containerId: range.containerId
        };

        rangeBar.addEventListener('mouseenter', (e) => {
            showTooltip(tooltip, rangeInfo, e);
        });

        rangeBar.addEventListener('mousemove', (e) => {
            updateTooltipPosition(tooltip, e);
        });

        rangeBar.addEventListener('mouseleave', () => {
            hideTooltip(tooltip);
        });

        // Add hover for connectors too
        [startConnector, endConnector].forEach(conn => {
            conn.addEventListener('mouseenter', (e) => {
                showTooltip(tooltip, rangeInfo, e);
            });
            conn.addEventListener('mousemove', (e) => {
                updateTooltipPosition(tooltip, e);
            });
            conn.addEventListener('mouseleave', () => {
                hideTooltip(tooltip);
            });
        });

        container.appendChild(startConnector);
        container.appendChild(endConnector);
        container.appendChild(rangeBar);
        container.appendChild(rangeLabel);
    });

    // Render individual ports (excluding those in ranges)
    const portsToRender = data.ports.filter(p => !usedInRange.has(p.port));

    // Render each port with collision detection for connector heights and direction
    const sortedIndividualPorts = [...portsToRender].sort((a, b) => a.port - b.port);
    const connectorConfig = new Map(); // Track configuration for each port

    sortedIndividualPorts.forEach((portInfo, index) => {
        const position = (portInfo.port / roundedMaxPort) * 100;

        let config = { direction: 'down', heightLevel: 0 };

        if (index > 0) {
            const prevPort = sortedIndividualPorts[index - 1];
            const prevPosition = (prevPort.port / roundedMaxPort) * 100;
            const distance = Math.abs(position - prevPosition);

            // If extremely close (< 1.5%), point upward
            if (distance < 1.5) {
                config.direction = 'up';
                config.heightLevel = 0; // All upward connectors same height
            }
            // If moderately close (< 3%), use different downward heights
            else if (distance < 3) {
                const prevConfig = connectorConfig.get(prevPort.port);
                if (prevConfig.direction === 'down') {
                    config.heightLevel = (prevConfig.heightLevel + 1) % 3;
                }
            }
        }

        connectorConfig.set(portInfo.port, config);
    });

    portsToRender.forEach(portInfo => {
        const position = (portInfo.port / roundedMaxPort) * 100;
        const config = connectorConfig.get(portInfo.port);

        // Calculate connector height and dot position based on level and direction
        let connectorHeight, dotPosition, labelPosition;

        if (config.direction === 'up') {
            // Upward pointing connector
            connectorHeight = 50;
            dotPosition = -50;
            labelPosition = -70;
        } else {
            // Downward pointing connector with varying heights
            if (config.heightLevel === 0) {
                connectorHeight = 50;
                dotPosition = 50;
                labelPosition = 70;
            } else if (config.heightLevel === 1) {
                connectorHeight = 90;
                dotPosition = 90;
                labelPosition = 110;
            } else {
                connectorHeight = 130;
                dotPosition = 130;
                labelPosition = 150;
            }
        }

        // Create connector line
        const connector = document.createElement('div');
        connector.className = 'port-connector';

        // Create dot
        const dot = document.createElement('div');
        dot.className = 'port-dot';

        // Create port label
        const label = document.createElement('div');
        label.className = 'port-label';
        label.textContent = portInfo.port;

        if (currentOrientation === 'horizontal') {
            connector.style.left = `${position}%`;

            if (config.direction === 'up') {
                // Upward connector - attach to ports-container and point up
                connector.style.bottom = '100%';
                connector.style.height = `${connectorHeight}px`;
                connector.classList.add('connector-up');

                dot.style.left = `${position}%`;
                dot.style.bottom = `calc(100% + ${connectorHeight}px)`;
                dot.style.transform = 'translateX(-50%)';
                dot.classList.add('horizontal-dot');

                label.style.left = `${position}%`;
                label.style.bottom = `calc(100% + ${connectorHeight + 20}px)`;
                label.style.transform = 'translateX(-50%)';
            } else {
                // Downward connector
                connector.style.top = '0px';
                connector.style.height = `${connectorHeight}px`;

                dot.style.left = `${position}%`;
                dot.style.top = `${dotPosition}px`;
                dot.style.transform = 'translateX(-50%)';
                dot.classList.add('horizontal-dot');

                label.style.left = `${position}%`;
                label.style.top = `${labelPosition}px`;
                label.style.transform = 'translateX(-50%)';
            }
        } else {
            // Vertical orientation (keep existing logic)
            connector.style.top = `${position}%`;
            connector.style.left = '0px';
            connector.style.width = `${connectorHeight}px`;

            dot.style.top = `${position}%`;
            dot.style.left = `${connectorHeight}px`;
            dot.style.transform = 'translateY(-50%)';
            dot.classList.add('vertical-dot');

            label.style.top = `${position}%`;
            label.style.left = `${connectorHeight + 20}px`;
            label.style.transform = 'translateY(-50%)';
        }

        // Add hover events
        dot.addEventListener('mouseenter', (e) => {
            showTooltip(tooltip, portInfo, e);
        });

        dot.addEventListener('mousemove', (e) => {
            updateTooltipPosition(tooltip, e);
        });

        dot.addEventListener('mouseleave', () => {
            hideTooltip(tooltip);
        });

        container.appendChild(connector);
        container.appendChild(dot);
        container.appendChild(label);
    });
}

function roundUpToNiceNumber(num) {
    // Round up to nearest nice number
    if (num <= 1000) return 1000;
    if (num <= 2500) return 2500;
    if (num <= 5000) return 5000;
    if (num <= 7500) return 7500;
    if (num <= 10000) return 10000;
    if (num <= 15000) return 15000;
    if (num <= 20000) return 20000;
    if (num <= 25000) return 25000;
    if (num <= 30000) return 30000;
    if (num <= 40000) return 40000;
    if (num <= 50000) return 50000;

    // For larger numbers, round up to nearest 10000
    return Math.ceil(num / 10000) * 10000;
}

function calculateIntervals(maxPort) {
    // Define possible interval steps
    const steps = [1000, 2500, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 40000, 50000];

    // Find appropriate interval (aim for 4-6 markers)
    let interval = 1000;
    for (let step of steps) {
        if (maxPort / step <= 6) {
            interval = step;
            break;
        }
    }

    // Generate markers
    const markers = [];
    for (let i = interval; i <= maxPort; i += interval) {
        markers.push(i);
    }

    return markers;
}

function showTooltip(tooltip, portInfo, event) {
    tooltip.innerHTML = `
        <div class="tooltip-port">Port ${portInfo.port}</div>
        <div class="tooltip-label">Container</div>
        <div class="tooltip-value">${portInfo.containerName}</div>
        <div class="tooltip-label">Image</div>
        <div class="tooltip-value">${portInfo.imageName}</div>
        <div class="tooltip-label">ID</div>
        <div class="tooltip-value">${portInfo.containerId}</div>
    `;

    tooltip.classList.add('visible');

    // Force a reflow to get accurate dimensions
    tooltip.offsetHeight;

    updateTooltipPosition(tooltip, event);
}

function updateTooltipPosition(tooltip, event) {
    // Wait for next frame to ensure tooltip has rendered
    requestAnimationFrame(() => {
        const tooltipRect = tooltip.getBoundingClientRect();
        const padding = 15;

        // Default: show to the right and centered vertically on cursor
        let left = event.clientX + padding;
        let top = event.clientY - (tooltipRect.height / 2);

        // If would go off right edge, show on left
        if (left + tooltipRect.width + padding > window.innerWidth) {
            left = event.clientX - tooltipRect.width - padding;
        }

        // If would go off bottom, align to bottom edge
        if (top + tooltipRect.height + padding > window.innerHeight) {
            top = window.innerHeight - tooltipRect.height - padding;
        }

        // If would go off top, align to top edge
        if (top < padding) {
            top = padding;
        }

        // If would go off left (shouldn't happen but just in case)
        if (left < padding) {
            left = padding;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    });
}

function hideTooltip(tooltip) {
    tooltip.classList.remove('visible');
}
