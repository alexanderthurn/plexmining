function drawWeatherChart(rows) {
    var container = document.getElementById('weather-chart');
    if (!container) return;
    container.innerHTML = '';
    var width = Math.max(container.clientWidth || 600, 300);
    var height = container.clientHeight || 260;
    var margin = { top: 10, right: 55, bottom: 45, left: 50 };

    var data = (rows || [])
        .filter(function(r){ return r && r.date && (typeof r.sunshine_hours !== 'undefined' || typeof r.shortwave_radiation_sum_Wh_m2 !== 'undefined'); })
        .map(function(r){
            return {
                date: new Date(r.date),
                valueHours: (typeof r.sunshine_hours !== 'undefined') ? Number(r.sunshine_hours) : null,
                valueRad: (typeof r.shortwave_radiation_sum_Wh_m2 !== 'undefined') ? Number(r.shortwave_radiation_sum_Wh_m2) : null,
                valuePV: null
            };
        });

    // PV energy is now calculated server-side in data.php
    // Map pv_energy_kwh from weather data to chart data
    data.forEach(function(d, i){
        if (rows[i] && typeof rows[i].pv_energy_kwh === 'number') {
            d.valuePV = rows[i].pv_energy_kwh;
        }
    });

    if (data.length === 0) return;

    var svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;

    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var x = d3.scaleUtc()
        .domain(d3.extent(data, function(d){ return d.date; }))
        .range([0, innerWidth]);

    var y = d3.scaleLinear()
        .domain([0, d3.max(data, function(d){ return d.valueHours; }) || 1]).nice()
        .range([innerHeight, 0]);

    var y2 = d3.scaleLinear()
        .domain([0, d3.max(data, function(d){ return Math.max(d.valueRad || 0, d.valuePV || 0); }) || 1]).nice()
        .range([innerHeight, 0]);

    var lineHours = d3.line()
        .x(function(d){ return x(d.date); })
        .y(function(d){ return y(d.valueHours); })
        .curve(d3.curveMonotoneX);

    var lineRad = d3.line()
        .x(function(d){ return x(d.date); })
        .y(function(d){ return y2(d.valueRad); })
        .curve(d3.curveMonotoneX);

    // PV will be rendered as bars (no line)

    // Axes
    g.append('g')
        .attr('transform', 'translate(0,' + innerHeight + ')')
        .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%d.%m.')));

    g.append('g')
        .call(d3.axisLeft(y).ticks(5));

    g.append('g')
        .attr('transform', 'translate(' + innerWidth + ',0)')
        .call(d3.axisRight(y2).ticks(5));

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
        .text('Sonnenstunden (h)');

    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -innerHeight / 2)
        .attr('y', innerWidth + 45)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6c757d')
        .style('font-size', '12px')
        .text('Strahlung (Wh/m²) / PV (kWh)');

    // Line path
    g.append('path')
        .datum(data.filter(function(d){ return d.valueHours != null; }))
        .attr('fill', 'none')
        .attr('stroke', '#0d6efd')
        .attr('stroke-width', 2)
        .attr('d', lineHours);

    g.append('path')
        .datum(data.filter(function(d){ return d.valueRad != null; }))
        .attr('fill', 'none')
        .attr('stroke', '#fd7e14')
        .attr('stroke-width', 2)
        .attr('d', lineRad);

    // PV bars (show if any PV data exists)
    var hasPVData = data.some(function(d){ return d.valuePV != null; });
    if (hasPVData) {
        var pvData = data.filter(function(d){ return d.valuePV != null; });
        if (pvData.length > 0) {
            var barWidth;
            if (pvData.length > 1) {
                var dx = Math.abs(x(pvData[1].date) - x(pvData[0].date));
                barWidth = Math.max(4, Math.min(24, dx * 0.6));
            } else {
                barWidth = Math.max(6, innerWidth * 0.6);
            }
            g.selectAll('rect.pvbar')
                .data(pvData)
                .enter()
                .append('rect')
                .attr('class', 'pvbar')
                .attr('x', function(d){ return x(d.date) - barWidth/2; })
                .attr('y', function(d){ return y2(d.valuePV); })
                .attr('width', barWidth)
                .attr('height', function(d){ return innerHeight - y2(d.valuePV); })
                .attr('fill', '#198754')
                .attr('opacity', 0.6);
        }
    }

    // Points
    g.selectAll('circle.hour')
        .data(data.filter(function(d){ return d.valueHours != null; }))
        .enter()
        .append('circle')
        .attr('class', 'hour')
        .attr('cx', function(d){ return x(d.date); })
        .attr('cy', function(d){ return y(d.valueHours); })
        .attr('r', 3)
        .attr('fill', '#0d6efd');

    g.selectAll('rect.rad')
        .data(data.filter(function(d){ return d.valueRad != null; }))
        .enter()
        .append('rect')
        .attr('class', 'rad')
        .attr('x', function(d){ return x(d.date) - 2; })
        .attr('y', function(d){ return y2(d.valueRad) - 2; })
        .attr('width', 4)
        .attr('height', 4)
        .attr('fill', '#fd7e14');

    // Simple legend
    var legend = g.append('g').attr('transform', 'translate(0,0)');
    legend.append('line')
        .attr('x1', 0).attr('y1', -2)
        .attr('x2', 16).attr('y2', -2)
        .attr('stroke', '#0d6efd').attr('stroke-width', 2);
    legend.append('text')
        .attr('x', 20).attr('y', 2)
        .attr('fill', '#6c757d').style('font-size', '12px')
        .text('Sonnenstunden');
    legend.append('line')
        .attr('x1', 120).attr('y1', -2)
        .attr('x2', 136).attr('y2', -2)
        .attr('stroke', '#fd7e14').attr('stroke-width', 2);
    legend.append('text')
        .attr('x', 140).attr('y', 2)
        .attr('fill', '#6c757d').style('font-size', '12px')
        .text('Strahlung');

    if (hasPVData) {
        legend.append('rect')
            .attr('x', 210).attr('y', -8)
            .attr('width', 12).attr('height', 8)
            .attr('fill', '#198754').attr('opacity', 0.6);
        legend.append('text')
            .attr('x', 230).attr('y', 2)
            .attr('fill', '#6c757d').style('font-size', '12px')
            .text('PV (kWh)');
    }
}

function drawBatteryDonut(percent, kwh) {
    var container = document.getElementById('battery-donut');
    if (!container) return;
    container.innerHTML = '';
    
    var width = 150;
    var height = 150;
    var radius = Math.min(width, height) / 2 - 10;
    
    var svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    var g = svg.append('g')
        .attr('transform', 'translate(' + width/2 + ',' + height/2 + ')');
    
    // Background circle
    g.append('circle')
        .attr('r', radius)
        .attr('fill', '#f8f9fa')
        .attr('stroke', '#dee2e6')
        .attr('stroke-width', 2);
    
    // Progress arc
    var arc = d3.arc()
        .innerRadius(radius - 15)
        .outerRadius(radius)
        .startAngle(0);
    
    var progressArc = g.append('path')
        .datum({endAngle: 2 * Math.PI * (percent / 100)})
        .attr('d', arc)
        .attr('fill', function() {
            if (percent < 20) return '#dc3545';
            if (percent < 50) return '#ffc107';
            return '#28a745';
        });
    
    // Center text
    g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.3em')
        .attr('font-size', '24px')
        .attr('font-weight', 'bold')
        .text(percent + '%');
    
    g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .attr('font-size', '12px')
        .attr('fill', '#6c757d')
        .text(kwh + ' kWh');
}

function drawSolarPanel(power) {
    var container = document.getElementById('solar-panel');
    if (!container) return;
    container.innerHTML = '';
    
    var width = 150;
    var height = 120;
    
    var svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    // Solar panel base
    var panel = svg.append('g')
        .attr('transform', 'translate(' + width/2 + ',' + height/2 + ')');
    
    // Panel frame
    panel.append('rect')
        .attr('x', -60)
        .attr('y', -30)
        .attr('width', 120)
        .attr('height', 60)
        .attr('fill', '#2c3e50')
        .attr('stroke', '#34495e')
        .attr('stroke-width', 2)
        .attr('rx', 4);
    
    // Solar cells (grid)
    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 2; j++) {
            panel.append('rect')
                .attr('x', -50 + i * 25)
                .attr('y', -20 + j * 20)
                .attr('width', 20)
                .attr('height', 15)
                .attr('fill', '#34495e')
                .attr('stroke', '#2c3e50')
                .attr('stroke-width', 1);
        }
    }
    
    // Sun rays
    var sun = svg.append('g')
        .attr('transform', 'translate(20, 20)');
    
    sun.append('circle')
        .attr('r', 15)
        .attr('fill', '#ffd700')
        .attr('stroke', '#ffed4e')
        .attr('stroke-width', 2);
    
    // Sun rays
    for (var i = 0; i < 8; i++) {
        var angle = (i * 45) * Math.PI / 180;
        var x1 = Math.cos(angle) * 20;
        var y1 = Math.sin(angle) * 20;
        var x2 = Math.cos(angle) * 25;
        var y2 = Math.sin(angle) * 25;
        
        sun.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', '#ffd700')
            .attr('stroke-width', 2)
            .attr('opacity', 0.7);
    }
    
    // Power indicator (glow effect based on power)
    var intensity = Math.min(power / 5000, 1); // Normalize to 0-1
    panel.selectAll('rect')
        .filter(function(d, i) { return i > 0; }) // Skip the frame
        .attr('fill', d3.interpolate('#34495e', '#3498db')(intensity))
        .attr('opacity', 0.3 + intensity * 0.7);
}

