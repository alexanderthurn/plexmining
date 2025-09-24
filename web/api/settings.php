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
    json_write_atomic($cfgFile, $input);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);
