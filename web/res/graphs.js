function drawWeatherChart(rows) {
    var container = document.getElementById('weather-chart');
    if (!container) return;
    container.innerHTML = '';
    var width = Math.max(container.clientWidth || 600, 300);
    var height = container.clientHeight || 260;
    var margin = { top: 20, right: 40, bottom: 45, left: 60 };

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    
    var data = (rows || [])
        .filter(function(r){ 
            if (!r || !r.date || typeof r.pv_energy_kwh === 'undefined') return false;
            var rowDate = new Date(r.date);
            rowDate.setHours(0, 0, 0, 0);
            // Show today and next 14 days
            var daysDiff = Math.floor((rowDate - today) / (1000 * 60 * 60 * 24));
            return daysDiff >= 0 && daysDiff <= 14;
        })
        .map(function(r){
            return {
                date: new Date(r.date),
                valuePV: Number(r.pv_energy_kwh),
                sunshine_hours: Number(r.sunshine_hours) || 0,
                shortwave_radiation_sum_Wh_m2: Number(r.shortwave_radiation_sum_Wh_m2) || 0
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

    // Axes
    g.append('g')
        .attr('transform', 'translate(0,' + innerHeight + ')')
        .call(d3.axisBottom(x)
            .tickFormat(d3.timeFormat('%d.%m.'))
            .ticks(6));

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
        .attr('stroke', '#28a745')
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
        .attr('fill', '#28a745')
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
            .attr('stroke', '#198754')
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
            .style('fill', '#198754')
            .style('text-shadow', '1px 1px 2px rgba(255,255,255,0.8)')
            .text('Max: ' + formatNumberDE(maxValue, 1) + ' kWh');
    }
}

function drawHourlyWeatherChart(hourlyData) {
    var container = document.getElementById('weather-hourly-chart');
    if (!container) return;
    container.innerHTML = '';
    var width = Math.max(container.clientWidth || 800, 400);
    var height = container.clientHeight || 300;
    var margin = { top: 20, right: 40, bottom: 45, left: 60 };

    var data = (hourlyData || [])
        .filter(function(h){ return h && h.datetime && typeof h.pv_energy_kwh !== 'undefined'; })
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
    var tickFormat = dataCount > 24 ? d3.timeFormat('%d.%m. %H:%M') : d3.timeFormat('%H:%M');
    var ticks = dataCount > 48 
        ? data
            .filter(function(d, i) { return i % Math.max(1, Math.floor(dataCount / 4)) === 0; })
            .map(function(d){ return d.datetime; })
        : (dataCount > 24 
            ? data
                .filter(function(d, i) { return i % Math.max(1, Math.floor(dataCount / 8)) === 0; })
                .map(function(d){ return d.datetime; })
            : data.map(function(d){ return d.datetime; }));
    
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
        .attr('fill', '#28a745')
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
            .attr('stroke', '#198754')
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
            .style('fill', '#198754')
            .style('text-shadow', '1px 1px 2px rgba(255,255,255,0.8)')
            .text('Max: ' + formatNumberDE(maxValue, 1) + ' kWh');
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
        { value: percent, color: '#28a745' },
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
        .style('fill', '#28a745')
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
    
    var activeColor = '#4ade80';
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
