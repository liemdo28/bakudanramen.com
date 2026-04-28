<?php
/**
 * Bakudan Ramen — PHP API Backend
 * Handles all /api/* routes via Apache mod_rewrite
 * Database: SQLite3  |  Auth: JWT HS256
 */
declare(strict_types=1);

// ── Config ────────────────────────────────────────────────────────────
define('DB_PATH',      '/home/hoale24new/bakudan-app/data/bakudan.db');
define('UPLOAD_DIR',   '/home/hoale24new/bakudanramen.com/uploads/blogs/');
define('UPLOAD_URL',   '/uploads/blogs/');
define('JWT_SECRET',   getenv('JWT_SECRET') ?: 'bakudan-dev-secret-change-in-production');
define('JWT_TTL',      7 * 24 * 3600);
define('SITE_URL',     'https://bakudanramen.com');

// ── Handle uploads before JSON Content-Type header ────────────────────
$_rawUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$_isUpload = (preg_replace('#^/api#', '', $_rawUri) === '/upload');
if (!$_isUpload) {
    header('Content-Type: application/json');
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── JWT ───────────────────────────────────────────────────────────────
function jwt_encode(array $payload): string {
    $h = base64url(json_encode(['alg'=>'HS256','typ'=>'JWT']));
    $p = base64url(json_encode($payload));
    $s = base64url(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    return "$h.$p.$s";
}
function base64url_decode(string $data): string {
    $pad = strlen($data) % 4;
    if ($pad) $data .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($data, '-_', '+/'));
}
function jwt_decode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $p, $s] = $parts;
    $expected = base64url(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    if (!hash_equals($expected, $s)) return null;
    $payload = json_decode(base64url_decode($p), true);
    if (!$payload || ($payload['exp'] ?? 0) < time()) return null;
    return $payload;
}
function base64url(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

// ── Database ──────────────────────────────────────────────────────────
function db(): SQLite3 {
    static $db = null;
    if ($db) return $db;
    $dir = dirname(DB_PATH);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $db = new SQLite3(DB_PATH);
    $db->enableExceptions(true);
    $db->exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    db_migrate($db);
    return $db;
}
function db_migrate(SQLite3 $db): void {
    $db->exec("
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT, role TEXT NOT NULL DEFAULT 'viewer',
        store_slug TEXT, is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
        headline TEXT, store_slug TEXT, is_active INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0, theme TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS buttons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        label TEXT NOT NULL, url TEXT NOT NULL, icon TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_featured INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        start_at TEXT, end_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS redirects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
        source TEXT NOT NULL, destination TEXT NOT NULL,
        is_permanent INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS shortlinks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL, destination TEXT NOT NULL,
        label TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
        clicks INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id INTEGER, button_id INTEGER, shortlink_id INTEGER,
        event_type TEXT NOT NULL DEFAULT 'click',
        referrer TEXT, user_agent TEXT, ip TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL, name TEXT, source TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        content TEXT, excerpt TEXT, cover_image TEXT,
        author_id INTEGER, published_at TEXT, scheduled_at TEXT, archived_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    ");

    // Add new blog columns (idempotent — ignores duplicate column errors)
    $new_cols = [
        "ALTER TABLE blog_posts ADD COLUMN category TEXT",
        "ALTER TABLE blog_posts ADD COLUMN tags TEXT",
        "ALTER TABLE blog_posts ADD COLUMN seo_title TEXT",
        "ALTER TABLE blog_posts ADD COLUMN seo_description TEXT",
        "ALTER TABLE blog_posts ADD COLUMN og_image TEXT",
        "ALTER TABLE blog_posts ADD COLUMN tiptap_json TEXT",
        "ALTER TABLE blog_posts ADD COLUMN reading_time INTEGER NOT NULL DEFAULT 0",
    ];
    foreach ($new_cols as $sql) {
        try { $db->exec($sql); } catch (Exception $e) {}
    }

    // Seed admin
    $row = $db->querySingle("SELECT COUNT(*) FROM users");
    if ($row == 0) {
        $hash = password_hash('admin123', PASSWORD_BCRYPT);
        $stmt = $db->prepare("INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)");
        $stmt->bindValue(1, 'admin@bakudanramen.com');
        $stmt->bindValue(2, $hash);
        $stmt->bindValue(3, 'Administrator');
        $stmt->bindValue(4, 'super_admin');
        $stmt->execute();
    }
    // Seed settings
    $row = $db->querySingle("SELECT COUNT(*) FROM settings");
    if ($row == 0) {
        $ins = $db->prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)");
        foreach ([
            ['site_name','Bakudan Ramen'],['site_url',SITE_URL],
            ['theme_primary','#dc2626'],['theme_bg','#0f172a'],
            ['footer_text','© Bakudan Ramen. All rights reserved.'],
            ['show_subscriber_form','0'],
        ] as [$k,$v]) { $ins->bindValue(1,$k); $ins->bindValue(2,$v); $ins->execute(); }
    }
}
function q(string $sql, array $params = []): array {
    $stmt = db()->prepare($sql);
    foreach ($params as $i => $v) $stmt->bindValue($i+1, $v);
    $res = $stmt->execute();
    $rows = [];
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) $rows[] = $row;
    return $rows;
}
function q1(string $sql, array $params = []): ?array {
    $rows = q($sql, $params);
    return $rows[0] ?? null;
}
function run(string $sql, array $params = []): int {
    $stmt = db()->prepare($sql);
    foreach ($params as $i => $v) $stmt->bindValue($i+1, $v);
    $stmt->execute();
    return db()->lastInsertRowID();
}

// ── Request helpers ───────────────────────────────────────────────────
$METHOD  = $_SERVER['REQUEST_METHOD'];
$URI     = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$BODY    = json_decode(file_get_contents('php://input'), true) ?? [];
$QUERY   = $_GET;

function json_ok(array $data = [], int $code = 200): void {
    header('Content-Type: application/json');
    http_response_code($code);
    echo json_encode(['ok'=>true,'data'=>$data]);
    exit;
}
function json_err(string $msg, int $code = 400): void {
    header('Content-Type: application/json');
    http_response_code($code);
    echo json_encode(['ok'=>false,'error'=>$msg]);
    exit;
}

// ── Auth middleware ───────────────────────────────────────────────────
function auth(): array {
    $header = $_SERVER['HTTP_AUTHORIZATION']
           ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
           ?? (function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? '') : '');
    $token  = str_starts_with($header, 'Bearer ') ? substr($header, 7) : null;
    if (!$token) json_err('Unauthorized', 401);
    $payload = jwt_decode($token);
    if (!$payload) json_err('Token invalid or expired', 401);
    $user = q1("SELECT * FROM users WHERE id=? AND is_active=1", [$payload['id']]);
    if (!$user) json_err('Unauthorized', 401);
    return $user;
}
function require_role(array $user, array $roles): void {
    if (!in_array($user['role'], $roles)) json_err('Forbidden', 403);
}
$MGR  = ['super_admin','marketing_manager'];
$EDIT = ['super_admin','marketing_manager','store_manager'];

// ── Router ────────────────────────────────────────────────────────────
$path = preg_replace('#^/api#', '', $URI);
$path = rtrim($path, '/') ?: '/';
$segs = explode('/', trim($path, '/'));

// ── AUTH routes ───────────────────────────────────────────────────────
if ($path === '/auth/login' && $METHOD === 'POST') {
    $email = strtolower(trim($BODY['email'] ?? ''));
    $pass  = $BODY['password'] ?? '';
    if (!$email || !$pass) json_err('Email and password required');
    $user = q1("SELECT * FROM users WHERE email=? AND is_active=1", [$email]);
    if (!$user || !password_verify($pass, $user['password_hash'])) json_err('Invalid credentials', 401);
    $token = jwt_encode(['id'=>$user['id'],'email'=>$user['email'],'role'=>$user['role'],'exp'=>time()+JWT_TTL]);
    json_ok(['token'=>$token,'user'=>['id'=>$user['id'],'email'=>$user['email'],'name'=>$user['name'],'role'=>$user['role'],'store_slug'=>$user['store_slug']]]);
}

if ($path === '/auth/change-password' && $METHOD === 'POST') {
    $user = auth();
    $cur  = $BODY['current_password'] ?? '';
    $new  = $BODY['new_password'] ?? '';
    if (!$cur || !$new) json_err('Both passwords required');
    if (strlen($new) < 8) json_err('New password must be at least 8 characters');
    $fresh = q1("SELECT * FROM users WHERE id=?", [$user['id']]);
    if (!password_verify($cur, $fresh['password_hash'])) json_err('Current password is incorrect');
    run("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?", [password_hash($new,PASSWORD_BCRYPT), $user['id']]);
    json_ok();
}

// ── CONFIG ────────────────────────────────────────────────────────────
if ($path === '/config' && $METHOD === 'GET') {
    json_ok(['version'=>'2.0.0','siteUrl'=>SITE_URL,
        'iconKeys'=>['order','website','email','events','instagram','facebook','directions','phone','menu','gift','ticket','external','blog','social']]);
}

// ── DASHBOARD ─────────────────────────────────────────────────────────
if ($path === '/admin/dashboard' && $METHOD === 'GET') {
    $user = auth();
    json_ok([
        'pages'        => db()->querySingle("SELECT COUNT(*) FROM pages"),
        'activeButtons'=> db()->querySingle("SELECT COUNT(*) FROM buttons WHERE is_active=1 AND enabled=1"),
        'subscribers'  => db()->querySingle("SELECT COUNT(*) FROM subscribers WHERE is_active=1"),
        'shortlinks'   => db()->querySingle("SELECT COUNT(*) FROM shortlinks WHERE is_active=1"),
        'recentClicks' => db()->querySingle("SELECT COUNT(*) FROM analytics WHERE event_type='click' AND created_at>=datetime('now','-7 days')"),
        'publishedPosts'=> db()->querySingle("SELECT COUNT(*) FROM blog_posts WHERE status='published' AND archived_at IS NULL"),
        'draftPosts'   => db()->querySingle("SELECT COUNT(*) FROM blog_posts WHERE status='draft' AND archived_at IS NULL"),
    ]);
}

// ── PAGES ─────────────────────────────────────────────────────────────
if ($path === '/admin/pages' && $METHOD === 'GET') {
    $user = auth();
    json_ok(['pages' => q("SELECT * FROM pages ORDER BY sort_order ASC, id ASC")]);
}
if ($path === '/admin/pages' && $METHOD === 'POST') {
    $user = auth(); require_role($user, $MGR);
    $title = $BODY['title'] ?? ''; $slug = $BODY['slug'] ?? '';
    if (!$title || !$slug) json_err('Title and slug required');
    $slug = strtolower(preg_replace('/[^a-z0-9-]+/','-',$slug));
    try {
        $id = run("INSERT INTO pages (title,slug,headline,store_slug) VALUES (?,?,?,?)",
            [$title,$slug,$BODY['headline']??null,$BODY['store_slug']??null]);
        json_ok(['page'=>q1("SELECT * FROM pages WHERE id=?",[$id])]);
    } catch (Exception $e) {
        if (str_contains($e->getMessage(),'UNIQUE')) json_err('Slug already in use',409);
        throw $e;
    }
}
if (preg_match('#^/admin/pages/(\d+)$#', $path, $m)) {
    $user = auth(); $pid = (int)$m[1];
    $page = q1("SELECT * FROM pages WHERE id=?",[$pid]);
    if (!$page) json_err('Page not found',404);
    if ($METHOD === 'GET') json_ok(['page'=>$page]);
    if ($METHOD === 'PUT') {
        require_role($user, $EDIT);
        $slug = strtolower(preg_replace('/[^a-z0-9-]+/','-', $BODY['slug']??$page['slug']));
        try {
            run("UPDATE pages SET title=?,slug=?,headline=?,store_slug=?,is_active=?,theme=?,updated_at=datetime('now') WHERE id=?",
                [$BODY['title']??$page['title'],$slug,$BODY['headline']??$page['headline'],
                 $BODY['store_slug']??$page['store_slug'],$BODY['is_active']??$page['is_active'],
                 $BODY['theme']??$page['theme'],$pid]);
            json_ok(['page'=>q1("SELECT * FROM pages WHERE id=?",[$pid])]);
        } catch (Exception $e) {
            if (str_contains($e->getMessage(),'UNIQUE')) json_err('Slug already in use',409); throw $e;
        }
    }
    if ($METHOD === 'DELETE') {
        require_role($user, $MGR);
        run("DELETE FROM pages WHERE id=?",[$pid]); json_ok();
    }
}
if (preg_match('#^/admin/pages/(\d+)/duplicate$#', $path, $m) && $METHOD === 'POST') {
    $user = auth(); require_role($user, $MGR); $pid = (int)$m[1];
    $src = q1("SELECT * FROM pages WHERE id=?",[$pid]);
    if (!$src) json_err('Page not found',404);
    $newSlug = $src['slug'].'-copy-'.time();
    $newId = run("INSERT INTO pages (title,slug,headline,store_slug,theme) VALUES (?,?,?,?,?)",
        [$src['title'].' (Copy)',$newSlug,$src['headline'],$src['store_slug'],$src['theme']]);
    foreach (q("SELECT * FROM buttons WHERE page_id=? ORDER BY sort_order",[$pid]) as $b) {
        run("INSERT INTO buttons (page_id,label,url,icon,sort_order,is_active,is_featured,enabled,start_at,end_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [$newId,$b['label'],$b['url'],$b['icon'],$b['sort_order'],$b['is_active'],$b['is_featured'],$b['enabled'],$b['start_at'],$b['end_at']]);
    }
    json_ok(['page'=>q1("SELECT * FROM pages WHERE id=?",[$newId])]);
}

// ── BUTTONS ───────────────────────────────────────────────────────────
if (preg_match('#^/admin/pages/(\d+)/buttons$#', $path, $m)) {
    $user = auth(); $pid = (int)$m[1];
    if ($METHOD === 'GET') {
        json_ok(['buttons'=>q("SELECT * FROM buttons WHERE page_id=? ORDER BY sort_order ASC, id ASC",[$pid])]);
    }
    if ($METHOD === 'POST') {
        require_role($user,$EDIT);
        $label=$BODY['label']??''; $url=$BODY['url']??'';
        if (!$label||!$url) json_err('Label and URL required');
        $max = db()->querySingle("SELECT COALESCE(MAX(sort_order),-1) FROM buttons WHERE page_id=$pid");
        $id = run("INSERT INTO buttons (page_id,label,url,icon,sort_order,is_active,is_featured,enabled,start_at,end_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [$pid,$label,$url,$BODY['icon']??null,$BODY['sort_order']??$max+1,
             $BODY['is_active']??1,$BODY['is_featured']??0,$BODY['enabled']??1,
             $BODY['start_at']??null,$BODY['end_at']??null]);
        json_ok(['button'=>q1("SELECT * FROM buttons WHERE id=?",[$id])]);
    }
}
if (preg_match('#^/admin/pages/(\d+)/buttons/reorder$#', $path, $m) && $METHOD === 'PATCH') {
    $user = auth(); require_role($user,$EDIT); $pid=(int)$m[1];
    $order = $BODY['order'] ?? [];
    if (!is_array($order)) json_err('order must be array');
    $stmt = db()->prepare("UPDATE buttons SET sort_order=?,updated_at=datetime('now') WHERE id=? AND page_id=?");
    foreach ($order as $idx=>$bid) { $stmt->bindValue(1,$idx); $stmt->bindValue(2,$bid); $stmt->bindValue(3,$pid); $stmt->execute(); }
    json_ok();
}
if (preg_match('#^/admin/buttons/(\d+)$#', $path, $m)) {
    $user = auth(); $bid=(int)$m[1];
    $btn = q1("SELECT * FROM buttons WHERE id=?",[$bid]);
    if (!$btn) json_err('Button not found',404);
    if ($METHOD === 'PUT') {
        require_role($user,$EDIT);
        run("UPDATE buttons SET label=?,url=?,icon=?,sort_order=?,is_active=?,is_featured=?,enabled=?,start_at=?,end_at=?,updated_at=datetime('now') WHERE id=?",
            [$BODY['label']??$btn['label'],$BODY['url']??$btn['url'],$BODY['icon']??$btn['icon'],
             $BODY['sort_order']??$btn['sort_order'],$BODY['is_active']??$btn['is_active'],
             $BODY['is_featured']??$btn['is_featured'],$BODY['enabled']??$btn['enabled'],
             $BODY['start_at']??$btn['start_at'],$BODY['end_at']??$btn['end_at'],$bid]);
        json_ok(['button'=>q1("SELECT * FROM buttons WHERE id=?",[$bid])]);
    }
    if ($METHOD === 'POST') {
        require_role($user,$EDIT);
        $id=run("INSERT INTO buttons (page_id,label,url,icon,sort_order,is_active,is_featured,enabled,start_at,end_at) VALUES (?,?,?,?,?,0,?,?,?,?)",
            [$btn['page_id'],$btn['label'].' (Copy)',$btn['url'],$btn['icon'],$btn['sort_order']+1,$btn['is_featured'],$btn['enabled'],$btn['start_at'],$btn['end_at']]);
        json_ok(['button'=>q1("SELECT * FROM buttons WHERE id=?",[$id])]);
    }
    if ($METHOD === 'DELETE') {
        require_role($user,$EDIT);
        run("DELETE FROM buttons WHERE id=?",[$bid]); json_ok();
    }
}

// ── REDIRECTS ─────────────────────────────────────────────────────────
if (preg_match('#^/admin/pages/(\d+)/redirects$#', $path, $m)) {
    $user=auth(); require_role($user,$MGR); $pid=(int)$m[1];
    if ($METHOD==='GET') json_ok(['redirects'=>q("SELECT * FROM redirects WHERE page_id=? ORDER BY id DESC",[$pid])]);
    if ($METHOD==='POST') {
        $src=$BODY['source']??''; $dst=$BODY['destination']??'';
        if (!$src||!$dst) json_err('Source and destination required');
        $id=run("INSERT INTO redirects (page_id,source,destination,is_permanent) VALUES (?,?,?,?)",[$pid,$src,$dst,$BODY['is_permanent']??0]);
        json_ok(['redirect'=>q1("SELECT * FROM redirects WHERE id=?",[$id])]);
    }
}
if (preg_match('#^/admin/redirects/(\d+)$#', $path, $m) && $METHOD==='DELETE') {
    $user=auth(); require_role($user,$MGR);
    run("DELETE FROM redirects WHERE id=?",[(int)$m[1]]); json_ok();
}

// ── SHORTLINKS ────────────────────────────────────────────────────────
if ($path==='/admin/shortlinks') {
    $user=auth(); require_role($user,$MGR);
    if ($METHOD==='GET') json_ok(['shortlinks'=>q("SELECT * FROM shortlinks ORDER BY created_at DESC")]);
    if ($METHOD==='POST') {
        $code=$BODY['code']??''; $dst=$BODY['destination']??'';
        if (!$code||!$dst) json_err('Code and destination required');
        try {
            $id=run("INSERT INTO shortlinks (code,destination,label,utm_source,utm_medium,utm_campaign) VALUES (?,?,?,?,?,?)",
                [$code,$dst,$BODY['label']??null,$BODY['utm_source']??null,$BODY['utm_medium']??null,$BODY['utm_campaign']??null]);
            json_ok(['shortlink'=>q1("SELECT * FROM shortlinks WHERE id=?",[$id])]);
        } catch(Exception $e){ if(str_contains($e->getMessage(),'UNIQUE'))json_err('Code already in use',409); throw $e;}
    }
}
if (preg_match('#^/admin/shortlinks/(\d+)$#',$path,$m) && $METHOD==='DELETE') {
    $user=auth(); require_role($user,$MGR);
    run("DELETE FROM shortlinks WHERE id=?",[(int)$m[1]]); json_ok();
}

// ── ANALYTICS ─────────────────────────────────────────────────────────
if ($path==='/admin/analytics' && $METHOD==='GET') {
    $user=auth(); require_role($user,$MGR);
    $days=min(max((int)($QUERY['period']??7),1),365);
    json_ok([
        'clicks'    => q("SELECT DATE(created_at) AS date, COUNT(*) AS count FROM analytics WHERE event_type='click' AND created_at>=datetime('now','-{$days} days') GROUP BY DATE(created_at) ORDER BY date ASC"),
        'topButtons'=> q("SELECT b.label,b.url,COUNT(*) AS clicks FROM analytics a JOIN buttons b ON a.button_id=b.id WHERE a.event_type='click' AND a.created_at>=datetime('now','-{$days} days') GROUP BY a.button_id ORDER BY clicks DESC LIMIT 10"),
        'byPage'    => q("SELECT p.title,p.slug,COUNT(*) AS clicks FROM analytics a JOIN pages p ON a.page_id=p.id WHERE a.event_type='click' AND a.created_at>=datetime('now','-{$days} days') GROUP BY a.page_id ORDER BY clicks DESC"),
        'period'    => $days,
    ]);
}
if (preg_match('#^/admin/pages/(\d+)/analytics$#',$path,$m) && $METHOD==='GET') {
    $user=auth(); $pid=(int)$m[1];
    $days=min(max((int)($QUERY['period']??7),1),365);
    json_ok([
        'clicks'  => db()->querySingle("SELECT COUNT(*) FROM analytics WHERE page_id=$pid AND event_type='click' AND created_at>=datetime('now','-{$days} days')"),
        'byButton'=> q("SELECT b.label,COUNT(*) AS clicks FROM analytics a JOIN buttons b ON a.button_id=b.id WHERE a.page_id=? AND a.event_type='click' AND a.created_at>=datetime('now','-{$days} days') GROUP BY a.button_id ORDER BY clicks DESC",[$pid]),
        'period'  => $days,
    ]);
}

// ── SUBSCRIBERS ───────────────────────────────────────────────────────
if ($path==='/admin/subscribers' && $METHOD==='GET') {
    $user=auth(); require_role($user,$MGR);
    json_ok(['subscribers'=>q("SELECT * FROM subscribers ORDER BY created_at DESC")]);
}
if ($path==='/admin/subscribers/export' && $METHOD==='GET') {
    $user=auth(); require_role($user,$MGR);
    $rows=q("SELECT email,name,source,created_at FROM subscribers WHERE is_active=1 ORDER BY created_at DESC");
    $csv="email,name,source,subscribed_at\n";
    foreach($rows as $r) $csv.="\"{$r['email']}\",\"{$r['name']}\",\"{$r['source']}\",\"{$r['created_at']}\"\n";
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="subscribers.csv"');
    echo $csv; exit;
}

// ── USERS ─────────────────────────────────────────────────────────────
if ($path==='/admin/users') {
    $user=auth(); require_role($user,$MGR);
    if ($METHOD==='GET') json_ok(['users'=>q("SELECT id,email,name,role,store_slug,is_active,created_at FROM users ORDER BY created_at DESC")]);
    if ($METHOD==='POST') {
        require_role($user,['super_admin']);
        $email=$BODY['email']??''; $role=$BODY['role']??''; $pass=$BODY['password']??'';
        if(!$email||!$role||!$pass) json_err('Email, role, and password required');
        $valid=['super_admin','marketing_manager','store_manager','viewer'];
        if(!in_array($role,$valid)) json_err('Invalid role');
        try {
            $id=run("INSERT INTO users (email,password_hash,name,role,store_slug) VALUES (?,?,?,?,?)",
                [strtolower(trim($email)),password_hash($pass,PASSWORD_BCRYPT),$BODY['name']??null,$role,$BODY['store_slug']??null]);
            json_ok(['user'=>q1("SELECT id,email,name,role,store_slug,is_active,created_at FROM users WHERE id=?",[$id])]);
        } catch(Exception $e){ if(str_contains($e->getMessage(),'UNIQUE'))json_err('Email already in use',409); throw $e;}
    }
}
if (preg_match('#^/admin/users/(\d+)$#',$path,$m)) {
    $user=auth(); require_role($user,['super_admin']); $uid=(int)$m[1];
    $target=q1("SELECT * FROM users WHERE id=?",[$uid]);
    if(!$target) json_err('User not found',404);
    if ($METHOD==='PUT') {
        run("UPDATE users SET name=?,role=?,store_slug=?,is_active=?,updated_at=datetime('now') WHERE id=?",
            [$BODY['name']??$target['name'],$BODY['role']??$target['role'],$BODY['store_slug']??$target['store_slug'],$BODY['is_active']??$target['is_active'],$uid]);
        json_ok(['user'=>q1("SELECT id,email,name,role,store_slug,is_active,created_at FROM users WHERE id=?",[$uid])]);
    }
    if ($METHOD==='DELETE') {
        if ($uid===$user['id']) json_err('Cannot delete your own account');
        run("DELETE FROM users WHERE id=?",[$uid]); json_ok();
    }
}

// ── SETTINGS ──────────────────────────────────────────────────────────
if ($path==='/admin/settings') {
    $user=auth(); require_role($user,$MGR);
    if ($METHOD==='GET') {
        $rows=q("SELECT key,value FROM settings");
        $settings=[]; foreach($rows as $r) $settings[$r['key']]=$r['value'];
        json_ok(['settings'=>$settings]);
    }
    if ($METHOD==='PUT') {
        $stmt=db()->prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,datetime('now'))");
        foreach ($BODY as $k=>$v){ $stmt->bindValue(1,$k); $stmt->bindValue(2,(string)$v); $stmt->execute(); }
        json_ok();
    }
}

// ── BLOG (admin) ──────────────────────────────────────────────────────
if ($path==='/blog' || $path==='/blog/') {
    $user=auth();
    if ($METHOD==='GET') {
        $status=$QUERY['status']??null;
        $search=$QUERY['q']??null;
        $limit=(int)($QUERY['limit']??50);
        $offset=(int)($QUERY['offset']??0);
        $where=['archived_at IS NULL']; $params=[];
        if ($status && $status!=='all') { $where[]='status=?'; $params[]=$status; }
        if ($search) { $where[]="(title LIKE ? OR excerpt LIKE ? OR category LIKE ?)"; $s="%$search%"; $params[]=$s; $params[]=$s; $params[]=$s; }
        $wSql=$where ? 'WHERE '.implode(' AND ',$where) : '';
        $total=db()->querySingle("SELECT COUNT(*) FROM blog_posts $wSql", ...($params ? [] : []));
        // Count separately
        $cStmt=db()->prepare("SELECT COUNT(*) FROM blog_posts $wSql");
        foreach ($params as $i=>$p) $cStmt->bindValue($i+1,$p);
        $total=$cStmt->execute()->fetchArray()[0];
        $posts=q("SELECT id,title,slug,status,category,tags,excerpt,cover_image,og_image,author_id,reading_time,published_at,scheduled_at,created_at,updated_at FROM blog_posts $wSql ORDER BY created_at DESC LIMIT $limit OFFSET $offset", $params);
        json_ok(['posts'=>$posts,'total'=>$total]);
    }
    if ($METHOD==='POST') {
        require_role($user,['super_admin','marketing_manager']);
        $title=$BODY['title']??''; if(!$title) json_err('Title required');
        $slug=preg_replace('/[^a-z0-9]+/','-',strtolower($title)).'-'.time();
        if (!empty($BODY['slug'])) $slug=preg_replace('/[^a-z0-9-]+/','-',strtolower($BODY['slug']));
        $st=$BODY['status']??'draft';
        $pub=$st==='published'?(new DateTime())->format('Y-m-d H:i:s'):null;
        $words=str_word_count(strip_tags($BODY['content']??''));
        $rt=max(1,(int)round($words/200));
        $id=run("INSERT INTO blog_posts (title,slug,status,content,tiptap_json,excerpt,cover_image,og_image,category,tags,seo_title,seo_description,author_id,published_at,scheduled_at,reading_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [$title,$slug,$st,$BODY['content']??null,
             is_array($BODY['tiptap_json']??null)?json_encode($BODY['tiptap_json']):($BODY['tiptap_json']??null),
             $BODY['excerpt']??null,$BODY['cover_image']??null,$BODY['og_image']??null,
             $BODY['category']??null,$BODY['tags']??null,
             $BODY['seo_title']??null,$BODY['seo_description']??null,
             $user['id'],$pub,$BODY['scheduled_at']??null,$rt]);
        json_ok(['post'=>q1("SELECT * FROM blog_posts WHERE id=?",[$id])]);
    }
}
if (preg_match('#^/blog/(\d+)$#',$path,$m)) {
    $user=auth(); $bid=(int)$m[1];
    $post=q1("SELECT * FROM blog_posts WHERE id=?",[$bid]);
    if(!$post) json_err('Post not found',404);
    if ($METHOD==='GET') json_ok(['post'=>$post]);
    if ($METHOD==='PUT') {
        require_role($user,['super_admin','marketing_manager']);
        $st=$BODY['status']??$post['status'];
        $pub=$post['published_at']; if($st==='published'&&!$pub) $pub=(new DateTime())->format('Y-m-d H:i:s');
        $words=str_word_count(strip_tags($BODY['content']??$post['content']??''));
        $rt=max(1,(int)round($words/200));
        $slug=$post['slug'];
        if(!empty($BODY['slug'])) $slug=preg_replace('/[^a-z0-9-]+/','-',strtolower($BODY['slug']));
        try {
            run("UPDATE blog_posts SET title=?,slug=?,content=?,tiptap_json=?,excerpt=?,cover_image=?,og_image=?,category=?,tags=?,seo_title=?,seo_description=?,status=?,scheduled_at=?,published_at=?,reading_time=?,updated_at=datetime('now') WHERE id=?",
                [$BODY['title']??$post['title'],$slug,
                 $BODY['content']??$post['content'],
                 is_array($BODY['tiptap_json']??null)?json_encode($BODY['tiptap_json']):($BODY['tiptap_json']??$post['tiptap_json']),
                 $BODY['excerpt']??$post['excerpt'],$BODY['cover_image']??$post['cover_image'],
                 $BODY['og_image']??$post['og_image'],$BODY['category']??$post['category'],
                 $BODY['tags']??$post['tags'],$BODY['seo_title']??$post['seo_title'],
                 $BODY['seo_description']??$post['seo_description'],
                 $st,$BODY['scheduled_at']??$post['scheduled_at'],$pub,$rt,$bid]);
        } catch(Exception $e){ if(str_contains($e->getMessage(),'UNIQUE'))json_err('Slug already in use',409); throw $e; }
        json_ok(['post'=>q1("SELECT * FROM blog_posts WHERE id=?",[$bid])]);
    }
    if ($METHOD==='DELETE') {
        require_role($user,['super_admin','marketing_manager']);
        run("UPDATE blog_posts SET status='archived',archived_at=datetime('now'),updated_at=datetime('now') WHERE id=?",[$bid]); json_ok();
    }
}

// ── IMAGE UPLOAD ──────────────────────────────────────────────────────
if ($path==='/upload' && $METHOD==='POST') {
    $user=auth(); require_role($user,['super_admin','marketing_manager','store_manager']);
    if (empty($_FILES['file'])) json_err('No file provided');
    $file=$_FILES['file'];
    if ($file['error']!==UPLOAD_ERR_OK) json_err('Upload error: '.$file['error']);
    $maxBytes=10*1024*1024;
    if ($file['size']>$maxBytes) json_err('File too large (max 10 MB)');
    $allowed=['image/jpeg','image/png','image/gif','image/webp'];
    $mime=mime_content_type($file['tmp_name']);
    if (!in_array($mime,$allowed)) json_err('Invalid file type. Allowed: JPEG, PNG, GIF, WEBP');
    $extMap=['image/jpeg'=>'jpg','image/png'=>'png','image/gif'=>'gif','image/webp'=>'webp'];
    $ext=$extMap[$mime];
    $subdir=date('Y/m').'/';
    $dir=UPLOAD_DIR.$subdir;
    if (!is_dir($dir)) mkdir($dir,0755,true);
    $safe=preg_replace('/[^a-z0-9\-]/','',strtolower(pathinfo($file['name'],PATHINFO_FILENAME)));
    $safe=trim($safe,'-') ?: 'image';
    $name=uniqid().'_'.$safe.'.'.$ext;
    $dest=$dir.$name;
    if (!move_uploaded_file($file['tmp_name'],$dest)) json_err('Failed to save file');
    json_ok(['url'=>UPLOAD_URL.$subdir.$name,'filename'=>$name,'size'=>$file['size'],'mime'=>$mime]);
}

// ── SITEMAP ───────────────────────────────────────────────────────────
if ($path==='/sitemap.xml' && $METHOD==='GET') {
    $posts=q("SELECT slug,updated_at FROM blog_posts WHERE status='published' AND archived_at IS NULL ORDER BY published_at DESC");
    $static=['','menu.html','locations.html','order.html','about.html','happy-hour.html','blog.html','links/'];
    header('Content-Type: application/xml; charset=utf-8');
    echo '<?xml version="1.0" encoding="UTF-8"?>'."\n";
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n";
    foreach ($static as $s) {
        echo "  <url><loc>".SITE_URL."/$s</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n";
    }
    foreach ($posts as $p) {
        $mod=date('Y-m-d',strtotime($p['updated_at']));
        echo "  <url><loc>".SITE_URL."/stories/{$p['slug']}</loc><lastmod>$mod</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n";
    }
    echo '</urlset>';
    exit;
}

// ── PUBLIC ────────────────────────────────────────────────────────────
if ($path==='/public/pages/all' && $METHOD==='GET') {
    json_ok(['pages'=>q("SELECT id,title,slug,headline,store_slug FROM pages WHERE is_active=1 ORDER BY sort_order ASC, id ASC")]);
}
if (preg_match('#^/public/pages/(.+)$#',$path,$m) && $METHOD==='GET') {
    $slug=$m[1];
    $page=q1("SELECT * FROM pages WHERE slug=? AND is_active=1",[$slug]);
    if(!$page) json_err('Page not found',404);
    $now=(new DateTime())->format('Y-m-d H:i:s');
    $buttons=q("SELECT * FROM buttons WHERE page_id=? AND is_active=1 AND enabled=1 AND (start_at IS NULL OR start_at<=?) AND (end_at IS NULL OR end_at>=?) ORDER BY sort_order ASC, id ASC",[$page['id'],$now,$now]);
    run("INSERT INTO analytics (page_id,event_type,referrer,user_agent,ip) VALUES (?,?,?,?,?)",
        [$page['id'],'pageview',$_SERVER['HTTP_REFERER']??null,$_SERVER['HTTP_USER_AGENT']??null,$_SERVER['REMOTE_ADDR']??null]);
    json_ok(['page'=>$page,'buttons'=>$buttons]);
}
if ($path==='/public/track' && $METHOD==='POST') {
    run("INSERT INTO analytics (page_id,button_id,shortlink_id,event_type,referrer,user_agent,ip) VALUES (?,?,?,?,?,?,?)",
        [$BODY['page_id']??null,$BODY['button_id']??null,$BODY['shortlink_id']??null,$BODY['event_type']??'click',$_SERVER['HTTP_REFERER']??null,$_SERVER['HTTP_USER_AGENT']??null,$_SERVER['REMOTE_ADDR']??null]);
    json_ok();
}
if ($path==='/public/subscribe' && $METHOD==='POST') {
    $email=strtolower(trim($BODY['email']??''));
    if(!$email||!filter_var($email,FILTER_VALIDATE_EMAIL)) json_err('Valid email required');
    try { run("INSERT INTO subscribers (email,name,source) VALUES (?,?,?)",[$email,$BODY['name']??null,$BODY['source']??null]); } catch(Exception $e){}
    json_ok();
}
if (preg_match('#^/public/shortlinks/(.+)$#',$path,$m) && $METHOD==='GET') {
    $sl=q1("SELECT * FROM shortlinks WHERE code=? AND is_active=1",[$m[1]]);
    if(!$sl){ json_err('Not found',404); }
    run("UPDATE shortlinks SET clicks=clicks+1,updated_at=datetime('now') WHERE id=?",[$sl['id']]);
    run("INSERT INTO analytics (shortlink_id,event_type,referrer,user_agent,ip) VALUES (?,?,?,?,?)",[$sl['id'],'click',$_SERVER['HTTP_REFERER']??null,$_SERVER['HTTP_USER_AGENT']??null,$_SERVER['REMOTE_ADDR']??null]);
    header('Content-Type: text/html'); http_response_code(302);
    header('Location: '.$sl['destination']); exit;
}

// Legacy public posts endpoints
if ($path==='/public/posts' && $METHOD==='GET') {
    json_ok(['posts'=>q("SELECT id,title,slug,excerpt,cover_image,category,tags,reading_time,published_at FROM blog_posts WHERE status='published' AND archived_at IS NULL ORDER BY published_at DESC LIMIT 20")]);
}
if (preg_match('#^/public/posts/(.+)$#',$path,$m) && $METHOD==='GET') {
    $post=q1("SELECT id,title,slug,content,excerpt,cover_image,og_image,category,tags,seo_title,seo_description,reading_time,published_at FROM blog_posts WHERE slug=? AND status='published' AND archived_at IS NULL",[$m[1]]);
    if(!$post) json_err('Post not found',404);
    json_ok(['post'=>$post]);
}

// Public stories endpoints (new canonical paths)
if ($path==='/public/stories' && $METHOD==='GET') {
    $limit=(int)($QUERY['limit']??12);
    $offset=(int)($QUERY['offset']??0);
    $category=$QUERY['category']??null;
    $where=['status=\'published\'','archived_at IS NULL']; $params=[];
    if ($category) { $where[]='category=?'; $params[]=$category; }
    $wSql='WHERE '.implode(' AND ',$where);
    $cStmt=db()->prepare("SELECT COUNT(*) FROM blog_posts $wSql");
    foreach ($params as $i=>$p) $cStmt->bindValue($i+1,$p);
    $total=$cStmt->execute()->fetchArray()[0];
    $posts=q("SELECT id,title,slug,excerpt,cover_image,og_image,category,tags,reading_time,published_at FROM blog_posts $wSql ORDER BY published_at DESC LIMIT $limit OFFSET $offset",$params);
    $cats=q("SELECT DISTINCT category FROM blog_posts WHERE status='published' AND archived_at IS NULL AND category IS NOT NULL ORDER BY category ASC");
    json_ok(['posts'=>$posts,'total'=>$total,'categories'=>array_column($cats,'category')]);
}
if (preg_match('#^/public/stories/(.+)$#',$path,$m) && $METHOD==='GET') {
    $post=q1("SELECT id,title,slug,content,excerpt,cover_image,og_image,category,tags,seo_title,seo_description,reading_time,published_at,updated_at FROM blog_posts WHERE slug=? AND status='published' AND archived_at IS NULL",[$m[1]]);
    if(!$post) json_err('Post not found',404);
    $related=q("SELECT id,title,slug,excerpt,cover_image,category,reading_time,published_at FROM blog_posts WHERE status='published' AND archived_at IS NULL AND id!=? AND (category=? OR category IS NULL) ORDER BY published_at DESC LIMIT 3",[$post['id'],$post['category']??'']);
    json_ok(['post'=>$post,'related'=>$related]);
}

// ── 404 ───────────────────────────────────────────────────────────────
json_err('Not found', 404);
