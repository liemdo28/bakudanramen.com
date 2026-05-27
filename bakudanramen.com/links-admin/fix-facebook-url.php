<?php
/**
 * One-time fix: update Facebook URL in settings table
 * Old: https://www.facebook.com/bakudanramen
 * New: https://www.facebook.com/share/1L7NNTQF6e/?mibextid=wwXIfr
 */
declare(strict_types=1);

define('DB_PATH', '/home/hoale24new/bakudan-app/data/bakudan.db');

$db = new SQLite3(DB_PATH);
$db->enableExceptions(true);

$old = 'https://www.facebook.com/bakudanramen';
$new = 'https://www.facebook.com/share/1L7NNTQF6e/?mibextid=wwXIfr';

$stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE '%facebook%'");
$rows = $stmt->execute()->fetchAll(SQLITE3_ASSOC);

echo "Current Facebook settings:\n";
foreach ($rows as $r) {
    echo "  {$r['key']} = {$r['value']}\n";
}

$count = $db->exec("UPDATE settings SET value = '$new' WHERE value = '$old'");
echo "Rows updated: $count\n";

// Verify
$stmt2 = $db->prepare("SELECT value FROM settings WHERE value = :v");
$stmt2->bindValue(':v', $new);
$res = $stmt2->execute()->fetch(SQLITE3_ASSOC);
if ($res) {
    echo "SUCCESS: Facebook URL is now: $new\n";
} else {
    echo "WARNING: Could not verify update. Check manually.\n";
}
