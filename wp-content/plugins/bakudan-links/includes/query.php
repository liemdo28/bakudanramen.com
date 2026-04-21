<?php
defined('ABSPATH') || exit;

/* ─── Helpers ─────────────────────────────────────────────────────── */

function bkdn_pfx(): string {
    global $wpdb;
    return $wpdb->prefix . 'bkdn_';
}

function bkdn_now(): string {
    return current_time('mysql');
}

/* ─── Pages ───────────────────────────────────────────────────────── */

function bkdn_get_page_by_slug(string $slug): ?array {
    global $wpdb;
    $pfx  = bkdn_pfx();
    $now  = bkdn_now();
    $page = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM {$pfx}pages
         WHERE slug = %s AND is_active = 1
           AND (published_at IS NULL OR published_at <= %s)
           AND (expires_at   IS NULL OR expires_at   >  %s)",
        $slug, $now, $now
    ), ARRAY_A);

    if (!$page) return null;

    $page['theme'] = $page['theme_json']
        ? json_decode($page['theme_json'], true)
        : bkdn_default_theme();

    $page['buttons'] = bkdn_get_page_buttons((int) $page['id']);

    return $page;
}

function bkdn_get_all_pages(): array {
    global $wpdb;
    return $wpdb->get_results(
        "SELECT * FROM " . bkdn_pfx() . "pages ORDER BY store_slug ASC, slug ASC",
        ARRAY_A
    ) ?: [];
}

function bkdn_get_page_by_id(int $id): ?array {
    global $wpdb;
    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "pages WHERE id = %d", $id
    ), ARRAY_A);
    if (!$row) return null;
    $row['theme'] = $row['theme_json'] ? json_decode($row['theme_json'], true) : bkdn_default_theme();
    return $row;
}

function bkdn_upsert_page(array $data): int {
    global $wpdb;
    $pfx = bkdn_pfx();
    $allowed = ['slug','title','headline','subheadline','store_slug','seo_desc',
                'logo_path','hero_image_path','og_image_path','theme_json',
                'campaign_name','is_active','published_at','expires_at'];
    $row = array_intersect_key($data, array_flip($allowed));

    if (!empty($data['id'])) {
        $wpdb->update("{$pfx}pages", $row, ['id' => (int)$data['id']]);
        return (int)$data['id'];
    }
    $wpdb->insert("{$pfx}pages", $row);
    return (int)$wpdb->insert_id;
}

function bkdn_delete_page(int $id): void {
    global $wpdb;
    $pfx = bkdn_pfx();
    $wpdb->delete("{$pfx}buttons",         ['page_id' => $id]);
    $wpdb->delete("{$pfx}redirect_rules",  ['page_id' => $id]);
    $wpdb->delete("{$pfx}pages",           ['id'      => $id]);
}

/* ─── Buttons ─────────────────────────────────────────────────────── */

function bkdn_get_page_buttons(int $page_id): array {
    global $wpdb;
    $now = bkdn_now();
    return $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "buttons
         WHERE page_id = %d AND is_active = 1
           AND (start_at IS NULL OR start_at <= %s)
           AND (end_at   IS NULL OR end_at   >  %s)
         ORDER BY sort_order ASC, priority_score DESC",
        $page_id, $now, $now
    ), ARRAY_A) ?: [];
}

function bkdn_get_all_buttons_for_page(int $page_id): array {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "buttons WHERE page_id = %d ORDER BY sort_order ASC",
        $page_id
    ), ARRAY_A) ?: [];
}

function bkdn_get_button_by_id(int $id): ?array {
    global $wpdb;
    return $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "buttons WHERE id = %d", $id
    ), ARRAY_A) ?: null;
}

function bkdn_upsert_button(array $data): int {
    global $wpdb;
    $pfx = bkdn_pfx();
    $allowed = ['page_id','title','subtitle','icon_key','custom_icon_svg','url',
                'style_variant','sort_order','priority_score','is_active','enabled',
                'is_featured','is_revenue_cta','opens_in_new_tab','start_at','end_at'];
    $row = array_intersect_key($data, array_flip($allowed));

    if (!empty($data['id'])) {
        $wpdb->update("{$pfx}buttons", $row, ['id' => (int)$data['id']]);
        return (int)$data['id'];
    }
    $wpdb->insert("{$pfx}buttons", $row);
    return (int)$wpdb->insert_id;
}

function bkdn_delete_button(int $id): void {
    global $wpdb;
    $wpdb->delete(bkdn_pfx() . 'buttons', ['id' => $id]);
}

function bkdn_reorder_buttons(array $ordered_ids): void {
    global $wpdb;
    $pfx = bkdn_pfx();
    foreach ($ordered_ids as $sort => $id) {
        $wpdb->update("{$pfx}buttons", ['sort_order' => (int)$sort], ['id' => (int)$id]);
    }
}

/* ─── Redirect rules ──────────────────────────────────────────────── */

function bkdn_get_active_redirect(int $page_id): ?array {
    global $wpdb;
    $now = bkdn_now();
    return $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "redirect_rules
         WHERE page_id = %d AND is_active = 1
           AND (start_at IS NULL OR start_at <= %s)
           AND (end_at   IS NULL OR end_at   >  %s)
         ORDER BY id DESC LIMIT 1",
        $page_id, $now, $now
    ), ARRAY_A) ?: null;
}

function bkdn_get_all_redirects_for_page(int $page_id): array {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "redirect_rules WHERE page_id = %d ORDER BY id DESC",
        $page_id
    ), ARRAY_A) ?: [];
}

function bkdn_upsert_redirect(array $data): int {
    global $wpdb;
    $pfx = bkdn_pfx();
    $allowed = ['page_id','is_active','redirect_type','target_url','start_at','end_at','notes'];
    $row = array_intersect_key($data, array_flip($allowed));
    if (!empty($data['id'])) {
        $wpdb->update("{$pfx}redirect_rules", $row, ['id' => (int)$data['id']]);
        return (int)$data['id'];
    }
    $wpdb->insert("{$pfx}redirect_rules", $row);
    return (int)$wpdb->insert_id;
}

function bkdn_delete_redirect(int $id): void {
    global $wpdb;
    $wpdb->delete(bkdn_pfx() . 'redirect_rules', ['id' => $id]);
}

/* ─── Analytics ───────────────────────────────────────────────────── */

function bkdn_track_event(array $data): void {
    global $wpdb;
    $wpdb->insert(bkdn_pfx() . 'analytics', array_merge([
        'created_at' => bkdn_now(),
    ], $data));
}

function bkdn_get_analytics_summary(int $page_id, string $period = '7d'): array {
    global $wpdb;
    $pfx  = bkdn_pfx();
    $days = match($period) {
        '1d'  => 1,
        '30d' => 30,
        default => 7,
    };
    $since = gmdate('Y-m-d H:i:s', time() - $days * 86400);

    $views  = (int)$wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$pfx}analytics WHERE page_id=%d AND event_type='view' AND created_at>=%s",
        $page_id, $since
    ));
    $clicks = (int)$wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$pfx}analytics WHERE page_id=%d AND event_type='click' AND created_at>=%s",
        $page_id, $since
    ));

    $top_buttons = $wpdb->get_results($wpdb->prepare(
        "SELECT a.button_id, b.title, COUNT(*) as clicks
         FROM {$pfx}analytics a
         LEFT JOIN {$pfx}buttons b ON b.id = a.button_id
         WHERE a.page_id = %d AND a.event_type = 'click' AND a.created_at >= %s AND a.button_id IS NOT NULL
         GROUP BY a.button_id
         ORDER BY clicks DESC
         LIMIT 10",
        $page_id, $since
    ), ARRAY_A) ?: [];

    $devices = $wpdb->get_results($wpdb->prepare(
        "SELECT device_type, COUNT(*) as cnt
         FROM {$pfx}analytics
         WHERE page_id = %d AND event_type = 'view' AND created_at >= %s
         GROUP BY device_type",
        $page_id, $since
    ), ARRAY_A) ?: [];

    return compact('views','clicks','top_buttons','devices','period','since');
}

function bkdn_get_global_analytics(string $period = '7d'): array {
    global $wpdb;
    $pfx  = bkdn_pfx();
    $days = match($period) { '1d'=>1,'30d'=>30, default=>7 };
    $since = gmdate('Y-m-d H:i:s', time() - $days * 86400);

    $top_pages = $wpdb->get_results($wpdb->prepare(
        "SELECT a.page_id, p.slug, p.title, COUNT(*) as views
         FROM {$pfx}analytics a
         LEFT JOIN {$pfx}pages p ON p.id = a.page_id
         WHERE a.event_type = 'view' AND a.created_at >= %s
         GROUP BY a.page_id ORDER BY views DESC LIMIT 10",
        $since
    ), ARRAY_A) ?: [];

    $total_views  = (int)$wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$pfx}analytics WHERE event_type='view'  AND created_at>=%s", $since
    ));
    $total_clicks = (int)$wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$pfx}analytics WHERE event_type='click' AND created_at>=%s", $since
    ));

    return compact('top_pages','total_views','total_clicks','period','since');
}

/* ─── Subscribers ─────────────────────────────────────────────────── */

function bkdn_insert_subscriber(array $data): true|string {
    global $wpdb;
    $pfx = bkdn_pfx();
    $exists = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM {$pfx}subscribers WHERE email = %s", $data['email']
    ));
    if ($exists) return 'already_subscribed';

    $wpdb->insert("{$pfx}subscribers", [
        'email'              => sanitize_email($data['email']),
        'first_name'         => sanitize_text_field($data['first_name'] ?? ''),
        'source_page_id'     => !empty($data['source_page_id']) ? (int)$data['source_page_id'] : null,
        'store_slug'         => sanitize_text_field($data['store_slug'] ?? ''),
        'campaign_name'      => sanitize_text_field($data['campaign_name'] ?? ''),
        'integration_status' => 'pending',
    ]);
    return true;
}

function bkdn_get_all_subscribers(int $page = 1, int $per = 50): array {
    global $wpdb;
    $pfx    = bkdn_pfx();
    $offset = ($page - 1) * $per;
    $rows   = $wpdb->get_results($wpdb->prepare(
        "SELECT s.*, p.slug as page_slug FROM {$pfx}subscribers s
         LEFT JOIN {$pfx}pages p ON p.id = s.source_page_id
         ORDER BY s.created_at DESC LIMIT %d OFFSET %d",
        $per, $offset
    ), ARRAY_A) ?: [];
    $total = (int)$wpdb->get_var("SELECT COUNT(*) FROM {$pfx}subscribers");
    return compact('rows','total','page','per');
}

/* ─── Shortlinks ──────────────────────────────────────────────────── */

function bkdn_get_shortlink(string $slug): ?array {
    global $wpdb;
    $now = bkdn_now();
    return $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . bkdn_pfx() . "shortlinks
         WHERE slug = %s AND is_active = 1
           AND (start_at IS NULL OR start_at <= %s)
           AND (end_at   IS NULL OR end_at   >  %s)",
        $slug, $now, $now
    ), ARRAY_A) ?: null;
}

function bkdn_get_all_shortlinks(): array {
    global $wpdb;
    return $wpdb->get_results(
        "SELECT * FROM " . bkdn_pfx() . "shortlinks ORDER BY created_at DESC",
        ARRAY_A
    ) ?: [];
}

function bkdn_upsert_shortlink(array $data): int {
    global $wpdb;
    $pfx = bkdn_pfx();
    $allowed = ['slug','target_url','utm_source','utm_medium','utm_campaign',
                'is_active','start_at','end_at','notes'];
    $row = array_intersect_key($data, array_flip($allowed));
    if (!empty($data['id'])) {
        $wpdb->update("{$pfx}shortlinks", $row, ['id' => (int)$data['id']]);
        return (int)$data['id'];
    }
    $row['created_at'] = bkdn_now();
    $wpdb->insert("{$pfx}shortlinks", $row);
    return (int)$wpdb->insert_id;
}

function bkdn_increment_shortlink_clicks(int $id): void {
    global $wpdb;
    $wpdb->query($wpdb->prepare(
        "UPDATE " . bkdn_pfx() . "shortlinks SET click_count = click_count + 1 WHERE id = %d", $id
    ));
}

function bkdn_delete_shortlink(int $id): void {
    global $wpdb;
    $wpdb->delete(bkdn_pfx() . 'shortlinks', ['id' => $id]);
}

/* ─── Global options ──────────────────────────────────────────────── */

function bkdn_get_options(): array {
    $defaults = [
        'order_rim'          => 'https://order.toasttab.com/online/bakudanramen',
        'order_stone_oak'    => 'https://order.toasttab.com/online/bakudan-ramen-stone-oak',
        'order_bandera'      => 'https://order.toasttab.com/online/bakudan-bandera',
        'instagram_url'      => 'https://www.instagram.com/bakudanramen/',
        'facebook_url'       => 'https://www.facebook.com/share/1DtztAQpcV/?mibextid=wwXIfr',
        'email_club_enabled' => false,
        'email_club_url'     => '',
        'events_enabled'     => false,
        'events_url'         => '',
        'signup_form_enabled'=> false,
        'signup_cta_text'    => 'Get specials & menu drops',
        'signup_incentive'   => '',
    ];
    $saved = get_option('bkdn_options', []);
    return array_merge($defaults, $saved);
}

function bkdn_save_options(array $data): void {
    $clean = [
        'order_rim'          => esc_url_raw($data['order_rim']       ?? ''),
        'order_stone_oak'    => esc_url_raw($data['order_stone_oak'] ?? ''),
        'order_bandera'      => esc_url_raw($data['order_bandera']   ?? ''),
        'instagram_url'      => esc_url_raw($data['instagram_url']   ?? ''),
        'facebook_url'       => esc_url_raw($data['facebook_url']    ?? ''),
        'email_club_enabled' => !empty($data['email_club_enabled']),
        'email_club_url'     => esc_url_raw($data['email_club_url']  ?? ''),
        'events_enabled'     => !empty($data['events_enabled']),
        'events_url'         => esc_url_raw($data['events_url']      ?? ''),
        'signup_form_enabled'=> !empty($data['signup_form_enabled']),
        'signup_cta_text'    => sanitize_text_field($data['signup_cta_text']  ?? ''),
        'signup_incentive'   => sanitize_text_field($data['signup_incentive'] ?? ''),
    ];
    update_option('bkdn_options', $clean);
}
