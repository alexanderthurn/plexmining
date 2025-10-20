<?php

header('Content-Type: application/json');

$cfgFile = '../data/config/settings.json';

function json_write_atomic(string $path, array $data): void {
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES), LOCK_EX);
    rename($tmp, $path);
}
function json_read(string $path, array $default=[]): array {
    if (!is_file($path)) return $default;
    $s = file_get_contents($path);
    $a = json_decode($s, true);
    return is_array($a) ? $a : $default;
}

function normalize_levels(array $levels): array {
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

        if ($power <= 0) {
            continue;
        }

        $normalized[] = [
            'label' => $label,
            'power_kw' => $power,
            'battery_min_kwh' => $battery,
            'pv_forecast_hours' => $pvHours,
            'pv_forecast_min_kwh' => $pvEnergy,
        ];
    }

    usort($normalized, function($a, $b) {
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

// Lesen
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(json_read($cfgFile), JSON_PRETTY_PRINT);
    exit;
}

// Schreiben
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid json']);
        exit;
    }

    if (isset($input['houseBaseLoad']) && !is_numeric($input['houseBaseLoad'])) {
        $input['houseBaseLoad'] = 0;
    }

    if (isset($input['miners']) && is_array($input['miners'])) {
        $defaultColors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085', '#d35400'];
        $normalizedMiners = [];
        foreach ($input['miners'] as $index => $miner) {
            if (!is_array($miner)) continue;
            $miner = ensure_levels($miner);
            $miner['hashrate'] = isset($miner['hashrate']) && is_numeric($miner['hashrate']) ? (float)$miner['hashrate'] : 0.0;
            if (isset($miner['power']) && !isset($miner['power_kw']) && is_numeric($miner['power'])) {
                $miner['power_kw'] = (float)$miner['power'] / 1000;
            }
            $miner['power_kw'] = isset($miner['power_kw']) && is_numeric($miner['power_kw']) ? (float)$miner['power_kw'] : 0.0;
            $miner['ip'] = isset($miner['ip']) ? (string)$miner['ip'] : '';
            $miner['model'] = isset($miner['model']) ? (string)$miner['model'] : '';
            $miner['id'] = isset($miner['id']) ? (string)$miner['id'] : '';
            $miner['os'] = isset($miner['os']) ? (string)$miner['os'] : 'BrainsOSApi';
            
            // Ensure miner has a color
            if (!isset($miner['color']) || !is_string($miner['color']) || trim($miner['color']) === '') {
                $miner['color'] = $defaultColors[$index % count($defaultColors)];
            }
            
            // Remove calculated fields that shouldn't be saved
            unset($miner['power']);
            unset($miner['th_per_kwh']);
            unset($miner['cumulative_hashrate']);
            unset($miner['cumulative_power_kw']);
            unset($miner['level_summary']);
            
            $normalizedMiners[] = $miner;
        }
        $input['miners'] = $normalizedMiners;
    }

    json_write_atomic($cfgFile, $input);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);
