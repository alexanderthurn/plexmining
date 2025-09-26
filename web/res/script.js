function getParameterByName(name, url = window.location.href) {
    name = name.replace(/[[\]]/g, '\$&' );
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function fetchData(url) {
    fetch(url)
        .then(response => response.json())
        .then(data => {
            document.getElementById('api-result').textContent = data.message;
        });
}

const demoMode = getParameterByName('demo') === 'true';
const apiUrl = demoMode ? '../api/index.php?fake=true' : '../api/index.php';
const dataApiUrl = '../api/data.php';

function populateMinerTable(miners) {
    const tbody = document.getElementById('miner-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    (miners || []).forEach((miner, index) => {
        const row = document.createElement('tr');
        
        // For row > 1 (index > 0), show cumulative values in gray and + prefix
        let hashrateHtml = formatMaybeNumberDE(miner.hashrate, 0);
        let powerKw = typeof miner.power_kw === 'number' ? miner.power_kw : (typeof miner.power === 'number' ? miner.power / 1000 : 0);
        let powerHtml = formatMaybeNumberDE(powerKw, 1);
        
        if (index > 0) {
            // Add + prefix from second row onwards
            hashrateHtml = '+' + hashrateHtml;
            powerHtml = '+' + powerHtml;
            
            // Add cumulative values if available
            if (miner.cumulative_hashrate || miner.cumulative_power_kw) {
                hashrateHtml += (miner.cumulative_hashrate ? 
                    ` <small class="text-muted" style="color:gray;">(${formatMaybeNumberDE(miner.cumulative_hashrate, 0)})</small>` : '');
                powerHtml += (miner.cumulative_power_kw ? 
                    ` <small class="text-muted" style="color:gray;">(${formatMaybeNumberDE(miner.cumulative_power_kw, 1)})</small>` : '');
            }
        }
        
        // Format TH/kWh display
        const thPerKwhDisplay = miner.th_per_kwh ? miner.th_per_kwh.toFixed(2) : '0.00';
        
        // Format Min. Batterie display
        const minBatteryDisplay = miner.minBatteryKwh ? miner.minBatteryKwh.toFixed(1) : '15.0';
        
        row.innerHTML = `
            <td>${miner.id}</td>
            <td>${miner.model}</td>
            <td>${hashrateHtml}</td>
            <td>${powerHtml}</td>
            <td>${thPerKwhDisplay}</td>
            <td>${minBatteryDisplay}</td>
            <td>${miner.ip || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}


function fetchAndRenderMiners() {
    fetch(dataApiUrl)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            // expose settings early for downstream renderers (graphs, tables)
            if (data && data.settings) {
                window.__plexSettings = data.settings;
                // Load auto-mode from settings
                loadAndApplyAutoMode();
                // Load system-scale from settings
                loadAndApplySystemScale();
            }

            if (data && Array.isArray(data.miners)) {
                window.__latestMiners = data.miners; // Store for edit mode
                populateMinerTable(data.miners);
            } else if (Array.isArray(data)) {
                // Backward compat: if endpoint returns array directly
                window.__latestMiners = data; // Store for edit mode
                populateMinerTable(data);
            } else {
                window.__latestMiners = []; // Store for edit mode
                populateMinerTable([]);
            }
            // Render PV and Weather
            if (data && data.pv) {
                renderPV(data.pv);
            }
            if (data && (data.weather_daily || data.calculation)) {
                // Pass aggregations to the weather function
                if (data.weather_aggregations) {
                    window.weatherAggregations = data.weather_aggregations;
                }
                renderWeatherAndForecast(data.weather_daily, data.calculation);
            }
            if (data && data.weather_hourly) {
                renderHourlyWeather(data.weather_hourly);
            }
            // Last update timestamps: show relative age (< 7d) or date; color if >24h (warning) or >48h (danger)
            if (data && data.mtimes) {
                setRelativeTimestamp('ts-pv', data.mtimes.pv);
                setRelativeTimestamp('ts-weather', data.mtimes.weather_daily);
                setRelativeTimestamp('ts-miners', data.mtimes.miners);
                setRelativeTimestamp('ts-weather-hourly', data.mtimes.weather_hourly);
            }
            setText('last-update', new Date().toISOString());
        })
        .catch(function() {
            populateMinerTable([]);
        });
}

// Helper functions moved to helper.js

// setText moved to helper.js

function renderPV(pv) {
    if (!pv) return;
    
    // Check if we have server-calculated values
    if (pv.calculated) {
        // Use pre-calculated server-side values (already formatted in German locale)
        var pvPowerKw = typeof pv.pv_leistung_kw !== 'undefined' ? pv.pv_leistung_kw : (typeof pv.pv_leistung_w !== 'undefined' ? pv.pv_leistung_w / 1000 : 0);
        var pvKwp = window.__plexSettings && window.__plexSettings.pv_kwp !== 'undefined' ? window.__plexSettings.pv_kwp : 120;
        var pvMaxPowerKw = pvKwp; // in kW
        var pvMaxPowerW = pvMaxPowerKw * 1000; // Convert to watts
        var pvPowerPercent = pvMaxPowerKw > 0 ? (pvPowerKw / pvMaxPowerKw * 100) : 0;
        
        var pvPowerKwDisplay = (typeof pvPowerKw === 'number' && isFinite(pvPowerKw)) ? (Math.round(pvPowerKw * 10) / 10).toString().replace('.', ',') : '0';
        setText('pv-leistung', pvPowerKwDisplay + ' kW (' + Math.round(pvPowerPercent * 10) / 10 + '%)');
        setText('pv-kwp', pvKwp);
        setText('batterie-kapazitaet', pv.calculated.formatted_battery_capacity);
        setText('batterie-current', pv.calculated.formatted_battery_kwh);
        setText('batterie-percent', typeof pv.batterie_stand?.percent === 'number' ? pv.batterie_stand.percent : '0');
        
        // Power values
        setText('haus-last', pv.calculated.formatted_haus_last);
        setText('available-power', pv.calculated.formatted_available_power);
        
        // Draw charts using original values (not formatted)
        var batteryKwh = pv.batterie_stand && typeof pv.batterie_stand.kwh !== 'undefined' ? pv.batterie_stand.kwh : 0;
        var batteryPercent = pv.batterie_stand && typeof pv.batterie_stand.percent !== 'undefined' ? pv.batterie_stand.percent : 0;
        
        try {
            if (typeof d3 !== 'undefined') {
                if (typeof drawBatteryDonut === 'function') {
                    drawBatteryDonut(batteryPercent, batteryKwh);
                }
                if (typeof drawSolarPanel === 'function') {
                    drawSolarPanel(pvPowerPercent);
                }
            }
        } catch (e) { /* no-op */ }
    } else {
        // Fallback: Original logic if no server calculations available
        function formatNumberDE(value, decimals) {
            return typeof value === 'number' ? value.toFixed(decimals).replace('.', ',') : value;
        }
        
        var pvPowerKw = typeof pv.pv_leistung_kw !== 'undefined' ? pv.pv_leistung_kw : (typeof pv.pv_leistung_w !== 'undefined' ? pv.pv_leistung_w / 1000 : 0);
        var pvPowerW = pvPowerKw * 1000;
        var pvKwp = window.__plexSettings && window.__plexSettings.pv_kwp !== 'undefined' ? window.__plexSettings.pv_kwp : 120;
        var pvMaxPowerW = pvKwp * 1000; // Convert kWp to watts  
        var pvPowerPercent = pvMaxPowerW > 0 ? (pvPowerW / pvMaxPowerW * 100) : 0;
        
        setText('pv-leistung', formatNumberDE(pvPowerKw, 1) + ' kW (' + Math.round(pvPowerPercent * 10) / 10 + '%)');
        setText('pv-kwp', pvKwp);
        
        var batteryKwh = pv.batterie_stand && typeof pv.batterie_stand.kwh !== 'undefined' ? pv.batterie_stand.kwh : 0;
        var batteryPercent = pv.batterie_stand && typeof pv.batterie_stand.percent !== 'undefined' ? pv.batterie_stand.percent : 0;
        var batteryCapacity = pv.batterie_stand && typeof pv.batterie_stand.capacity_kwh !== 'undefined' ? pv.batterie_stand.capacity_kwh : 49.9;
        setText('batterie-kapazitaet', formatNumberDE(batteryCapacity, 1));
        setText('batterie-current', formatNumberDE(batteryKwh, 1));
        setText('batterie-percent', formatNumberDE(batteryPercent, 0));
        
        try {
            if (typeof d3 !== 'undefined') {
                if (typeof drawBatteryDonut === 'function') {
                    drawBatteryDonut(batteryPercent, batteryKwh);
                }
                if (typeof drawSolarPanel === 'function') {
                    drawSolarPanel(pvPowerPercent);
                }
            }
        } catch (e) { /* no-op */ }
    }
    
    if (Array.isArray(pv.miner_betriebszeiten)) {
        setText('miner-betriebszeiten', pv.miner_betriebszeiten.join(', '));
    }
}

function renderWeatherAndForecast(weather, calculation) {
    if (Array.isArray(weather)) {
        // First check global weather_aggregations for server calculations
        // (Structure passed from main fetch via window variable)
        if (window.weatherAggregations) {
            var agg = window.weatherAggregations;
            // Use server-calculated values (already formatted in German locale)
            setText('sun-today', agg.today ? agg.today.sunshine_hours : '0,00');
            setText('sun-tomorrow', agg.tomorrow ? agg.tomorrow.sunshine_hours : '0,00');
            setText('sun-7d', agg['7d'] ? agg['7d'].sunshine_hours : '0,00');
            setText('sun-14d', agg['14d'] ? agg['14d'].sunshine_hours : '0,00');
            
            setText('rad-today', agg.today ? agg.today.radiation_sum : '0');
            setText('rad-tomorrow', agg.tomorrow ? agg.tomorrow.radiation_sum : '0');
            setText('rad-7d', agg['7d'] ? agg['7d'].radiation_sum : '0');
            setText('rad-14d', agg['14d'] ? agg['14d'].radiation_sum : '0');
            
            setText('pv-today', agg.today ? agg.today.pv_energy : '0,00');
            setText('pv-tomorrow', agg.tomorrow ? agg.tomorrow.pv_energy : '0,00');
            setText('pv-7d', agg['7d'] ? agg['7d'].pv_energy : '0,00');
            setText('pv-14d', agg['14d'] ? agg['14d'].pv_energy : '0,00');
        } else {
            // Fallback: Use JavaScript calculations if no server calculations
            setText('sun-today', formatNumberDE(sumHours(weather, 1), 2));
            setText('sun-tomorrow', formatNumberDE(sumHours(weather.slice(1), 1), 2));
            setText('sun-7d', formatNumberDE(sumHours(weather, 7), 2));
            setText('sun-14d', formatNumberDE(sumHours(weather, 14), 2));
            setText('rad-today', formatNumberDE(sumRadiation(weather, 1), 0));
            setText('rad-tomorrow', formatNumberDE(sumRadiation(weather.slice(1), 1), 0));
            setText('rad-7d', formatNumberDE(sumRadiation(weather, 7), 0));
            setText('rad-14d', formatNumberDE(sumRadiation(weather, 14), 0));

            // PV energy calculations
            var pvKwp = (window.__plexSettings && typeof window.__plexSettings.pv_kwp === 'number') ? window.__plexSettings.pv_kwp : null;
            if (pvKwp) {
                var sumPV = function(arr, n) {
                    var s = 0; var count = Math.min(n, arr.length);
                    for (var i = 0; i < count; i++) {
                        var v = arr[i] && typeof arr[i].pv_energy_kwh === 'number' ? arr[i].pv_energy_kwh : 0;
                        s += v;
                    }
                    return Math.round(s * 100) / 100;
                };
                setText('pv-today', formatNumberDE(sumPV(weather, 1), 2));
                setText('pv-tomorrow', formatNumberDE(sumPV(weather.slice(1), 1), 2));
                setText('pv-7d', formatNumberDE(sumPV(weather, 7), 2));
                setText('pv-14d', formatNumberDE(sumPV(weather, 14), 2));
            } else {
                setText('pv-today', '');
                setText('pv-tomorrow', '');
                setText('pv-7d', '');
                setText('pv-14d', '');
            }
        }
    }
    // Render compact weather table
    var tbody = document.getElementById('weather-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (Array.isArray(weather)) {
        var pvKwp = (window.__plexSettings && isFinite(Number(window.__plexSettings.pv_kwp))) ? Number(window.__plexSettings.pv_kwp) : null;
        var pvFactor = (window.__plexSettings && isFinite(Number(window.__plexSettings.pvSystemFactor))) ? Number(window.__plexSettings.pvSystemFactor) : 0.8;
        
        // Update PV-Ertrag header with kWp value
        updatePVHeaderWithKwp(pvKwp);
        
        weather.forEach(function(row) {
            var tr = document.createElement('tr');
            var sun = (typeof row.sunshine_hours !== 'undefined') ? formatNumberDE(row.sunshine_hours, 2) : '';
            var radNum = Number(row.shortwave_radiation_sum_Wh_m2);
            var rad = isFinite(radNum) ? formatNumberDE(radNum, 0) : '';
            var pv = '';
            if (typeof row.pv_energy_kwh === 'number') {
                pv = formatNumberDE(row.pv_energy_kwh, 2);
            }
            tr.innerHTML = '<td>' + (row.date || '') + '</td>' +
                           '<td>' + sun + '</td>' +
                           '<td>' + rad + '</td>' +
                           '<td>' + pv + '</td>';
            tbody.appendChild(tr);
        });
    }

    // Draw D3 line chart for sunshine hours per day
    try {
        if (typeof d3 !== 'undefined' && typeof drawWeatherChart === 'function') {
            drawWeatherChart(weather || []);
        }
    } catch (e) { 
        console.error('Weather chart error:', e); 
    }
}

function renderHourlyWeather(hourlyData) {
    if (!Array.isArray(hourlyData)) return;
    
    // Filter to next 3 days (72 hours)
    var now = new Date();
    var allHours = hourlyData.filter(function(hour) {
        var hourTime = new Date(hour.datetime);
        var diffHours = (hourTime - now) / (1000 * 60 * 60);
        return diffHours >= 0 && diffHours <= 72; // Show next 3 days only
    });
    
    if (allHours.length === 0) return;
    
    // Helper functions for hourly data
    function sumHoursHourly(arr, hours) {
        var sum = 0;
        var count = Math.min(hours, arr.length);
        for (var i = 0; i < count; i++) {
            var duration = arr[i] && typeof arr[i].sunshine_duration === 'number' ? arr[i].sunshine_duration : 0;
            sum += duration / 3600; // Convert seconds to hours
        }
        return Math.round(sum * 100) / 100;
    }
    
        function sumRadiationHourly(arr, hours) {
            var sum = 0;
            var count = Math.min(hours, arr.length);
            for (var i = 0; i < count; i++) {
                var rad = arr[i] && typeof arr[i].global_tilted_irradiance === 'number' ? arr[i].global_tilted_irradiance : 0;
                sum += rad;
            }
            return Math.round(sum);
        }
    
    function sumPVHourly(arr, hours) {
        var sum = 0;
        var count = Math.min(hours, arr.length);
        for (var i = 0; i < count; i++) {
            var pv = arr[i] && typeof arr[i].pv_energy_kwh === 'number' ? arr[i].pv_energy_kwh : 0;
            sum += pv;
        }
        return Math.round(sum * 100) / 100;
    }
    
    
    // Render hourly table
    var tbody = document.getElementById('weather-hourly-table-body');
    if (tbody) {
        tbody.innerHTML = '';
        allHours.forEach(function(hour) {
            var tr = document.createElement('tr');
            var time = new Date(hour.datetime);
            var timeStr = allHours.length > 24 
                ? time.toLocaleString('de-DE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            var sunshine = hour.sunshine_duration ? formatNumberDE(hour.sunshine_duration / 3600, 2) : '0';
                var radiation = hour.global_tilted_irradiance ? formatNumberDE(hour.global_tilted_irradiance, 0) : '0';
                var direct = '0'; // No longer available with new API
            var cloudcover = hour.cloudcover ? formatNumberDE(hour.cloudcover, 0) : '0';
            var pv = hour.pv_energy_kwh ? formatNumberDE(hour.pv_energy_kwh, 2) : '0';
            
            tr.innerHTML = '<td>' + timeStr + '</td>' +
                          '<td>' + sunshine + '</td>' +
                          '<td>' + radiation + '</td>' +
                          '<td>' + direct + '</td>' +
                          '<td>' + cloudcover + '</td>' +
                          '<td>' + pv + '</td>';
            tbody.appendChild(tr);
        });
    }
    
    // Draw hourly chart
    try {
        if (typeof d3 !== 'undefined' && typeof drawHourlyWeatherChart === 'function') {
            drawHourlyWeatherChart(allHours);
        }
    } catch (e) { /* no-op */ }
}


// Auto Mode and Control Functions
function saveAutoModeSettings(autoMode) {
    // Get current settings
    const currentSettings = window.__plexSettings || {};
    
    // Merge with new autoMode
    const updatedSettings = Object.assign({}, currentSettings, { autoMode: autoMode });
    
    fetch('../api/settings.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSettings)
    })
    .then(response => response.json())
    .then(data => {
        console.log('Auto-mode setting saved:', data);
        // Update local store
        window.__plexSettings.autoMode = autoMode;
    })
    .catch(error => {
        console.error('Error saving auto-mode settings:', error);
    });
}

function loadAndApplyAutoMode() {
    const autoModeToggle = document.getElementById('auto-mode-toggle');
    const autoModeSettings = document.getElementById('auto-mode-settings');
    
    if (!autoModeToggle || !autoModeSettings) return;
    
    if (window.__plexSettings && typeof window.__plexSettings.autoMode === 'boolean') {
        autoModeToggle.checked = window.__plexSettings.autoMode;
        autoModeSettings.style.display = window.__plexSettings.autoMode ? 'block' : 'none';
    }
}

function loadAndApplySystemScale() {
    const systemScale = document.getElementById('system-scale');
    const systemScaleInput = document.getElementById('system-scale-input');
    
    if (!systemScale || !systemScaleInput) return;
    
    if (window.__plexSettings && typeof window.__plexSettings.systemScale === 'number') {
        const scaleValue = Math.max(0, Math.min(100, window.__plexSettings.systemScale));
        systemScale.value = scaleValue;
        systemScaleInput.value = scaleValue;
    }
}


function setupAutoModeToggle() {
    const autoModeToggle = document.getElementById('auto-mode-toggle');
    const autoModeSettings = document.getElementById('auto-mode-settings');
    
    if (autoModeToggle && autoModeSettings) {
        autoModeToggle.addEventListener('change', function() {
            const isAutoMode = this.checked;
            autoModeSettings.style.display = isAutoMode ? 'block' : 'none';
            
            // Persist to backend
            saveAutoModeSettings(isAutoMode);
        });
    }
}

function saveSystemScaleSettings(systemScale) {
    // Get current settings
    const currentSettings = window.__plexSettings || {};
    
    // Merge with new systemScale
    const updatedSettings = Object.assign({}, currentSettings, { systemScale: systemScale });
    
    fetch('../api/settings.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSettings)
    })
    .then(response => response.json())
    .then(data => {
        console.log('System scale setting saved:', data);
        // Update local store
        window.__plexSettings.systemScale = systemScale;
        
        // Reload data to refresh calculations that might depend on system scale
        fetchAndRenderMiners();
    })
    .catch(error => {
        console.error('Error saving system scale settings:', error);
    });
}

function setupSystemScaleHandlers() {
    const systemScale = document.getElementById('system-scale');
    const systemScaleInput = document.getElementById('system-scale-input');
    
    if (systemScale && systemScaleInput) {
        systemScale.addEventListener('input', function() {
            systemScaleInput.value = this.value;
            // Persist to backend
            saveSystemScaleSettings(parseInt(this.value, 10));
        });
        
        systemScaleInput.addEventListener('input', function() {
            systemScale.value = this.value;
            // Persist to backend
            saveSystemScaleSettings(parseInt(this.value, 10));
        });
    }
}


// Miner Edit Mode Functions
function setupMinerEditMode() {
    const editToggle = document.getElementById('miner-edit-mode-toggle');
    const viewMode = document.getElementById('miner-view-mode');
    const editMode = document.getElementById('miner-edit-mode');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const saveBtn = document.getElementById('save-miners-btn');
    const addMinerBtn = document.getElementById('add-miner-btn');
    
    // State tracking
    let isEditMode = false;
    let originalMiners = [];
    let currentMiners = [];
    
    if (editToggle) {
        editToggle.addEventListener('click', function() {
            isEditMode = !isEditMode;
            if (isEditMode) {
                enterEditMode();
            } else {
                exitEditMode();
            }
            updateEditToggleButton();
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            exitEditMode();
        });
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            saveMiners();
        });
    }
    
    if (addMinerBtn) {
        addMinerBtn.addEventListener('click', function() {
            addNewMinerRow();
        });
    }
    
    function updateEditToggleButton() {
        if (editToggle) {
            if (isEditMode) {
                editToggle.innerHTML = '<i class="bi bi-x me-1"></i>Abbrechen';
                editToggle.className = 'btn btn-secondary btn-sm me-2';
            } else {
                editToggle.innerHTML = '<i class="bi bi-pencil me-1"></i>Bearbeiten';
                editToggle.className = 'btn btn-primary btn-sm me-2';
            }
        }
    }
    
    function enterEditMode() {
        if (viewMode && editMode) {
            // Store the original miners first
            originalMiners = loadMinersForEdit();
            
            viewMode.style.display = 'none';
            editMode.style.display = 'block';
            
            renderEditMode();
        }
    }
    
    function exitEditMode() {
        if (viewMode && editMode) {
            viewMode.style.display = 'block';
            editMode.style.display = 'none';
            
            isEditMode = false;
            updateEditToggleButton();
        }
    }
    
    function renderEditMode() {
        const editTable = document.getElementById('miner-edit-table');
        if (!editTable) return;
        
        editTable.innerHTML = '';
        
        // Load current miners from settings or create from visible table
        const miners = loadMinersForEdit();
        currentMiners = JSON.parse(JSON.stringify(miners)); // Deep clone
        
        if (miners.length === 0) {
            // Add default row if no miners exist
            addNewMinerRow();
        } else {
            miners.forEach((miner, index) => {
                addEditRow(miner, index);
            });
        }
    }
    
    function loadMinersForEdit() {
        console.log('Loading miners for edit...');
        
        // Try to get miners from latest API data first
        if (window.__latestMiners && Array.isArray(window.__latestMiners)) {
            console.log('Using latest miners data:', window.__latestMiners);
            return [...window.__latestMiners];
        }
        
        // Try settings data
        if (window.__plexSettings && window.__plexSettings.miners) {
            console.log('Using settings miners data:', window.__plexSettings.miners);
            return [...window.__plexSettings.miners];
        }
        
        // Fallback: parse existing data if available
        const tbody = document.getElementById('miner-table-body');
        if (tbody && tbody.children.length > 0) {
            console.log('Parsing visible table data...');
            // Extract from visible table
            const miners = [];
            Array.from(tbody.children).forEach((row, index) => {
                const cells = row.children;
                if (cells.length >= 7) { // Now we have 7 columns
                    const idText = cells[0].textContent.trim();
                    const hashrateText = cells[2].textContent.trim();
                    const powerText = cells[3].textContent.trim();
                    const minBatteryText = cells[5].textContent.trim();
                    
                    // Extract clean numbers for parsing (remove cumulative display info)
                    const cleanHashrate = hashrateText.includes('(') ? hashrateText.substring(0, hashrateText.indexOf('(')).trim() : hashrateText;
                    const cleanPower = powerText.includes('(') ? powerText.substring(0, powerText.indexOf('(')).trim() : powerText;
                    
                    const miner = {
                        id: parseInt(idText) || index + 1,
                        model: cells[1].textContent.trim(),
                        hashrate: parseFloat(cleanHashrate) || 0,
                        power: parseFloat(cleanPower) || 0,
                        minBatteryKwh: parseFloat(minBatteryText) || 15.0,
                        ip: cells[6].textContent.trim() === '-' ? '' : cells[6].textContent.trim()
                    };
                    miners.push(miner);
                    console.log('Parsed miner:', miner);
                }
            });
            console.log('Final parsed miners:', miners);
            return miners;
        }
        
        console.log('No miner data found, returning empty array');
        return [];
    }
    
    function addEditRow(miner, index = null) {
        const editTable = document.getElementById('miner-edit-table');
        if (!editTable) return;
        
        const rowDiv = document.createElement('div');
        rowDiv.className = 'card mb-2';
        
        const minerId = miner?.id || (index !== null ? currentMiners.length + index : currentMiners.length + 1);
        
        rowDiv.innerHTML = `
            <div class="card-body p-3">
                <div class="row g-3">
                    <div class="col-md-2">
                        <label class="form-label small">Miner ID</label>
                        <input type="text" class="form-control form-control-sm" data-field="id" value="${minerId}" placeholder="1">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small">Modell</label>
                        <input type="text" class="form-control form-control-sm" data-field="model" value="${miner?.model || ''}" placeholder="z.B. S23">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small">Hashrate (TH/s)</label>
                        <input type="number" class="form-control form-control-sm" data-field="hashrate" value="${miner?.hashrate || ''}" step="0.01" placeholder="300">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small">Stromaufnahme (W)</label>
                        <input type="number" class="form-control form-control-sm" data-field="power" value="${miner?.power || ''}" step="0.1" placeholder="3500">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small">Min. Batterie (kWh)</label>
                        <input type="number" class="form-control form-control-sm" data-field="minBatteryKwh" value="${miner?.minBatteryKwh || 15.0}" step="0.1" placeholder="15.0" min="0" max="50">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small">IP-Adresse</label>
                        <input type="text" class="form-control form-control-sm" data-field="ip" value="${miner?.ip || ''}" placeholder="192.168.1.101">
                    </div>
                </div>
                <div class="row g-3 mt-2">
                    <div class="col-md-12 d-flex justify-content-end">
                        <button type="button" class="btn btn-danger btn-sm" data-remove="true">
                            X
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        editTable.appendChild(rowDiv);
        
        // Add event listener for remove button
        const removeBtn = rowDiv.querySelector('[data-remove]');
        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                rowDiv.remove();
            });
        }
    }
    
    function addNewMinerRow() {
        const newMiner = { id: '', model: '', hashrate: '', power: '', minBatteryKwh: 15.0, ip: '' };
        addEditRow(newMiner);
    }
    
    function saveMiners() {
        const editTable = document.getElementById('miner-edit-table');
        if (!editTable) return;
        
        console.log('Starting save process...');
        
        const miners = [];
        const rows = editTable.querySelectorAll('.card');
        
        console.log('Found rows to process:', rows.length);
        
        rows.forEach((row, index) => {
            const inputs = row.querySelectorAll('input[data-field]');
            const miner = {};
            
            console.log(`Processing row ${index}:`, inputs.length, 'inputs found');
            
            inputs.forEach(input => {
                const field = input.getAttribute('data-field');
                const value = input.value.trim();
                
                console.log(`${field}: "${value}"`);
                
                if (field === 'hashrate' || field === 'power' || field === 'minBatteryKwh') {
                    miner[field] = value && !isNaN(value) ? parseFloat(value) : (field === 'minBatteryKwh' ? 15.0 : 0);
                } else if (field === 'id') {
                    // ID is now text field, just store as string
                    miner[field] = value || `miner-${index + 1}`;
                } else {
                    miner[field] = value;
                }
            });
            
            // Only add valid miners (at least model filled)
            if (miner.model && miner.model.trim() !== '') {
                if (!miner.id || miner.id.trim() === '') {
                    miner.id = `miner-${miners.length + 1}`;
                }
                miners.push(miner);
                console.log(`Added miner:`, miner);
            } else {
                console.log('Skipping invalid miner:', miner);
            }
        });
        
        console.log('Final miners to save:', miners);
        currentMiners = miners;
        
        // Save to backend
        saveMinersToBackend(miners);
    }
    
    function saveMinersToBackend(miners) {
        // Merge with current settings as the settings endpoint requires the full object
        const currentSettings = window.__plexSettings || {};
        const updatedSettings = Object.assign({}, currentSettings, { miners: miners });
        
        console.log('Saving miners:', miners);
        console.log('Updated settings:', updatedSettings);
        
        // First validate input
        if (!Array.isArray(miners)) {
            alert('Ungültige Miner-Daten');
            return;
        }
        
        // Validate each miner
        const validMiners = [];
        miners.forEach((miner, index) => {
            if (miner && typeof miner === 'object') {
                const validMiner = {
                    id: miner.id || `miner-${index + 1}`,
                    model: miner.model || '',
                    hashrate: typeof miner.hashrate === 'number' ? miner.hashrate : 0,
                    power: typeof miner.power === 'number' ? miner.power : 0,
                    minBatteryKwh: typeof miner.minBatteryKwh === 'number' ? miner.minBatteryKwh : 15.0,
                    ip: miner.ip || ''
                };
                
                // Only include miners with model
                if (validMiner.model && validMiner.model.trim() !== '') {
                    validMiners.push(validMiner);
                }
            }
        });
        
        console.log('Validated miners:', validMiners);
        
        // Sort miners by efficiency (hashrate per power - best first)
        const sortedMiners = validMiners.sort((a, b) => {
            const efficiencyA = a.power > 0 ? a.hashrate / a.power : 0;
            const efficiencyB = b.power > 0 ? b.hashrate / b.power : 0;
            return efficiencyB - efficiencyA; // Descending order (best first)
        });
        
        console.log('Sorted miners by efficiency:', sortedMiners);
        
        const finalSettings = Object.assign({}, currentSettings, { miners: sortedMiners });
        
        fetch('../api/settings.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(finalSettings)
        })
        .then(response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Miner settings saved successfully:', data);
            
            if (data && (data.ok === true || typeof data === 'object')) {
                // Update local settings
                window.__plexSettings = finalSettings;
                window.__latestMiners = validMiners;
                
                // Exit edit mode and refresh table
                exitEditMode();
                
                // Reload the miner data
                fetchAndRenderMiners();
                
                alert('Miner erfolgreich gespeichert!');
            } else {
                console.error('Save failed:', data);
                alert('Fehler beim Speichern. Response: ' + JSON.stringify(data));
            }
        })
        .catch(error => {
            console.error('Error saving miner settings:', error);
            alert('Fehler beim Speichern: ' + error.message);
        });
    }
}

function setupEmergencyStop() {
    const emergencyBtn = document.getElementById('emergency-stop');
    
    if (emergencyBtn) {
        emergencyBtn.addEventListener('click', function() {
            if (confirm('ALARM: Alle Miner werden sofort heruntergefahren!\n\nFür den Not-Aus bestätigen.')) {
                console.log('EMERGENCY STOP - All miners are being shut down!');
                // TODO: Implement emergency stop API call
                alert('NOT-AUS aktiviert - alle Miner werden heruntergefahren');
            }
        });
    }
}

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    fetchAndRenderMiners();
    
    // Setup control elements
    setupAutoModeToggle();
    setupSystemScaleHandlers();
    setupEmergencyStop();
    setupMinerEditMode();
    
    // Add event listeners for buttons if they exist
    const apiButton = document.getElementById('api-button');
    if (apiButton) {
        apiButton.addEventListener('click', function() {
    fetchData(apiUrl);
        });
    }
});