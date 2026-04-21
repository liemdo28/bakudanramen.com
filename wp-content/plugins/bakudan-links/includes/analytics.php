<?php
defined('ABSPATH') || exit;

function bkdn_parse_device_type(string $ua): string {
    $ua = strtolower($ua);
    if (str_contains($ua, 'tablet') || str_contains($ua, 'ipad'))  return 'tablet';
    if (str_contains($ua, 'mobile') || str_contains($ua, 'android') || str_contains($ua, 'iphone')) return 'mobile';
    return 'desktop';
}

function bkdn_hash_ip(string $ip): string {
    return hash('sha256', $ip . (defined('AUTH_SALT') ? AUTH_SALT : ''));
}

function bkdn_get_client_ip(): string {
    foreach (['HTTP_CF_CONNECTING_IP','HTTP_X_FORWARDED_FOR','HTTP_X_REAL_IP','REMOTE_ADDR'] as $key) {
        if (!empty($_SERVER[$key])) {
            return trim(explode(',', $_SERVER[$key])[0]);
        }
    }
    return '';
}

/* ─── REST handler: POST /bkdn/v1/track ─────────────────────────── */

add_action('rest_api_init', function () {
    register_rest_route('bkdn/v1', '/track', [
        'methods'             => 'POST',
        'callback'            => 'bkdn_rest_track',
        'permission_callback' => '__return_true',
    ]);
});

function bkdn_rest_track(WP_REST_Request $req): WP_REST_Response {
    $type    = sanitize_text_field($req->get_param('type') ?? 'view');
    $page_id = (int)$req->get_param('page_id');
    $btn_id  = (int)$req->get_param('button_id');

    if (!in_array($type, ['view','click'], true) || !$page_id) {
        return new WP_REST_Response(['success' => false], 400);
    }

    $ua      = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $ip      = bkdn_get_client_ip();
    $session = substr(md5($ip . $ua . gmdate('Y-m-d-H')), 0, 16);

    bkdn_track_event([
        'page_id'     => $page_id,
        'button_id'   => $btn_id ?: null,
        'event_type'  => $type,
        'referrer'    => isset($_SERVER['HTTP_REFERER']) ? esc_url_raw(wp_unslash($_SERVER['HTTP_REFERER'])) : null,
        'device_type' => bkdn_parse_device_type($ua),
        'utm_source'  => sanitize_text_field($req->get_param('utm_source')   ?? ''),
        'utm_medium'  => sanitize_text_field($req->get_param('utm_medium')   ?? ''),
        'utm_campaign'=> sanitize_text_field($req->get_param('utm_campaign') ?? ''),
        'ip_hash'     => $ip ? bkdn_hash_ip($ip) : null,
        'session_id'  => $session,
    ]);

    return new WP_REST_Response(['success' => true], 200);
}
