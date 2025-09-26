<?php

header('Content-Type: application/json');

$settingsFile = '../data/config/settings.json';
$minersFile = '../data/config/miners.json';
$weatherDailyFile = '../data/config/weather-daily.json';
$weatherHourlyFile = '../data/config/weather-hourly.json';
$pvFile = '../data/config/pv.json';

function json_read_assoc(string $path, $default) {
    if (!is_file($path)) return $default;
    $content = file_get_contents($path);
    $decoded = json_decode($content, true);
    return is_array($decoded) || is_object($decoded) ? $decoded : $default;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$settings = json_read_assoc($settingsFile, []);
// Prefer miners from settings, fallback to miners file
$miners = json_read_assoc($minersFile, []); // default fallback first
if (isset($settings['miners']) && is_array($settings['miners'])) {
    $miners = $settings['miners'];
}
$weatherDaily = json_read_assoc($weatherDailyFile, []);
$weatherHourly = json_read_assoc($weatherHourlyFile, []);
$pv = json_read_assoc($pvFile, []);

// Add cumulative (accumulated) values and TH/kWh calculation for miners
if (is_array($miners)) {
    $cumulativeHashrate = 0;
    $cumulativePower = 0;
    
    foreach ($miners as $index => &$miner) {
        isset($miner['hashrate']) && is_numeric($miner['hashrate']) && ($cumulativeHashrate += floatval($miner['hashrate']));
        isset($miner['power']) && is_numeric($miner['power']) && ($cumulativePower += floatval($miner['power']));
        
        // Add cumulative values from index 1 (second miner) onwards
        if ($index > 0) {
            $miner['cumulative_hashrate'] = floatval($cumulativeHashrate);
            $miner['cumulative_power'] = floatval($cumulativePower);
        }
        
        // Calculate TH/kWh efficiency for each miner
        $hashrate = isset($miner['hashrate']) && is_numeric($miner['hashrate']) ? floatval($miner['hashrate']) : 0;
        $power = isset($miner['power']) && is_numeric($miner['power']) ? floatval($miner['power']) : 0;
        
        // TH/kWh = (hashrate TH/s) / (power in kW)
        // Convert power from W to kW
        $powerInKW = $power / 1000;
        $thPerKWh = ($powerInKW > 0) ? round($hashrate / $powerInKW, 3) : 0;
        
        $miner['th_per_kwh'] = $thPerKWh;
    }
    unset($miner); // break reference
}

// Post-processing: Calculate PV energy for weather data
function calculatePVEnergy($radiationWh, $pvKwp, $pvFactor) {
    if (!is_numeric($radiationWh) || !is_numeric($pvKwp) || !is_numeric($pvFactor)) {
        return null;
    }
    return ($radiationWh / 1000) * $pvKwp * $pvFactor;
}

// Post-processing: Calculate PV energy for hourly weather data using global_tilted_irradiance
function calculatePVEnergyHourly($tiltedIrradiance, $pvKwp, $pvFactor) {
    if (!is_numeric($tiltedIrradiance) || !is_numeric($pvKwp) || !is_numeric($pvFactor)) {
        return null;
    }
    // For hourly data: global_tilted_irradiance is in W/m² (irradiance on tilted surface)
    // This is the actual irradiance that hits the PV panels
    // Formula: (irr / 1000) * kwp * pr
    // where: irr = global_tilted_irradiance, kwp = PV capacity, pr = performance ratio
    $kwNow = ($tiltedIrradiance / 1000) * $pvKwp * $pvFactor;
    $kwhNow = $kwNow * 1.0; // Energy for this hour
    return $kwhNow;
}

// Add PV energy calculations to daily weather data
if (is_array($weatherDaily) && isset($settings['pv_kwp']) && isset($settings['pvSystemFactor'])) {
    $pvKwp = floatval($settings['pv_kwp']);
    $pvFactor = floatval($settings['pvSystemFactor']);
    
    foreach ($weatherDaily as &$day) {
        if (isset($day['shortwave_radiation_sum_Wh_m2']) && is_numeric($day['shortwave_radiation_sum_Wh_m2'])) {
            $day['pv_energy_kwh'] = calculatePVEnergy($day['shortwave_radiation_sum_Wh_m2'], $pvKwp, $pvFactor);
        }
    }
    unset($day); // break reference
}

// Add PV energy calculations to hourly weather data
if (is_array($weatherHourly) && isset($settings['pv_kwp']) && isset($settings['pvSystemFactor'])) {
    $pvKwp = floatval($settings['pv_kwp']);
    $pvFactor = floatval($settings['pvSystemFactor']);
    
    foreach ($weatherHourly as &$hour) {
        if (isset($hour['global_tilted_irradiance']) && is_numeric($hour['global_tilted_irradiance'])) {
            $hour['pv_energy_kwh'] = calculatePVEnergyHourly($hour['global_tilted_irradiance'], $pvKwp, $pvFactor);
        }
    }
    unset($hour); // break reference
}

// Add calculated values to PV data (instead of calculating in JavaScript)
if (is_array($pv) && isset($settings['miningMinBatteryKwh'])) {
    $pvKwh = floatval($pv['batterie_stand']['kwh'] ?? 0);
    $houseLoad = floatval($pv['haus_last_w'] ?? 0);
    $pvPower = floatval($pv['pv_leistung_w'] ?? 0);
    $miningMinBattery = floatval($settings['miningMinBatteryKwh'] ?? 15.0);
    
    // Calculate values that were previously done in JavaScript
    $pv['calculated'] = [
        'batteryDifference' => $pvKwh - $miningMinBattery,
        'availablePower' => $pvPower - $houseLoad,
        'miningPossible' => $pvKwh >= $miningMinBattery,
        'miningStatusText' => ($pvKwh >= $miningMinBattery) ? number_format($pvKwh - $miningMinBattery, 1) . ' kWh' : 'nix',
        'miningStatusClass' => ($pvKwh >= $miningMinBattery) ? 'text-success' : 'text-danger',
        'formatted_pv_power' => number_format($pvPower, 0, ',', '.'),
        'formatted_battery_kwh' => number_format($pvKwh, 1, ',', '.'),
        'formatted_battery_capacity' => number_format($pv['batterie_stand']['capacity_kwh'] ?? 49.9, 1, ',', '.'),
        'formatted_mining_min_battery' => number_format($miningMinBattery, 1, ',', '.'),
        'formatted_haus_last' => number_format($houseLoad, 0, ',', '.'),
        'formatted_available_power' => number_format($pvPower - $houseLoad, 0, ',', '.')
    ];
}

// Add calculated weather aggregations (to avoid JavaScript calculations)
if (is_array($weatherDaily)) {
    $horizonDays = [1, 7, 14];
    $aggregatedWeather = [];
    
    foreach ($horizonDays as $days) {
        $slice = array_slice($weatherDaily, 0, $days);
        
        // Sum sunshine hours
        $sunHours = 0;
        $sunRadiation = 0;
        $pvEnergy = 0;
        
        foreach ($slice as $day) {
            if (isset($day['sunshine_hours']) && is_numeric($day['sunshine_hours'])) {
                $sunHours += floatval($day['sunshine_hours']);
            }
            if (isset($day['shortwave_radiation_sum_Wh_m2']) && is_numeric($day['shortwave_radiation_sum_Wh_m2'])) {
                $sunRadiation += floatval($day['shortwave_radiation_sum_Wh_m2']);
            }
            if (isset($day['pv_energy_kwh']) && is_numeric($day['pv_energy_kwh'])) {
                $pvEnergy += floatval($day['pv_energy_kwh']);
            }
        }
        
        $aggregatedWeather[strval($days) . 'd'] = [
            'sunshine_hours' => number_format($sunHours, 2, ',', '.'),
            'radiation_sum' => number_format($sunRadiation, 0, ',', '.'),
            'pv_energy' => number_format($pvEnergy, 2, ',', '.')
        ];
    }
    
    // Tomorrow (next day if available)
    if (count($weatherDaily) > 1) {
        $tomorrow = $weatherDaily[1] ?? [];
        $aggregatedWeather['tomorrow'] = [
            'sunshine_hours' => isset($tomorrow['sunshine_hours']) && is_numeric($tomorrow['sunshine_hours']) ? 
                number_format($tomorrow['sunshine_hours'], 2, ',', '.') : '0,00',
            'radiation_sum' => isset($tomorrow['shortwave_radiation_sum_Wh_m2']) && is_numeric($tomorrow['shortwave_radiation_sum_Wh_m2']) ? 
                number_format($tomorrow['shortwave_radiation_sum_Wh_m2'], 0, ',', '.') : '0',
            'pv_energy' => isset($tomorrow['pv_energy_kwh']) && is_numeric($tomorrow['pv_energy_kwh']) ? 
                number_format($tomorrow['pv_energy_kwh'], 2, ',', '.') : '0,00'
        ];
    }
    
    // Today (first day)
    if (count($weatherDaily) > 0) {
        $today = $weatherDaily[0] ?? [];
        $aggregatedWeather['today'] = [
            'sunshine_hours' => isset($today['sunshine_hours']) && is_numeric($today['sunshine_hours']) ? 
                number_format($today['sunshine_hours'], 2, ',', '.') : '0,00',
            'radiation_sum' => isset($today['shortwave_radiation_sum_Wh_m2']) && is_numeric($today['shortwave_radiation_sum_Wh_m2']) ? 
                number_format($today['shortwave_radiation_sum_Wh_m2'], 0, ',', '.') : '0',
            'pv_energy' => isset($today['pv_energy_kwh']) && is_numeric($today['pv_energy_kwh']) ? 
                number_format($today['pv_energy_kwh'], 2, ',', '.') : '0,00'
        ];
    }
    
    $weatherAggregations = $aggregatedWeather;
}

// fetch dummy calculation
$calculation = [];
try {
    // Simple local include via HTTP would be expensive; instead, replicate logic here or request file.
    // For now, read calculation through direct include if desired; we keep it simple and avoid includes.
    $calculation = [
        'pv_forecast_kwh_next_hours' => [1.2, 1.8, 2.5, 2.9, 2.0, 1.1],
        'pv_forecast_kwh_total' => 11.5,
        'notes' => 'Dummy values; see calculation.php for endpoint version.'
    ];
} catch (Throwable $e) {
    $calculation = ['error' => 'calculation unavailable'];
}

$mtimes = [
    'settings' => is_file($settingsFile) ? filemtime($settingsFile) : null,
    'miners' => is_file($minersFile) ? filemtime($minersFile) : null,
    'weather_daily' => is_file($weatherDailyFile) ? filemtime($weatherDailyFile) : null,
    'weather_hourly' => is_file($weatherHourlyFile) ? filemtime($weatherHourlyFile) : null,
    'pv' => is_file($pvFile) ? filemtime($pvFile) : null,
];

$result = [
    'settings' => $settings,
    'miners' => $miners,
    'weather_daily' => $weatherDaily,
    'weather_hourly' => $weatherHourly,
    'pv' => $pv,
    'calculation' => $calculation,
    'mtimes' => $mtimes,
];

// Add aggregations if computed
if (isset($weatherAggregations)) {
    $result['weather_aggregations'] = $weatherAggregations;
}

echo json_encode($result, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
exit;

?>

