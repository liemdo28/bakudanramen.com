<?php
defined('ABSPATH') || exit;

/* ─── JWT helpers ─────────────────────────────────────────────────── */

function bkdn_jwt_secret(): string {
    $s = get_option('bkdn_jwt_secret');
    if (!$s) {
        $s = bin2hex(random_bytes(32));
        update_option('bkdn_jwt_secret', $s);
    }
    return $s;
}

function bkdn_jwt_create(array $payload): string {
    $secret = bkdn_jwt_secret();
    $h = rtrim(strtr(base64_encode(json_encode(['typ'=>'JWT','alg'=>'HS256'])), '+/', '-_'), '=');
    $b = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
    $s = rtrim(strtr(base64_encode(hash_hmac('sha256', "$h.$b", $secret, true)), '+/', '-_'), '=');
    return "$h.$b.$s";
}

function bkdn_jwt_verify(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $b, $s] = $parts;
    $secret   = bkdn_jwt_secret();
    $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "$h.$b", $secret, true)), '+/', '-_'), '=');
    if (!hash_equals($expected, $s)) return null;
    $payload = json_decode(base64_decode(strtr($b, '-_', '+/')), true);
    if (!$payload) return null;
    if (isset($payload['exp']) && $payload['exp'] < time()) return null;
    return $payload;
}

/* ─── Admin user queries ──────────────────────────────────────────── */

function bkdn_auth_get_user_by_email(string $email): ?array {
    global $wpdb;
    return $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "admin_users WHERE email = %s AND is_active = 1",
        $email
    ), ARRAY_A) ?: null;
}

function bkdn_auth_get_user_by_id(int $id): ?array {
    global $wpdb;
    return $wpdb->get_row($wpdb->prepare(
        "SELECT id, name, email, role, store_slug, is_active, last_login FROM "
        . bkdn_pfx() . "admin_users WHERE id = %d AND is_active = 1",
        $id
    ), ARRAY_A) ?: null;
}

function bkdn_auth_user_from_request(WP_REST_Request $req): ?array {
    $auth = $req->get_header('authorization');
    if (!$auth || !str_starts_with($auth, 'Bearer ')) return null;
    $payload = bkdn_jwt_verify(substr($auth, 7));
    if (!$payload || empty($payload['uid'])) return null;
    return bkdn_auth_get_user_by_id((int)$payload['uid']);
}

/**
 * Permission callback factory.
 * Returns a closure that checks token validity AND role.
 */
function bkdn_perm(array $roles = []): Closure {
    return function (WP_REST_Request $req) use ($roles): bool|WP_Error {
        $user = bkdn_auth_user_from_request($req);
        if (!$user) return new WP_Error('unauthorized', 'Authentication required.', ['status' => 401]);
        if (!empty($roles) && !in_array($user['role'], $roles, true)) {
            return new WP_Error('forbidden', 'Insufficient permissions.', ['status' => 403]);
        }
        return true;
    };
}

function bkdn_all_roles(): array {
    return ['super_admin','marketing_manager','store_manager','viewer'];
}

/* ─── REST: auth endpoints ────────────────────────────────────────── */

add_action('rest_api_init', function () {

    // Login
    register_rest_route('bkdn/v1', '/auth/login', [
        'methods'             => 'POST',
        'callback'            => 'bkdn_rest_login',
        'permission_callback' => '__return_true',
    ]);

    // Me
    register_rest_route('bkdn/v1', '/auth/me', [
        'methods'             => 'GET',
        'callback'            => 'bkdn_rest_me',
        'permission_callback' => bkdn_perm(bkdn_all_roles()),
    ]);

    // Change own password
    register_rest_route('bkdn/v1', '/auth/change-password', [
        'methods'             => 'POST',
        'callback'            => 'bkdn_rest_change_password',
        'permission_callback' => bkdn_perm(bkdn_all_roles()),
    ]);
});

function bkdn_rest_login(WP_REST_Request $req): WP_REST_Response {
    $email    = sanitize_email($req->get_param('email') ?? '');
    $password = (string)($req->get_param('password') ?? '');

    $user = bkdn_auth_get_user_by_email($email);
    if (!$user || !password_verify($password, $user['password_hash'])) {
        return new WP_REST_Response(['success' => false, 'message' => 'Invalid email or password.'], 401);
    }

    // Update last_login
    global $wpdb;
    $wpdb->update(bkdn_pfx() . 'admin_users', ['last_login' => current_time('mysql')], ['id' => $user['id']]);

    $token = bkdn_jwt_create([
        'uid'  => $user['id'],
        'role' => $user['role'],
        'iat'  => time(),
        'exp'  => time() + 86400, // 24 hours
    ]);

    return new WP_REST_Response([
        'success' => true,
        'token'   => $token,
        'user'    => [
            'id'         => $user['id'],
            'name'       => $user['name'],
            'email'      => $user['email'],
            'role'       => $user['role'],
            'store_slug' => $user['store_slug'],
        ],
    ], 200);
}

function bkdn_rest_me(WP_REST_Request $req): WP_REST_Response {
    $user = bkdn_auth_user_from_request($req);
    return new WP_REST_Response(['success' => true, 'user' => $user], 200);
}

function bkdn_rest_change_password(WP_REST_Request $req): WP_REST_Response {
    global $wpdb;
    $user        = bkdn_auth_user_from_request($req);
    $current_pwd = (string)($req->get_param('current_password') ?? '');
    $new_pwd     = (string)($req->get_param('new_password')     ?? '');

    if (strlen($new_pwd) < 8) {
        return new WP_REST_Response(['success' => false, 'message' => 'Password must be at least 8 characters.'], 400);
    }

    $full_user = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "admin_users WHERE id = %d", $user['id']
    ), ARRAY_A);

    if (!password_verify($current_pwd, $full_user['password_hash'])) {
        return new WP_REST_Response(['success' => false, 'message' => 'Current password is incorrect.'], 400);
    }

    $wpdb->update(bkdn_pfx() . 'admin_users',
        ['password_hash' => password_hash($new_pwd, PASSWORD_BCRYPT)],
        ['id' => $user['id']]
    );

    return new WP_REST_Response(['success' => true], 200);
}

/* ─── Admin user management (super_admin only) ───────────────────── */

add_action('rest_api_init', function () {
    register_rest_route('bkdn/v1', '/admin/users', [
        ['methods' => 'GET',  'callback' => 'bkdn_rest_list_users',   'permission_callback' => bkdn_perm(['super_admin'])],
        ['methods' => 'POST', 'callback' => 'bkdn_rest_create_user',  'permission_callback' => bkdn_perm(['super_admin'])],
    ]);
    register_rest_route('bkdn/v1', '/admin/users/(?P<id>\d+)', [
        ['methods' => 'PUT',    'callback' => 'bkdn_rest_update_user', 'permission_callback' => bkdn_perm(['super_admin'])],
        ['methods' => 'DELETE', 'callback' => 'bkdn_rest_delete_user', 'permission_callback' => bkdn_perm(['super_admin'])],
    ]);
});

function bkdn_rest_list_users(WP_REST_Request $req): WP_REST_Response {
    global $wpdb;
    $rows = $wpdb->get_results(
        "SELECT id, name, email, role, store_slug, is_active, last_login, created_at FROM "
        . bkdn_pfx() . "admin_users ORDER BY created_at DESC",
        ARRAY_A
    ) ?: [];
    return new WP_REST_Response(['success' => true, 'users' => $rows], 200);
}

function bkdn_rest_create_user(WP_REST_Request $req): WP_REST_Response {
    global $wpdb;
    $email = sanitize_email($req->get_param('email') ?? '');
    $pwd   = (string)($req->get_param('password') ?? '');
    if (!is_email($email) || strlen($pwd) < 8) {
        return new WP_REST_Response(['success' => false, 'message' => 'Invalid email or password too short.'], 400);
    }
    $exists = $wpdb->get_var($wpdb->prepare("SELECT id FROM ".bkdn_pfx()."admin_users WHERE email=%s", $email));
    if ($exists) return new WP_REST_Response(['success' => false, 'message' => 'Email already exists.'], 409);

    $wpdb->insert(bkdn_pfx() . 'admin_users', [
        'name'          => sanitize_text_field($req->get_param('name') ?? ''),
        'email'         => $email,
        'password_hash' => password_hash($pwd, PASSWORD_BCRYPT),
        'role'          => sanitize_text_field($req->get_param('role') ?? 'viewer'),
        'store_slug'    => sanitize_text_field($req->get_param('store_slug') ?? '') ?: null,
        'is_active'     => 1,
    ]);
    return new WP_REST_Response(['success' => true, 'id' => $wpdb->insert_id], 201);
}

function bkdn_rest_update_user(WP_REST_Request $req): WP_REST_Response {
    global $wpdb;
    $id  = (int)$req->get_param('id');
    $row = ['name' => sanitize_text_field($req->get_param('name') ?? ''),
            'role' => sanitize_text_field($req->get_param('role') ?? 'viewer'),
            'store_slug' => sanitize_text_field($req->get_param('store_slug') ?? '') ?: null,
            'is_active'  => (int)(bool)$req->get_param('is_active')];
    if ($pwd = $req->get_param('password')) {
        if (strlen($pwd) >= 8) $row['password_hash'] = password_hash($pwd, PASSWORD_BCRYPT);
    }
    $wpdb->update(bkdn_pfx() . 'admin_users', $row, ['id' => $id]);
    return new WP_REST_Response(['success' => true], 200);
}

function bkdn_rest_delete_user(WP_REST_Request $req): WP_REST_Response {
    global $wpdb;
    $wpdb->delete(bkdn_pfx() . 'admin_users', ['id' => (int)$req->get_param('id')]);
    return new WP_REST_Response(['success' => true], 200);
}
