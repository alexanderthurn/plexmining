<?php

header('Content-Type: application/json');

$dataFile = '../data/config/pv.json';

function json_read(string $path, $default = []) {
    if (!is_file($path)) return $default;
    $content = file_get_contents($path);
    $decoded = json_decode($content, true);
    return is_array($decoded) || is_object($decoded) ? $decoded : $default;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(json_read($dataFile, []), JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);

?>

