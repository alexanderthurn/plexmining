function drawWeatherChart(rows) {
    var container = document.getElementById('weather-chart');
    if (!container) return;
    
    // Store data for resize events
    window.__latestWeatherDaily = rows;
    
    container.innerHTML = '';
    var width = container.clientWidth || container.offsetWidth || 600;
    var height = container.clientHeight || container.offsetHeight || 300;
    var margin = { top: 20, right: 40, bottom: 45, left: 60 };

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    
    var rawData = (rows || [])
        .filter(function(r){ 
            if (!r || !r.date || typeof r.pv_energy_kwh === 'undefined') return false;
            var rowDate = new Date(r.date);
            rowDate.setHours(0, 0, 0, 0);
            return rowDate.getTime() >= today.getTime();
        })
        .map(function(r){
            return {
                date: new Date(r.date),
                valuePV: Number(r.pv_energy_kwh),
                sunshine_hours: Number(r.sunshine_hours) || 0,
                shortwave_radiation_sum_Wh_m2: Number(r.shortwave_radiation_sum_Wh_m2) || 0
            };
        });

    if (rawData.length === 0) {
        return;
    }

    // Limit to 14 days ahead
    var data = rawData.slice(0, 15);

    if (data.length === 0) return;

    var svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;

    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // Use scaleTime for line chart with dates
    var x = d3.scaleTime()
        .domain(d3.extent(data, function(d){ return d.date; }))
        .range([0, innerWidth]);

    var y = d3.scaleLinear()
        .domain([0, d3.max(data, function(d){ return d.valuePV; }) || 1]).nice()
        .range([innerHeight, 0]);

    // Create tooltip
    var tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '10px')
        .style('border-radius', '5px')
        .style('font-size', '12px')
        .style('pointer-events', 'none');

    // Calculate ticks based on width: ~1 tick per 80 pixels
    var numTicks = Math.max(3, Math.floor(innerWidth / 80));
    
    // Axes
    g.append('g')
        .attr('transform', 'translate(0,' + innerHeight + ')')
        .call(d3.axisBottom(x)
            .tickFormat(d3.timeFormat('%d.%m.'))
            .ticks(numTicks));

    g.append('g')
        .call(d3.axisLeft(y).ticks(5));

    // Axis labels
    g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight + 35)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6c757d')
        .style('font-size', '12px')
        .text('Datum');

    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -innerHeight / 2)
        .attr('y', -35)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6c757d')
        .style('font-size', '12px')
        .text('PV-Ertrag (kWh)');

    // PV line chart - create line path
    var line = d3.line()
        .x(function(d){ return x(d.date); })
        .y(function(d){ return y(d.valuePV); })
        .curve(d3.curveLinear);

    g.append('path')
        .datum(data)
        .attr('class', 'pv-line')
        .attr('fill', 'none')
        .attr('stroke', '#ff8c00')
        .attr('stroke-width', 3)
        .attr('d', line);

    // Add circles at data points with tooltips
    g.selectAll('circle.pv-point')
        .data(data)
        .enter()
        .append('circle')
        .attr('class', 'pv-point')
        .attr('cx', function(d){ return x(d.date); })
        .attr('cy', function(d){ return y(d.valuePV); })
        .attr('r', 4)
        .attr('fill', '#ff8c00')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .on('mouseover', function(event, d) {
            tooltip.transition().duration(200).style('opacity', .9);
            tooltip.html(
                '<strong>' + d3.timeFormat('%d.%m.%Y')(d.date) + '</strong><br/>' +
                'Sonnenstunden: ' + formatNumberDE(d.sunshine_hours, 1) + ' h<br/>' +
                'Strahlung: ' + formatNumberDE(d.shortwave_radiation_sum_Wh_m2, 0) + ' Wh/m²<br/>' +
                'PV-Ertrag: ' + formatNumberDE(d.valuePV, 1) + ' kWh'
            )
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function(d) {
            tooltip.transition().duration(500).style('opacity', 0);
        });

    // Find min and max values for reference lines
    var minValue = d3.min(data, function(d){ return d.valuePV; });
    var maxValue = d3.max(data, function(d){ return d.valuePV; });
    
    // Find corresponding data points
    var minPoint = data.find(function(d){ return d.valuePV === minValue; });
    var maxPoint = data.find(function(d){ return d.valuePV === maxValue; });
    
    // Add horizontal reference lines at min and max values
    if (minPoint) {
        // Min reference line
        g.append('line')
            .attr('class', 'reference-line min-line')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', y(minValue))
            .attr('y2', y(minValue))
            .attr('stroke', '#dc3545')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .style('opacity', 0.7);
            
        // Min value label
        g.append('text')
            .attr('class', 'reference-label min-label')
            .attr('x', innerWidth - 10)
            .attr('y', y(minValue) - 5)
            .attr('text-anchor', 'end')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .style('fill', '#dc3545')
            .style('text-shadow', '1px 1px 2px rgba(255,255,255,0.8)')
            .text('Min: ' + formatNumberDE(minValue, 1) + ' kWh');
    }
    
    if (maxPoint) {
        // Max reference line
        g.append('line')
            .attr('class', 'reference-line max-line')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', y(maxValue))
            .attr('y2', y(maxValue))
            .attr('stroke', '#cc7000')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .style('opacity', 0.7);
            
        // Max value label
        g.append('text')
            .attr('class', 'reference-label max-label')
        .attr('x', innerWidth - 10)
        .attr('y', y(maxValue) - 5)
        .attr('text-anchor', 'end')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', '#cc7000')
        .style('text-shadow', '1px 1px 2px rgba(255,255,255,0.8)')
        .text('Max: ' + formatNumberDE(maxValue, 1) + ' kWh');
    }

    // Highlight today's date (clamp within domain)
    var todayMarkerDate = new Date();
    todayMarkerDate.setHours(0, 0, 0, 0);
    var domainStart = data[0].date;
    var domainEnd = data[data.length - 1].date;
    if (todayMarkerDate < domainStart) todayMarkerDate = new Date(domainStart);
    if (todayMarkerDate > domainEnd) todayMarkerDate = new Date(domainEnd);

    var todayX = x(todayMarkerDate);

    g.append('line')
        .attr('class', 'today-line')
        .attr('x1', todayX)
        .attr('x2', todayX)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', '#0d6efd')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,2')
        .style('opacity', 0.7)
        .style('pointer-events', 'none');

}

function drawHourlyWeatherChart(hourlyData) {
    var container = document.getElementById('weather-hourly-chart');
    if (!container) return;
    
    // Store data for resize events
    window.__latestWeatherHourly = hourlyData;
    
    container.innerHTML = '';
    var width = container.clientWidth || container.offsetWidth || 600;
    var height = container.clientHeight || container.offsetHeight || 300;
    var margin = { top: 20, right: 40, bottom: 45, left: 60 };

    var now = new Date();
    var startTime = new Date(now.getTime());
    startTime.setMinutes(0, 0, 0);
    var endTime = new Date(startTime.getTime() + 48 * 60 * 60 * 1000); // next 48 hours

    var data = (hourlyData || [])
        .filter(function(h){ 
            if (!h || !h.datetime || typeof h.pv_energy_kwh === 'undefined') return false;
            var dt = new Date(h.datetime);
            return dt >= startTime && dt <= endTime;
        })
        .map(function(h){
            return {
                datetime: new Date(h.datetime),
                valuePV: Number(h.pv_energy_kwh),
                sunshine_hours: Number(h.sunshine_duration) / 3600, // Convert seconds to hours
                global_tilted_irradiance: Number(h.global_tilted_irradiance) || 0,
                direct_radiation: Number(h.direct_radiation) || 0,
                cloudcover: Number(h.cloudcover) || 0
            };
        });

    if (data.length === 0) return;

    var svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;

    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // Use band scale for better spacing of bars
    var x = d3.scaleBand()
        .domain(data.map(function(d){ return d.datetime; }))
        .range([0, innerWidth])
        .padding(0.1);

    var y = d3.scaleLinear()
        .domain([0, d3.max(data, function(d){ return d.valuePV; }) || 1]).nice()
        .range([innerHeight, 0]);

    // Create tooltip
    var tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '10px')
        .style('border-radius', '5px')
        .style('font-size', '12px')
        .style('pointer-events', 'none');

    // Axes
    var dataCount = data.length;
    var tickFormat = d3.timeFormat('%H:%M');
    
    // Calculate how many ticks to show: ~1 tick per 60 pixels
    var maxTicks = Math.max(3, Math.floor(innerWidth / 60));
    
    // Get ticks at 0:00 and 12:00 hours
    var allPotentialTicks = data.filter(function(d) {
        var hour = d.datetime.getHours();
        return hour % 12 === 0;
    });
    
    // Select evenly spaced ticks
    var ticks = [];
    if (allPotentialTicks.length <= maxTicks) {
        ticks = allPotentialTicks.map(function(d){ return d.datetime; });
    } else {
        var step = Math.ceil(allPotentialTicks.length / maxTicks);
        for (var i = 0; i < allPotentialTicks.length; i += step) {
            ticks.push(allPotentialTicks[i].datetime);
        }
    }
    
    g.append('g')
        .attr('transform', 'translate(0,' + innerHeight + ')')
        .call(d3.axisBottom(x)
            .tickFormat(tickFormat)
            .tickValues(ticks)
            .tickSizeOuter(0))
        .selectAll('text')
        .style('text-anchor', 'middle')
        .attr('dx', '-0.75em')
        .attr('dy', '1em');

    g.append('g')
        .call(d3.axisLeft(y).ticks(5));

    // Axis labels
    g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight + 35)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6c757d')
        .style('font-size', '12px')
        .text('Zeit');

    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -innerHeight / 2)
        .attr('y', -35)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6c757d')
        .style('font-size', '12px')
        .text('PV-Ertrag (kWh)');

    // PV bars - use band width from scale
    var barWidth = x.bandwidth();

    g.selectAll('rect.pvbar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'pvbar')
        .attr('x', function(d){ return x(d.datetime); })
        .attr('y', function(d){ return y(d.valuePV); })
        .attr('width', barWidth)
        .attr('height', function(d){ return innerHeight - y(d.valuePV); })
        .attr('fill', '#ff8c00')
        .attr('opacity', 0.8)
        .on('mouseover', function(event, d) {
            tooltip.transition().duration(200).style('opacity', .9);
            tooltip.html(
                '<strong>' + d3.timeFormat('%H:%M')(d.datetime) + '</strong><br/>' +
                'Sonnenstunden: ' + formatNumberDE(d.sunshine_hours, 2) + ' h<br/>' +
                'Strahlung: ' + formatNumberDE(d.global_tilted_irradiance, 0) + ' W/m²<br/>' +
                'Direktstrahlung: ' + formatNumberDE(d.direct_radiation, 0) + ' Wh/m²<br/>' +
                'Bewölkung: ' + formatNumberDE(d.cloudcover, 0) + '%<br/>' +
                'PV-Ertrag: ' + formatNumberDE(d.valuePV, 2) + ' kWh'
            )
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function(d) {
            tooltip.transition().duration(500).style('opacity', 0);
        });

    // Find maximum value for reference line
    var maxValue = d3.max(data, function(d){ return d.valuePV; });
    
    if (maxValue > 0) {
        // Max reference line
        g.append('line')
            .attr('class', 'reference-line max-line')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', y(maxValue))
            .attr('y2', y(maxValue))
            .attr('stroke', '#cc7000')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');

        // Max reference label
        g.append('text')
            .attr('class', 'reference-label max-label')
            .attr('x', innerWidth - 5)
            .attr('y', y(maxValue) - 5)
            .attr('text-anchor', 'end')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .style('fill', '#cc7000')
            .style('text-shadow', '1px 1px 2px rgba(255,255,255,0.8)')
            .text('Max: ' + formatNumberDE(maxValue, 1) + ' kWh');
    }

    // Highlight current time (closest hour)
    var now = new Date();
    var currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    var closestHourData = data.reduce(function(prev, curr) {
        if (!prev) return curr;
        var prevDiff = Math.abs(prev.datetime - currentHour);
        var currDiff = Math.abs(curr.datetime - currentHour);
        return currDiff < prevDiff ? curr : prev;
    }, null);

    if (closestHourData) {
        var todayX = x(closestHourData.datetime) + barWidth / 2;
        g.append('line')
            .attr('class', 'today-line')
            .attr('x1', todayX)
            .attr('x2', todayX)
            .attr('y1', 0)
            .attr('y2', innerHeight)
            .style('pointer-events', 'none');
    }
}

function drawBatteryDonut(percent, kwh) {
    var container = document.getElementById('battery-donut');
    if (!container) return;
    container.innerHTML = '';
    var width = 150;
    var height = 150;
    var radius = Math.min(width, height) / 2 - 10;
    var innerRadius = radius * 0.6;

    var svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    var g = svg.append('g')
        .attr('transform', 'translate(' + width/2 + ',' + height/2 + ')');

    var arc = d3.arc()
        .innerRadius(innerRadius)
        .outerRadius(radius);

    var pie = d3.pie()
        .value(function(d) { return d.value; })
        .sort(null);

    var data = [
        { value: percent, color: '#0d6efd' },
        { value: 100 - percent, color: '#e9ecef' }
    ];

    var arcs = g.selectAll('.arc')
        .data(pie(data))
        .enter()
        .append('g')
        .attr('class', 'arc');

    arcs.append('path')
        .attr('d', arc)
        .attr('fill', function(d) { return d.data.color; });

    // Add percentage text in center
    g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '24px')
        .style('font-weight', 'bold')
        .style('fill', '#0d6efd')
        .text(percent + '%');
}

function drawSolarPanel(powerPercent) {
    var container = document.getElementById('solar-panel');
    if (!container) return;
    container.innerHTML = '';
    var width = 150;
    var height = 120;

    var svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    var g = svg.append('g')
        .attr('transform', 'translate(' + width/2 + ',' + height/2 + ')');

    // Minimalist panel background
    var panelWidth = 120;
    var panelHeight = 70;
    var cellsX = 6;
    var cellsY = 4;
    var totalCells = cellsX * cellsY;
    var activeCells = Math.max(0, Math.min(totalCells, Math.round(totalCells * (powerPercent / 100))));
    
    g.append('rect')
        .attr('x', -panelWidth/2)
        .attr('y', -panelHeight/2)
        .attr('width', panelWidth)
        .attr('height', panelHeight)
        .attr('rx', 8)
        .attr('fill', '#1f2a37');

    var cellWidth = 18;
    var cellHeight = 14;
    var gapX = (panelWidth - cellsX * cellWidth) / (cellsX + 1);
    var gapY = (panelHeight - cellsY * cellHeight) / (cellsY + 1);
    
    var activeColor = '#ff8c00';
    var inactiveColor = '#1f2933';

    var cellIndex = 0;
    for (var j = 0; j < cellsY; j++) {
        for (var i = 0; i < cellsX; i++) {
            var x = -panelWidth/2 + gapX + i * (cellWidth + gapX);
            var y = -panelHeight/2 + gapY + j * (cellHeight + gapY);

            g.append('rect')
                .attr('x', x)
                .attr('y', y)
                .attr('width', cellWidth)
                .attr('height', cellHeight)
                .attr('rx', 3)
                .attr('fill', cellIndex < activeCells ? activeColor : inactiveColor);

            cellIndex++;
        }
    }
}

// Store latest data for redrawing on resize
var __latestForecastData = null;

// Dynamischer Default abhängig von der Bildschirmbreite
function getDefaultForecastHours() {
    var width = window.innerWidth || document.documentElement.clientWidth;
    if (width < 768) {
        return 12; // Mobile: 12 Stunden
    } else if (width < 1200) {
        return 48; // Tablet: 48 Stunden
    } else {
        return 168; // Desktop: 7 Tage
    }
}

var __forecastTimerangeHours = getDefaultForecastHours();

function drawHourlyForecastChart(forecast, pv, miners) {
    var container = document.getElementById('hourly-forecast-chart');
    if (!container || !forecast || !Array.isArray(forecast.forecast) || forecast.forecast.length === 0) {
        if (container) container.innerHTML = '<div class="text-muted">Keine Prognosedaten verfügbar.</div>';
        return;
    }

    // FILTER: Zeitraum basierend auf Auswahl
    var now = new Date();
    var endTime = new Date(now.getTime() + __forecastTimerangeHours * 60 * 60 * 1000);
    
    var filteredForecast = forecast.forecast.filter(function(d) {
        var timestamp = new Date(d.datetime);
        return timestamp >= now && timestamp <= endTime;
    });
    
    // Verwende gefilterte Daten
    var workingForecast = { forecast: filteredForecast };
    
    // Store ORIGINAL data for resize events and timerange changes
    __latestForecastData = { forecast: forecast, pv: pv, miners: miners };

    container.innerHTML = '';
    
    // Calculate average hashrate over the entire period
    var totalHashrate = 0;
    var count = 0;
    workingForecast.forecast.forEach(function(d) {
        if (d.total_hashrate_th !== undefined) {
            totalHashrate += d.total_hashrate_th;
            count++;
        }
    });
    var avgHashrate = count > 0 ? (totalHashrate / count) : 0;
    
    // Update the title with average hashrate
    var avgHashrateEl = document.getElementById('mining-forecast-avg-hashrate');
    if (avgHashrateEl) {
        avgHashrateEl.textContent = '(Ø ' + avgHashrate.toFixed(1) + ' TH/s)';
    }
    
    // Create a lookup map for miner info by ID
    var minerMap = {};
    if (miners && Array.isArray(miners)) {
        miners.forEach(function(miner) {
            if (miner.id) {
                minerMap[miner.id] = {
                    model: miner.model || 'Unknown',
                    id: miner.id,
                    levels: miner.levels || []
                };
            }
        });
    }

    var width = container.clientWidth || container.offsetWidth || 800;
    var height = 350;
    var margin = { top: 20, right: 40, bottom: 50, left: 70 };
    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;

    var svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var timestamps = workingForecast.forecast.map(function(d) {
        return new Date(d.datetime);
    });

    var x = d3.scaleTime()
        .domain([timestamps[0], timestamps[timestamps.length - 1]])
        .range([0, innerWidth]);

    var batteryCapacity = (pv && pv.battery_capacity_kwh) ? Number(pv.battery_capacity_kwh) : 0;
    var maxValue = d3.max([
        d3.max(workingForecast.forecast, function(d) { return d.battery_level_kwh; }) || 0,
        batteryCapacity
    ]);

    var y = d3.scaleLinear()
        .domain([0, maxValue]).nice()
        .range([innerHeight, 0]);

    // Create second Y axis for PV energy (right side)
    var maxPvEnergy = d3.max(workingForecast.forecast, function(d) {
        return (d.pv_forecast_horizons && d.pv_forecast_horizons[1]) ? d.pv_forecast_horizons[1] : 0;
    }) || 1;
    var yPv = d3.scaleLinear()
        .domain([0, maxPvEnergy]).nice()
        .range([innerHeight, 0]);

    // Create third Y axis for hashrate (TH/s) - for bar scaling only, not displayed
    var maxHashrate = d3.max(workingForecast.forecast, function(d) { return d.total_hashrate_th || 0; }) || 1;
    var yHashrate = d3.scaleLinear()
        .domain([0, maxHashrate]).nice()
        .range([innerHeight, 0]);
    
    // Function to get miner color from miner configuration
    function getMinerColor(minerId) {
        if (!miners || !Array.isArray(miners)) return '#999';
        var miner = miners.find(function(m) { return m.id === minerId; });
        if (!miner) return '#999';
        return miner.color || '#999';
    }

    // Calculate how many ticks to show based on width (simple multiplier)
    // ~1 tick per 80-100 pixels of width
    var maxTicks = Math.max(3, Math.floor(innerWidth / 80));
    
    // Get all potential tick times (0:00 and 12:00)
    var allTickTimes = timestamps.filter(function(ts) {
        var hour = ts.getHours();
        return hour === 0 || hour === 12;
    });
    
    // Select evenly spaced ticks based on maxTicks
    var tickTimes = [];
    if (allTickTimes.length <= maxTicks) {
        tickTimes = allTickTimes;
    } else {
        var step = Math.ceil(allTickTimes.length / maxTicks);
        for (var i = 0; i < allTickTimes.length; i += step) {
            tickTimes.push(allTickTimes[i]);
        }
    }
    
    // Ensure we always have at least start and end
    if (tickTimes.length === 0) {
        tickTimes = [timestamps[0], timestamps[timestamps.length - 1]];
    }

    // Add alternating day backgrounds (gray/white)
    var dayStarts = timestamps.filter(function(ts) {
        return ts.getHours() === 0;
    });
    
    dayStarts.forEach(function(dayStart, index) {
        if (index % 2 === 0) return; // Skip even days (keep white)
        
        var dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        var x1 = x(dayStart);
        var x2 = x(dayEnd);
        
        g.append('rect')
            .attr('x', x1)
            .attr('y', 0)
            .attr('width', x2 - x1)
            .attr('height', innerHeight)
            .attr('fill', '#f8f9fa')
            .attr('opacity', 0.5)
            .style('pointer-events', 'none');
    });

    // Add vertical lines at 0:00 for each day
    dayStarts.forEach(function(dayStart) {
        var xPos = x(dayStart);
        
        g.append('line')
            .attr('x1', xPos)
            .attr('x2', xPos)
            .attr('y1', 0)
            .attr('y2', innerHeight)
            .attr('stroke', '#dee2e6')
            .attr('stroke-width', 1)
            .style('pointer-events', 'none');
    });

    g.append('g')
        .attr('transform', 'translate(0,' + innerHeight + ')')
        .call(d3.axisBottom(x)
            .tickValues(tickTimes)
            .tickFormat(function(d) {
                var hour = d.getHours();
                // Show date for 0:00, only time for 12:00
                if (hour === 0) {
                    return d3.timeFormat('%d.%m.')(d);
                } else {
                    return d3.timeFormat('%H:%M')(d);
                }
            }))
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-0.5em')
        .attr('dy', '0.5em')
        .attr('transform', 'rotate(-45)');

    g.append('g')
        .call(d3.axisLeft(y).ticks(6));

    // Right Y axis for PV energy
    g.append('g')
        .attr('transform', 'translate(' + innerWidth + ',0)')
        .call(d3.axisRight(yPv).ticks(6));

    g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight + 40)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6c757d')
        .style('font-size', '12px')
        .text('Datum');

    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -innerHeight / 2)
        .attr('y', -45)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6c757d')
        .style('font-size', '12px')
        .text('Speicher (kWh)');

    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -innerHeight / 2)
        .attr('y', innerWidth + 35)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ff8c00')
        .style('font-size', '12px')
        .text('PV-1h (kWh)');

    // Create tooltip
    var tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '10px')
        .style('border-radius', '5px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('z-index', '1000');

    // Draw stacked miner bars
    var barWidth = Math.max(2, (innerWidth / timestamps.length) * 0.8);
    
    workingForecast.forecast.forEach(function(d, idx) {
        if (!d.running_miners || d.running_miners.length === 0) return;
        
        var xPos = x(timestamps[idx]) - barWidth / 2;
        var yOffset = innerHeight;
        
        // Calculate total hashrate for this hour to scale bars
        var totalHashrate = d.total_hashrate_th || 0;
        if (totalHashrate === 0) return;
        
        // Draw each miner's contribution as a stacked bar segment
        d.running_miners.forEach(function(miner) {
            var minerHashrate = miner.hashrate_th || 0;
            var barHeight = (minerHashrate / totalHashrate) * (innerHeight - yHashrate(totalHashrate));
            
            g.append('rect')
                .attr('x', xPos)
                .attr('y', yOffset - barHeight)
                .attr('width', barWidth)
                .attr('height', barHeight)
                .attr('fill', getMinerColor(miner.miner_id))
                .attr('opacity', 0.7)
                .style('pointer-events', 'none');
            
            yOffset -= barHeight;
        });
    });

    // Draw battery level line
    var line = d3.line()
        .x(function(d, idx) { return x(timestamps[idx]); })
        .y(function(d) { return y(d.battery_level_kwh); })
        .curve(d3.curveMonotoneX);

    g.append('path')
        .datum(workingForecast.forecast)
        .attr('class', 'forecast-cumulative-line')
        .attr('fill', 'none')
        .attr('stroke', '#0d6efd')
        .attr('stroke-width', 2)
        .attr('d', line);

    // Draw PV energy forecast line (1h horizon)
    var pvLine = d3.line()
        .x(function(d, idx) { return x(timestamps[idx]); })
        .y(function(d) { 
            var pvValue = (d.pv_forecast_horizons && d.pv_forecast_horizons[1]) ? d.pv_forecast_horizons[1] : 0;
            return yPv(pvValue);
        })
        .curve(d3.curveMonotoneX);

    g.append('path')
        .datum(workingForecast.forecast)
        .attr('class', 'forecast-pv-line')
        .attr('fill', 'none')
        .attr('stroke', '#ff8c00')
        .attr('stroke-width', 2)
        .attr('d', pvLine);

    // Add invisible rectangles for easier hover interaction across full width of each time slot
    var slotWidth = timestamps.length > 1 ? x(timestamps[1]) - x(timestamps[0]) : 10;
    
    g.selectAll('.forecast-hover-area')
        .data(workingForecast.forecast)
        .enter()
        .append('rect')
        .attr('class', 'forecast-hover-area')
        .attr('x', function(d, idx) { return x(timestamps[idx]) - slotWidth / 2; })
        .attr('y', 0)
        .attr('width', slotWidth)
        .attr('height', innerHeight)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            var dateStr = d3.timeFormat('%d.%m.%Y %H:%M')(new Date(d.datetime));
            
            d3.select(this)
                .attr('fill', 'rgba(13, 110, 253, 0.1)');
            
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            
            // Build tooltip HTML
            var tooltipHtml = '<strong>' + dateStr + '</strong><br/>';
            
            // Battery levels (start and end)
            if (d.battery_level_kwh_start !== undefined && d.battery_level_kwh_end !== undefined) {
                tooltipHtml += 'Speicher (Start): <strong>' + d.battery_level_kwh_start.toFixed(2) + ' kWh</strong><br/>';
                tooltipHtml += 'Speicher (Ende): <strong>' + d.battery_level_kwh_end.toFixed(2) + ' kWh</strong><br/>';
            } else {
                tooltipHtml += 'Speicher: <strong>' + d.battery_level_kwh.toFixed(2) + ' kWh</strong><br/>';
            }
            
            // PV forecast 1h (prominently displayed)
            if (d.pv_forecast_horizons && d.pv_forecast_horizons[1] !== undefined) {
                tooltipHtml += 'PV-Ertrag (1h): <strong style="color:#ff8c00;">' + d.pv_forecast_horizons[1].toFixed(2) + ' kWh</strong><br/>';
            }
            
            // House base load
            if (d.house_base_load !== undefined) {
                tooltipHtml += 'Haus-Grundlast: ' + d.house_base_load.toFixed(1) + ' kW<br/>';
            }
            
            // Add PV forecast horizons
            if (d.pv_forecast_horizons && Object.keys(d.pv_forecast_horizons).length > 0) {
                tooltipHtml += '<br/><strong>PV-Prognose:</strong><br/>';
                var horizonKeys = Object.keys(d.pv_forecast_horizons).sort(function(a, b) { return parseInt(a) - parseInt(b); });
                horizonKeys.forEach(function(hours) {
                    var pvValue = d.pv_forecast_horizons[hours];
                    tooltipHtml += '• ' + hours + 'h: ' + pvValue.toFixed(2) + ' kWh<br/>';
                });
            }
            
            // Add running miners info
            if (d.running_miners && d.running_miners.length > 0) {
                tooltipHtml += '<br/><strong>Aktive Miner:</strong><br/>';
                d.running_miners.forEach(function(miner) {
                    var minerInfo = minerMap[miner.miner_id];
                    var minerLabel = minerInfo ? (minerInfo.model + ' #' + minerInfo.id) : ('Miner ' + miner.miner_id);
                    
                    // Get level label from miner levels array
                    var levelLabel = 'Level ' + miner.level_index;
                    if (minerInfo && minerInfo.levels && minerInfo.levels[miner.level_index]) {
                        var level = minerInfo.levels[miner.level_index];
                        if (level.label) {
                            levelLabel = level.label;
                        }
                    }
                    
                    var powerLabel = miner.power_kw.toFixed(2) + ' kW';
                    var hashrateLabel = miner.hashrate_th ? miner.hashrate_th.toFixed(1) + ' TH/s' : '';
                    tooltipHtml += '• ' + minerLabel + ' - ' + levelLabel + ' (' + powerLabel;
                    if (hashrateLabel) {
                        tooltipHtml += ', ' + hashrateLabel;
                    }
                    tooltipHtml += ')<br/>';
                });
                
                // Add totals
                if (d.total_power_kw !== undefined || d.total_hashrate_th !== undefined) {
                    tooltipHtml += '<br/><strong>Gesamt:</strong> ';
                    if (d.total_power_kw !== undefined) {
                        tooltipHtml += d.total_power_kw.toFixed(2) + ' kW';
                    }
                    if (d.total_hashrate_th !== undefined) {
                        if (d.total_power_kw !== undefined) tooltipHtml += ', ';
                        tooltipHtml += d.total_hashrate_th.toFixed(1) + ' TH/s';
                    }
                    tooltipHtml += '<br/>';
                }
            } else {
                tooltipHtml += '<br/><em style="color: #999;">Keine Miner aktiv</em>';
            }
            
            tooltip.html(tooltipHtml)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this)
                .attr('fill', 'transparent');
            
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });

    var todayLine = new Date();
    todayLine.setMinutes(0, 0, 0);
    if (todayLine >= timestamps[0] && todayLine <= timestamps[timestamps.length - 1]) {
        var todayX = x(todayLine);
        g.append('line')
            .attr('class', 'today-line')
            .attr('x1', todayX)
            .attr('x2', todayX)
            .attr('y1', 0)
            .attr('y2', innerHeight)
            .style('pointer-events', 'none');

    }
}

// Resize handler with debouncing to redraw charts on window resize
var __resizeTimeout = null;
var __resizeHandlerInitialized = false;

function initChartResizeHandler() {
    if (__resizeHandlerInitialized) return;
    __resizeHandlerInitialized = true;
    
    window.addEventListener('resize', function() {
        clearTimeout(__resizeTimeout);
        __resizeTimeout = setTimeout(function() {
            // Redraw hourly forecast chart if data is available
            if (__latestForecastData) {
                drawHourlyForecastChart(
                    __latestForecastData.forecast, 
                    __latestForecastData.pv, 
                    __latestForecastData.miners
                );
            }
            
            // Redraw weather charts if data is available
            if (window.__latestWeatherDaily) {
                drawWeatherChart(window.__latestWeatherDaily);
            }
            
            if (window.__latestWeatherHourly) {
                drawHourlyWeatherChart(window.__latestWeatherHourly);
            }
        }, 250); // Wait 250ms after last resize event
    });
}

// Initialize resize handler when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChartResizeHandler);
} else {
    initChartResizeHandler();
}

// Setup forecast timerange selector
function initForecastTimerangeSelector() {
    var select = document.getElementById('forecast-timerange-select');
    if (!select) return;
    
    // Set initial value from variable
    select.value = __forecastTimerangeHours;
    
    // Add change event listener
    select.addEventListener('change', function() {
        var hours = parseInt(this.value, 10);
        if (isNaN(hours) || hours <= 0) return;
        
        // Update global variable
        __forecastTimerangeHours = hours;
        
        // Redraw chart with new timerange if data is available
        if (__latestForecastData) {
            drawHourlyForecastChart(
                __latestForecastData.forecast, 
                __latestForecastData.pv, 
                __latestForecastData.miners
            );
        }
    });
}

// Initialize timerange selector when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initForecastTimerangeSelector);
} else {
    initForecastTimerangeSelector();
}
