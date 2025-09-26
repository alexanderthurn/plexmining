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

function sanitizeSettingsInput(array $input): ?array {
    $allowedKeys = [
        'autoMode', 'systemScale', 'pv_kwp', 'pvSystemFactor', 'miners'
    ];

    $sanitized = [];

    foreach ($input as $key => $value) {
        // Only allow whitelisted keys
        if (!in_array($key, $allowedKeys)) {
            continue; // Skip unknown keys
        }

        switch ($key) {
            case 'autoMode':
                // Must be boolean
                if (!is_bool($value)) {
                    return null;
                }
                $sanitized[$key] = $value;
                break;

            case 'systemScale':
                // Must be numeric between 0 and 100
                if (!is_numeric($value)) {
                    return null;
                }
                $numericValue = floatval($value);
                if ($numericValue < 0 || $numericValue > 100) {
                    return null;
                }
                $sanitized[$key] = $numericValue;
                break;

            case 'pv_kwp':
                // Must be numeric and positive
                if (!is_numeric($value)) {
                    return null;
                }
                $numericValue = floatval($value);
                if ($numericValue <= 0) {
                    return null;
                }
                $sanitized[$key] = $numericValue;
                break;

            case 'pvSystemFactor':
                // Must be numeric between 0 and 1 (performance ratio)
                if (!is_numeric($value)) {
                    return null;
                }
                $numericValue = floatval($value);
                if ($numericValue <= 0 || $numericValue > 1) {
                    return null;
                }
                $sanitized[$key] = $numericValue;
                break;

            case 'miners':
                // Must be array of miner objects
                if (!is_array($value)) {
                    return null;
                }

                $sanitizedMiners = [];
                foreach ($value as $miner) {
                    if (!is_array($miner)) {
                        return null;
                    }

                    $sanitizedMiner = [];

                    // Validate and sanitize each miner field
                    $minerKeys = ['id', 'model', 'hashrate', 'power_kw', 'power', 'minBatteryFullKwh', 'minBatteryKwh', 'minBatteryReducedKwh', 'ip'];
                    foreach ($minerKeys as $minerKey) {
                        if (isset($miner[$minerKey])) {
                            switch ($minerKey) {
                                case 'id':
                                case 'model':
                                case 'ip':
                                    // String fields - sanitize and limit length
                                    $stringValue = trim(strval($miner[$minerKey]));
                                    if (strlen($stringValue) > 255) {
                                        return null; // Too long
                                    }
                                    $sanitizedMiner[$minerKey] = $stringValue;
                                    break;

                                case 'hashrate':
                                case 'power_kw':
                                case 'power':
                                case 'minBatteryFullKwh':
                                case 'minBatteryKwh':
                                case 'minBatteryReducedKwh':
                                    // Numeric fields - must be valid numbers
                                    if (!is_numeric($miner[$minerKey])) {
                                        return null;
                                    }
                                    $numericValue = floatval($miner[$minerKey]);
                                    if ($numericValue < 0) {
                                        return null; // No negative values allowed
                                    }
                                    $sanitizedMiner[$minerKey] = $numericValue;
                                    break;
                            }
                        }
                    }

                    // Require at least a model
                    if (!isset($sanitizedMiner['model']) || empty($sanitizedMiner['model'])) {
                        return null;
                    }

                    $sanitizedMiners[] = $sanitizedMiner;
                }

                $sanitized[$key] = $sanitizedMiners;
                break;
        }
    }

    return $sanitized;
}

// Lesen
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(json_read($cfgFile), JSON_PRETTY_PRINT);
    exit;
}

// Schreiben
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    // Validate JSON structure
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid json']);
        exit;
    }

    // Sanitize and validate input data
    $sanitizedInput = sanitizeSettingsInput($input);

    // Only proceed if sanitization was successful
    if ($sanitizedInput === null) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid settings data']);
        exit;
    }

    json_write_atomic($cfgFile, $sanitizedInput);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);
