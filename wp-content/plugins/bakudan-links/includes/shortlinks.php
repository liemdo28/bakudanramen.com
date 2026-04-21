<?php
defined('ABSPATH') || exit;

/**
 * Handles /go/{shortSlug}:
 *   1. Look up shortlink
 *   2. Build final URL (append UTM params)
 *   3. Log click + increment counter
 *   4. Issue redirect
 */
function bkdn_handle_shortlink(string $slug): void {
    $link = bkdn_get_shortlink($slug);

    if (!$link) {
        status_header(404);
        echo bkdn_render_404();
        exit;
    }

    // Build destination with UTM params
    $target = $link['target_url'];
    $params = [];
    if (!empty($link['utm_source']))   $params['utm_source']   = $link['utm_source'];
    if (!empty($link['utm_medium']))   $params['utm_medium']   = $link['utm_medium'];
    if (!empty($link['utm_campaign'])) $params['utm_campaign'] = $link['utm_campaign'];

    if (!empty($params)) {
        $sep    = (str_contains($target, '?')) ? '&' : '?';
        $target = $target . $sep . http_build_query($params);
    }

    // Log click
    $ua      = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $ip      = bkdn_get_client_ip();
    bkdn_track_event([
        'shortlink_id' => (int)$link['id'],
        'event_type'   => 'shortlink_click',
        'referrer'     => isset($_SERVER['HTTP_REFERER']) ? esc_url_raw(wp_unslash($_SERVER['HTTP_REFERER'])) : null,
        'device_type'  => bkdn_parse_device_type($ua),
        'utm_source'   => $link['utm_source']   ?? null,
        'utm_medium'   => $link['utm_medium']   ?? null,
        'utm_campaign' => $link['utm_campaign'] ?? null,
        'ip_hash'      => $ip ? bkdn_hash_ip($ip) : null,
    ]);
    bkdn_increment_shortlink_clicks((int)$link['id']);

    // Redirect (302 by default — preserves analytics; 301 only if explicitly set)
    wp_redirect($target, 302);
    exit;
}
