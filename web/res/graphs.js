function drawWeatherChart(rows) {
    var container = document.getElementById('weather-chart');
    if (!container) return;
    container.innerHTML = '';
    var width = container.clientWidth || 600;
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

    // If settings available on window (injected via script.js), compute PV energy (kWh) as simple ratio from radiation and pv_kwp
    var pvKwp = (window.__plexSettings && typeof window.__plexSettings.pv_kwp === 'number') ? window.__plexSettings.pv_kwp : null;
    if (pvKwp) {
        data.forEach(function(d){
            if (d.valueRad != null) {
                // Very simple proportional model: kWh = (rad Wh/m2 / 1000) * pv_kwp * 0.8 (assumed system efficiency)
                d.valuePV = (d.valueRad / 1000) * pvKwp * 0.8;
            }
        });
    }

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

    // PV bars
    if (pvKwp) {
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

    if (pvKwp) {
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

