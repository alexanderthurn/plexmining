<?php

header('Content-Type: application/json');

$settingsFile = '../data/config/settings.json';
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
// Get miners from settings only
$miners = isset($settings['miners']) && is_array($settings['miners']) ? $settings['miners'] : [];

function normalize_levels(array $levels): array {
    $defaultColors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085', '#d35400'];
    $normalized = [];
    foreach ($levels as $index => $level) {
        if (!is_array($level)) continue;
        $label = isset($level['label']) && is_string($level['label']) && trim($level['label']) !== ''
            ? trim($level['label'])
            : 'Level ' . ($index + 1);
        $power = isset($level['power_kw']) && is_numeric($level['power_kw']) ? (float)$level['power_kw'] : 0.0;
        $battery = isset($level['battery_min_kwh']) && is_numeric($level['battery_min_kwh']) ? (float)$level['battery_min_kwh'] : 0.0;
        $pvHours = isset($level['pv_forecast_hours']) && is_numeric($level['pv_forecast_hours']) ? (int)$level['pv_forecast_hours'] : 0;
        $pvEnergy = isset($level['pv_forecast_min_kwh']) && is_numeric($level['pv_forecast_min_kwh']) ? (float)$level['pv_forecast_min_kwh'] : 0.0;
        $color = isset($level['color']) && is_string($level['color']) && trim($level['color']) !== ''
            ? trim($level['color'])
            : $defaultColors[$index % count($defaultColors)];

        if ($power <= 0) {
            continue; // Skip invalid power entries
        }

        $normalized[] = [
            'label' => $label,
            'power_kw' => $power,
            'battery_min_kwh' => $battery,
            'pv_forecast_hours' => $pvHours,
            'pv_forecast_min_kwh' => $pvEnergy,
            'color' => $color,
        ];
    }

    usort($normalized, function ($a, $b) {
        $powerCmp = $a['power_kw'] <=> $b['power_kw'];
        if ($powerCmp !== 0) return $powerCmp;
        return $a['battery_min_kwh'] <=> $b['battery_min_kwh'];
    });

    return $normalized;
}

function ensure_levels(array $miner): array {
    if (!empty($miner['levels']) && is_array($miner['levels'])) {
        $miner['levels'] = normalize_levels($miner['levels']);
        if (!empty($miner['levels'])) {
            return $miner;
        }
    }

    $fallbackLevels = [];
    $powerKw = isset($miner['power_kw']) && is_numeric($miner['power_kw']) ? (float)$miner['power_kw'] : 0.0;
    $minFull = isset($miner['minBatteryFullKwh']) && is_numeric($miner['minBatteryFullKwh']) ? (float)$miner['minBatteryFullKwh'] : 0.0;
    $minReduced = isset($miner['minBatteryReducedKwh']) && is_numeric($miner['minBatteryReducedKwh']) ? (float)$miner['minBatteryReducedKwh'] : 0.0;

    if ($minReduced > 0 && $powerKw > 0) {
        $fallbackLevels[] = [
            'label' => 'Reduced',
            'power_kw' => round($powerKw * 0.6, 2),
            'battery_min_kwh' => $minReduced,
            'pv_forecast_hours' => 0,
            'pv_forecast_min_kwh' => 0.0,
        ];
    }

    if ($powerKw > 0) {
        $fallbackLevels[] = [
            'label' => 'Full',
            'power_kw' => $powerKw,
            'battery_min_kwh' => $minFull,
            'pv_forecast_hours' => 0,
            'pv_forecast_min_kwh' => 0.0,
        ];
    }

    if (empty($fallbackLevels) && $powerKw > 0) {
        $fallbackLevels[] = [
            'label' => 'Level 1',
            'power_kw' => $powerKw,
            'battery_min_kwh' => 0.0,
            'pv_forecast_hours' => 0,
            'pv_forecast_min_kwh' => 0.0,
        ];
    }

    $miner['levels'] = normalize_levels($fallbackLevels);
    return $miner;
}
$weatherDaily = json_read_assoc($weatherDailyFile, []);
$weatherHourly = json_read_assoc($weatherHourlyFile, []);
$pv = json_read_assoc($pvFile, []);

// Add cumulative (accumulated) values and TH/kWh calculation for miners
if (is_array($miners)) {
    $cumulativeHashrate = 0;
    $cumulativePowerKw = 0;
    
foreach ($miners as $index => &$miner) {
        if (!is_array($miner)) {
            $miner = [];
        }
        $miner = ensure_levels($miner);
        $hashrate = isset($miner['hashrate']) && is_numeric($miner['hashrate']) ? floatval($miner['hashrate']) : 0;
        $powerKw = 0;
        if (isset($miner['power_kw']) && is_numeric($miner['power_kw'])) {
            $powerKw = floatval($miner['power_kw']);
        } elseif (isset($miner['power']) && is_numeric($miner['power'])) {
            $powerKw = floatval($miner['power']) / 1000;
            $miner['power_kw'] = $powerKw;
        }
        
        $cumulativeHashrate += $hashrate;
        $cumulativePowerKw += $powerKw;
        
        // Add cumulative values from index 1 (second miner) onwards
        if ($index > 0) {
            $miner['cumulative_hashrate'] = floatval($cumulativeHashrate);
            $miner['cumulative_power_kw'] = round($cumulativePowerKw, 3);
        }
        
        // Calculate TH/kWh efficiency for each miner
        $powerInKW = $powerKw;
        $thPerKWh = ($powerInKW > 0) ? round($hashrate / $powerInKW, 3) : 0;
        
        $miner['th_per_kwh'] = $thPerKWh;

        // Add derived level hints for convenience
        if (!empty($miner['levels'])) {
            $miner['level_summary'] = array_map(function ($level) {
                return [
                    'label' => $level['label'],
                    'power_kw' => $level['power_kw'],
                    'battery_min_kwh' => $level['battery_min_kwh'],
                    'pv_forecast_hours' => $level['pv_forecast_hours'],
                    'pv_forecast_min_kwh' => $level['pv_forecast_min_kwh'],
                    'color' => $level['color'] ?? '#999',
                ];
            }, $miner['levels']);
        }
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
    $pvScale = isset($settings['weatherPowerScale']) && is_numeric($settings['weatherPowerScale']) ? floatval($settings['weatherPowerScale']) : 1.0;
    
    foreach ($weatherDaily as &$day) {
        if (isset($day['shortwave_radiation_sum_Wh_m2']) && is_numeric($day['shortwave_radiation_sum_Wh_m2'])) {
            $day['pv_energy_kwh'] = calculatePVEnergy($day['shortwave_radiation_sum_Wh_m2'], $pvKwp, $pvFactor * $pvScale);
        }
    }
    unset($day); // break reference
}

// Add PV energy calculations to hourly weather data
if (is_array($weatherHourly) && isset($settings['pv_kwp']) && isset($settings['pvSystemFactor'])) {
    $pvKwp = floatval($settings['pv_kwp']);
    $pvFactor = floatval($settings['pvSystemFactor']);
    $pvScale = isset($settings['weatherPowerScale']) && is_numeric($settings['weatherPowerScale']) ? floatval($settings['weatherPowerScale']) : 1.0;
    
    foreach ($weatherHourly as &$hour) {
        if (isset($hour['global_tilted_irradiance']) && is_numeric($hour['global_tilted_irradiance'])) {
            $hour['pv_energy_kwh'] = calculatePVEnergyHourly($hour['global_tilted_irradiance'], $pvKwp, $pvFactor * $pvScale);
        }
    }
    unset($hour); // break reference
}

// Build cumulative hourly PV forecast starting from current hour
$hourlyForecast = null;
if (is_array($weatherHourly) && count($weatherHourly) > 0 && isset($miners) && is_array($miners)) {
    $now = new DateTime('now');
    $now->setTime((int)$now->format('H'), 0, 0);

    $baseLoad = isset($settings['houseBaseLoad']) && is_numeric($settings['houseBaseLoad']) ? floatval($settings['houseBaseLoad']) : 0.0;
    $batteryStartKwh = floatval($pv['batterie_stand']['kwh'] ?? 0);
    $batteryCapacityKwh = floatval($pv['batterie_stand']['capacity_kwh'] ?? 0);
    
    $forecastData = [];
    $cumulativePv = 0.0;
    $batteryValue = $batteryStartKwh;
    
    // First pass: collect basic hourly data with timestamps
    $hourlyDataByTime = [];
    foreach ($weatherHourly as $hour) {
        if (!isset($hour['datetime']) || !isset($hour['pv_energy_kwh'])) {
            continue;
        }

        $entryTime = DateTime::createFromFormat(DateTime::ATOM, $hour['datetime'])
            ?: DateTime::createFromFormat('Y-m-d\TH:i', $hour['datetime'])
            ?: DateTime::createFromFormat('Y-m-d H:i', $hour['datetime']);
        if (!$entryTime) {
            continue;
        }
        $entryTime->setTime((int)$entryTime->format('H'), 0, 0);

        if ($entryTime < $now) {
            continue;
        }

        $pvValue = floatval($hour['pv_energy_kwh']);
        $cumulativePv += $pvValue;
        
        $hourlyDataByTime[$entryTime->getTimestamp()] = [
            'datetime' => $entryTime->format(DateTime::ATOM),
            'entryTime' => $entryTime,
            'pv_energy_kwh' => $pvValue,
            'pv_energy_kwh_accumulated' => $cumulativePv,
            'battery_level_kwh' => 0  // Will be calculated in second pass
        ];
    }

    // Second pass: Iteratively calculate battery levels and miner activity
    // This must be done iteratively because miner decisions depend on battery level,
    // and battery level depends on previous miner consumption
    $timestamps = array_keys($hourlyDataByTime);
    $batteryValue = $batteryStartKwh;
    
    foreach ($timestamps as $tsIndex => $ts) {
        $currentTime = (clone $hourlyDataByTime[$ts]['entryTime']);
        
        // Calculate PV forecast sums for different time horizons from this point
        $pvForecastHorizons = [];
        
        // For each miner level, check their pv_forecast_hours requirement
        foreach ($miners as $miner) {
            if (!isset($miner['levels']) || !is_array($miner['levels'])) {
                continue;
            }
            foreach ($miner['levels'] as $level) {
                $horizonHours = isset($level['pv_forecast_hours']) ? intval($level['pv_forecast_hours']) : 0;
                if ($horizonHours > 0 && !isset($pvForecastHorizons[$horizonHours])) {
                    $pvForecastHorizons[$horizonHours] = 0.0;
                }
            }
        }
        
        // Calculate PV sum for each required horizon
        foreach ($pvForecastHorizons as $hours => $dummy) {
            $sum = 0.0;
            $endTime = (clone $currentTime)->add(new DateInterval('PT' . $hours . 'H'));
            foreach ($timestamps as $futureTs) {
                if ($futureTs > $ts && $hourlyDataByTime[$futureTs]['entryTime'] <= $endTime) {
                    $sum += $hourlyDataByTime[$futureTs]['pv_energy_kwh'];
                }
            }
            $pvForecastHorizons[$hours] = $sum;
        }
        
        $hourlyDataByTime[$ts]['pv_forecast_horizons'] = $pvForecastHorizons;
        
        // Now determine which miners run based on CURRENT battery level
        $currentBatteryKwh = $batteryValue;
        $pvHorizons = $pvForecastHorizons;
        
        $runningMiners = [];
        foreach ($miners as $miner) {
            if (!isset($miner['id']) || !isset($miner['levels']) || !is_array($miner['levels'])) {
                continue;
            }
            
            $selectedLevel = null;
            $selectedLevelIndex = -1;
            
            // Check all levels and select the one with highest power that meets conditions
            foreach ($miner['levels'] as $levelIdx => $level) {
                $minBattery = floatval($level['battery_min_kwh'] ?? 0);
                $pvHours = intval($level['pv_forecast_hours'] ?? 0);
                $minPv = floatval($level['pv_forecast_min_kwh'] ?? 0);
                
                // Check if battery condition is met
                if ($currentBatteryKwh < $minBattery) {
                    continue;
                }
                
                // Check if PV forecast condition is met (if required)
                if ($pvHours > 0 && $minPv > 0) {
                    $forecastPv = isset($pvHorizons[$pvHours]) ? $pvHorizons[$pvHours] : 0.0;
                    if ($forecastPv < $minPv) {
                        continue;
                    }
                }
                
                // This level qualifies - keep checking if there's a higher one
                $levelPower = floatval($level['power_kw'] ?? 0);
                if ($selectedLevel === null || $levelPower > floatval($selectedLevel['power_kw'] ?? 0)) {
                    $selectedLevel = $level;
                    $selectedLevelIndex = $levelIdx;
                }
            }
            
            if ($selectedLevel !== null) {
                $powerKw = floatval($selectedLevel['power_kw'] ?? 0);
                $hashrateTh = floatval($miner['hashrate'] ?? 0);
                
                // Calculate proportional hashrate based on power level vs max power
                $maxPowerKw = floatval($miner['power_kw'] ?? 1);
                $powerRatio = $maxPowerKw > 0 ? ($powerKw / $maxPowerKw) : 0;
                $effectiveHashrate = $hashrateTh * $powerRatio;
                
                $runningMiners[] = [
                    'miner_id' => $miner['id'],
                    'level_index' => $selectedLevelIndex,
                    'power_kw' => $powerKw,
                    'hashrate_th' => $effectiveHashrate
                ];
            }
        }
        
        // Calculate totals
        $totalPowerKw = 0.0;
        $totalHashrateTh = 0.0;
        foreach ($runningMiners as $rm) {
            $totalPowerKw += $rm['power_kw'];
            $totalHashrateTh += $rm['hashrate_th'];
        }
        
        $hourlyDataByTime[$ts]['running_miners'] = $runningMiners;
        $hourlyDataByTime[$ts]['total_power_kw'] = $totalPowerKw;
        $hourlyDataByTime[$ts]['total_hashrate_th'] = $totalHashrateTh;
        
        // Store battery level BEFORE this hour (at the start)
        $hourlyDataByTime[$ts]['battery_level_kwh_start'] = $batteryValue;
        
        // Update battery level for NEXT iteration: PV + current battery - house load - miner consumption
        $pvValue = $hourlyDataByTime[$ts]['pv_energy_kwh'];
        $net = $pvValue - $baseLoad - $totalPowerKw;
        $batteryValue = max(0, min($batteryCapacityKwh, $batteryValue + $net));
        
        // Store battery level AFTER this hour (at the end)
        $hourlyDataByTime[$ts]['battery_level_kwh_end'] = $batteryValue;
    }

    // Build final forecast array
    foreach ($timestamps as $ts) {
        $data = $hourlyDataByTime[$ts];
        $forecastData[] = [
            'datetime' => $data['datetime'],
            'pv_energy_kwh' => $data['pv_energy_kwh'],
            'pv_energy_kwh_accumulated' => $data['pv_energy_kwh_accumulated'],
            'battery_level_kwh' => $data['battery_level_kwh_start'], // Use start value for display
            'battery_level_kwh_start' => $data['battery_level_kwh_start'],
            'battery_level_kwh_end' => $data['battery_level_kwh_end'],
            'pv_forecast_horizons' => $data['pv_forecast_horizons'],
            'running_miners' => $data['running_miners'],
            'total_power_kw' => $data['total_power_kw'],
            'total_hashrate_th' => $data['total_hashrate_th'],
            'house_base_load' => $baseLoad
        ];
    }

    if (!empty($forecastData)) {
        $hourlyForecast = [
            'start_datetime' => $now->format(DateTime::ATOM),
            'forecast' => $forecastData
        ];
    }
}

// Add calculated values to PV data (instead of calculating in JavaScript)
if (is_array($pv)) {
    $pvKwh = floatval($pv['batterie_stand']['kwh'] ?? 0);
    $pvCapacity = floatval($pv['batterie_stand']['capacity_kwh'] ?? 0);
    $houseLoad = floatval($pv['haus_last_w'] ?? 0);
    $pvPowerKw = floatval($pv['pv_leistung_kw'] ?? 0);
    $pvPowerW = $pvPowerKw * 1000;
    
    // Calculate values that were previously done in JavaScript
    $pv['calculated'] = [
        'availablePower' => $pvPowerW - $houseLoad,
        'formatted_pv_power' => number_format($pvPowerW, 0, ',', '.'),
        'formatted_battery_kwh' => number_format($pvKwh, 1, ',', '.'),
        'formatted_battery_capacity' => number_format($pv['batterie_stand']['capacity_kwh'] ?? 49.9, 1, ',', '.'),
        'formatted_haus_last' => number_format($houseLoad, 0, ',', '.'),
        'formatted_available_power' => number_format($pvPowerW - $houseLoad, 0, ',', '.')
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
    
    // Determine today and tomorrow entries explicitly
    $todayDate = new DateTime('today');
    $tomorrowDate = new DateTime('tomorrow');
    $todayEntry = null;
    $tomorrowEntry = null;

    foreach ($weatherDaily as $day) {
        if (!isset($day['date'])) continue;
        $dayDate = DateTime::createFromFormat('Y-m-d', $day['date']);
        if (!$dayDate) continue;
        $dayDate->setTime(0, 0, 0);

        if ($dayDate == $todayDate && $todayEntry === null) {
            $todayEntry = $day;
        } elseif ($dayDate == $tomorrowDate && $tomorrowEntry === null) {
            $tomorrowEntry = $day;
        }

        if ($todayEntry && $tomorrowEntry) {
            break;
        }
    }

    if ($todayEntry) {
        $aggregatedWeather['today'] = [
            'sunshine_hours' => isset($todayEntry['sunshine_hours']) && is_numeric($todayEntry['sunshine_hours']) ? 
                number_format($todayEntry['sunshine_hours'], 2, ',', '.') : '0,00',
            'radiation_sum' => isset($todayEntry['shortwave_radiation_sum_Wh_m2']) && is_numeric($todayEntry['shortwave_radiation_sum_Wh_m2']) ? 
                number_format($todayEntry['shortwave_radiation_sum_Wh_m2'], 0, ',', '.') : '0',
            'pv_energy' => isset($todayEntry['pv_energy_kwh']) && is_numeric($todayEntry['pv_energy_kwh']) ? 
                number_format($todayEntry['pv_energy_kwh'], 2, ',', '.') : '0,00'
        ];
    }

    if ($tomorrowEntry) {
        $aggregatedWeather['tomorrow'] = [
            'sunshine_hours' => isset($tomorrowEntry['sunshine_hours']) && is_numeric($tomorrowEntry['sunshine_hours']) ? 
                number_format($tomorrowEntry['sunshine_hours'], 2, ',', '.') : '0,00',
            'radiation_sum' => isset($tomorrowEntry['shortwave_radiation_sum_Wh_m2']) && is_numeric($tomorrowEntry['shortwave_radiation_sum_Wh_m2']) ? 
                number_format($tomorrowEntry['shortwave_radiation_sum_Wh_m2'], 0, ',', '.') : '0',
            'pv_energy' => isset($tomorrowEntry['pv_energy_kwh']) && is_numeric($tomorrowEntry['pv_energy_kwh']) ? 
                number_format($tomorrowEntry['pv_energy_kwh'], 2, ',', '.') : '0,00'
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
    'miners' => is_file($settingsFile) ? filemtime($settingsFile) : null, // miners are in settings.json now
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

if ($hourlyForecast) {
    $result['hourly_forecast'] = $hourlyForecast;
}

echo json_encode($result, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
exit;

?>

