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
    
    (miners || []).forEach(miner => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${miner.id}</td>
            <td>${miner.model}</td>
            <td><span class="badge ${getStatusBadgeClass(miner.status)}">${miner.status}</span></td>
            <td>${formatMaybeNumberDE(miner.hashrate, 0)}</td>
            <td>${formatMaybeNumberDE(miner.power, 0)}</td>
            <td>${typeof miner.temperature === 'number' ? formatNumberDE(miner.temperature, 0) : (miner.temperature || '')}</td>
            <td>${formatMaybeNumberDE(miner.btcPerKwh, 5)}</td>
            <td>${formatMaybeNumberDE(miner.euroPerKwh, 2)}</td>
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
            }

            if (data && Array.isArray(data.miners)) {
                populateMinerTable(data.miners);
                renderMinerCounts(data.miners);
            } else if (Array.isArray(data)) {
                // Backward compat: if endpoint returns array directly
                populateMinerTable(data);
                renderMinerCounts(data);
            } else {
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
                setRelativeTimestamp('ts-system', data.mtimes.settings);
                setRelativeTimestamp('ts-economy', data.mtimes.pv);
                setRelativeTimestamp('ts-forecast', data.mtimes.weather_daily);
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
        var pvPower = typeof pv.pv_leistung_w !== 'undefined' ? pv.pv_leistung_w : 0;
        var pvKwp = window.__plexSettings && window.__plexSettings.pv_kwp !== 'undefined' ? window.__plexSettings.pv_kwp : 120;
        var pvMaxPowerW = pvKwp * 1000; // Convert kWp to watts  
        var pvPowerPercent = pvMaxPowerW > 0 ? (pvPower / pvMaxPowerW * 100) : 0;
        
        setText('pv-leistung', pv.calculated.formatted_pv_power + ' W (' + Math.round(pvPowerPercent * 10) / 10 + '%)');
        setText('pv-kwp', pvKwp);
        setText('batterie-kwh', pv.calculated.formatted_battery_capacity);
        setText('batterie-current', pv.calculated.formatted_battery_kwh);
        setText('mining-min-battery', pv.calculated.formatted_mining_min_battery);
        
        // Mining status
        var miningStatusEl = document.getElementById('mining-status');
        if (miningStatusEl) {
            miningStatusEl.textContent = pv.calculated.miningStatusText;
            miningStatusEl.className = 'fw-bold ' + pv.calculated.miningStatusClass;
        }
        
        // Power values
        setText('haus-last', pv.calculated.formatted_haus_last);
        setText('available-power', pv.calculated.formatted_available_power);
        
        // Draw charts using original values (not formatted)
        var batteryKwh = pv.batterie_stand && typeof pv.batterie_stand.kwh !== 'undefined' ? pv.batterie_stand.kwh : 0;
        var batteryPercent = pv.batterie_stand && typeof pv.batterie_stand.percent !== 'undefined' ? pv.batterie_stand.percent : 0;
        var pvPower = typeof pv.pv_leistung_w !== 'undefined' ? pv.pv_leistung_w : 0;
        
        try {
            if (typeof d3 !== 'undefined') {
                if (typeof drawBatteryDonut === 'function') {
                    drawBatteryDonut(batteryPercent, batteryKwh);
                }
                if (typeof drawSolarPanel === 'function') {
                    drawSolarPanel(pvPower);
                }
            }
        } catch (e) { /* no-op */ }
    } else {
        // Fallback: Original logic if no server calculations available
        function formatNumberDE(value, decimals) {
            return typeof value === 'number' ? value.toFixed(decimals).replace('.', ',') : value;
        }
        
        var pvPower = typeof pv.pv_leistung_w !== 'undefined' ? pv.pv_leistung_w : 0;
        var pvKwp = window.__plexSettings && window.__plexSettings.pv_kwp !== 'undefined' ? window.__plexSettings.pv_kwp : 120;
        var pvMaxPowerW = pvKwp * 1000; // Convert kWp to watts  
        var pvPowerPercent = pvMaxPowerW > 0 ? (pvPower / pvMaxPowerW * 100) : 0;
        
        setText('pv-leistung', formatNumberDE(pvPower, 0) + ' W (' + Math.round(pvPowerPercent * 10) / 10 + '%)');
        setText('pv-kwp', pvKwp);
        
        var batteryKwh = pv.batterie_stand && typeof pv.batterie_stand.kwh !== 'undefined' ? pv.batterie_stand.kwh : 0;
        var batteryPercent = pv.batterie_stand && typeof pv.batterie_stand.percent !== 'undefined' ? pv.batterie_stand.percent : 0;
        var batteryCapacity = pv.batterie_stand && typeof pv.batterie_stand.capacity_kwh !== 'undefined' ? pv.batterie_stand.capacity_kwh : 49.9;
        setText('batterie-kwh', formatNumberDE(batteryCapacity, 1));
        setText('batterie-current', formatNumberDE(batteryKwh, 1));
        
        var miningMinBattery = (window.__plexSettings && typeof window.__plexSettings.miningMinBatteryKwh !== 'undefined') ? window.__plexSettings.miningMinBatteryKwh : 15.0;
        setText('mining-min-battery', formatNumberDE(miningMinBattery, 1));
        
        var miningPossible = batteryKwh >= miningMinBattery;
        var hausLast = typeof pv.haus_last_w !== 'undefined' ? pv.haus_last_w : 0;
        var availablePower = pvPower - hausLast;
        
        var miningStatusText = miningPossible ? formatNumberDE(batteryKwh - miningMinBattery, 1) + ' kWh' : 'nix';
        var miningStatusClass = miningPossible ? 'text-success' : 'text-danger';
        var miningStatusEl = document.getElementById('mining-status');
        if (miningStatusEl) {
            miningStatusEl.textContent = miningStatusText;
            miningStatusEl.className = 'fw-bold ' + miningStatusClass;
        }
        
        setText('haus-last', formatNumberDE(hausLast, 0));
        setText('available-power', formatNumberDE(availablePower, 0));
        
        try {
            if (typeof d3 !== 'undefined') {
                if (typeof drawBatteryDonut === 'function') {
                    drawBatteryDonut(batteryPercent, batteryKwh);
                }
                if (typeof drawSolarPanel === 'function') {
                    drawSolarPanel(pvPower);
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
    
    // Filter to next 24 hours
    var now = new Date();
    var next24Hours = hourlyData.filter(function(hour) {
        var hourTime = new Date(hour.datetime);
        var diffHours = (hourTime - now) / (1000 * 60 * 60);
        return diffHours >= 0 && diffHours <= 24;
    }).slice(0, 24);
    
    if (next24Hours.length === 0) return;
    
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
        next24Hours.forEach(function(hour) {
            var tr = document.createElement('tr');
            var time = new Date(hour.datetime);
            var timeStr = time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
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
            drawHourlyWeatherChart(next24Hours);
        }
    } catch (e) { /* no-op */ }
}

function renderMinerCounts(miners) {
    if (!Array.isArray(miners)) return;
    var total = miners.length;
    var active = miners.filter(function(m) { return m.status === 'Running'; }).length;
    setText('miner-anzahl', active + ' / ' + total);
}

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    fetchAndRenderMiners();
    
    // Add event listeners for buttons if they exist
    const apiButton = document.getElementById('api-button');
    if (apiButton) {
        apiButton.addEventListener('click', function() {
    fetchData(apiUrl);
        });
    }
});