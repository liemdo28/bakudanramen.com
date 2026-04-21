<?php
defined('ABSPATH') || exit;

/**
 * All protected REST endpoints for the marketing SPA.
 * Route prefix: /wp-json/bkdn/v1/admin/
 *
 * Role matrix:
 *   super_admin      — all access
 *   marketing_manager— all pages/buttons/shortlinks/subscribers/settings; no user management
 *   store_manager    — only their own store_slug pages
 *   viewer           — GET only (analytics, pages list)
 */

add_action('rest_api_init', 'bkdn_register_admin_api');

function bkdn_register_admin_api(): void {
    $mgr   = ['super_admin','marketing_manager'];
    $store = ['super_admin','marketing_manager','store_manager'];
    $all   = bkdn_all_roles();

    // ── Pages ─────────────────────────────────────────────────────────
    register_rest_route('bkdn/v1', '/admin/pages', [
        ['methods'=>'GET',  'callback'=>'bkdn_api_list_pages',   'permission_callback'=> bkdn_perm($all)],
        ['methods'=>'POST', 'callback'=>'bkdn_api_create_page',  'permission_callback'=> bkdn_perm($mgr)],
    ]);
    register_rest_route('bkdn/v1', '/admin/pages/(?P<id>\d+)', [
        ['methods'=>'GET',    'callback'=>'bkdn_api_get_page',    'permission_callback'=> bkdn_perm($all)],
        ['methods'=>'PUT',    'callback'=>'bkdn_api_update_page', 'permission_callback'=> bkdn_perm($store)],
        ['methods'=>'DELETE', 'callback'=>'bkdn_api_delete_page', 'permission_callback'=> bkdn_perm($mgr)],
    ]);
    register_rest_route('bkdn/v1', '/admin/pages/(?P<id>\d+)/duplicate', [
        ['methods'=>'POST', 'callback'=>'bkdn_api_duplicate_page', 'permission_callback'=> bkdn_perm($mgr)],
    ]);

    // ── Buttons ───────────────────────────────────────────────────────
    register_rest_route('bkdn/v1', '/admin/pages/(?P<id>\d+)/buttons', [
        ['methods'=>'GET',  'callback'=>'bkdn_api_list_buttons',  'permission_callback'=> bkdn_perm($all)],
        ['methods'=>'POST', 'callback'=>'bkdn_api_create_button', 'permission_callback'=> bkdn_perm($store)],
    ]);
    register_rest_route('bkdn/v1', '/admin/pages/(?P<id>\d+)/buttons/reorder', [
        ['methods'=>'PATCH', 'callback'=>'bkdn_api_reorder_buttons', 'permission_callback'=> bkdn_perm($store)],
    ]);
    register_rest_route('bkdn/v1', '/admin/buttons/(?P<id>\d+)', [
        ['methods'=>'PUT',    'callback'=>'bkdn_api_update_button',    'permission_callback'=> bkdn_perm($store)],
        ['methods'=>'DELETE', 'callback'=>'bkdn_api_delete_button',    'permission_callback'=> bkdn_perm($store)],
        ['methods'=>'POST',   'callback'=>'bkdn_api_duplicate_button', 'permission_callback'=> bkdn_perm($store)],
    ]);

    // ── Redirect rules ────────────────────────────────────────────────
    register_rest_route('bkdn/v1', '/admin/pages/(?P<id>\d+)/redirects', [
        ['methods'=>'GET',  'callback'=>'bkdn_api_list_redirects',  'permission_callback'=> bkdn_perm($mgr)],
        ['methods'=>'POST', 'callback'=>'bkdn_api_create_redirect', 'permission_callback'=> bkdn_perm($mgr)],
    ]);
    register_rest_route('bkdn/v1', '/admin/redirects/(?P<id>\d+)', [
        ['methods'=>'PUT',    'callback'=>'bkdn_api_update_redirect', 'permission_callback'=> bkdn_perm($mgr)],
        ['methods'=>'DELETE', 'callback'=>'bkdn_api_delete_redirect', 'permission_callback'=> bkdn_perm($mgr)],
    ]);

    // ── Analytics ─────────────────────────────────────────────────────
    register_rest_route('bkdn/v1', '/admin/analytics', [
        ['methods'=>'GET', 'callback'=>'bkdn_api_global_analytics', 'permission_callback'=> bkdn_perm($all)],
    ]);
    register_rest_route('bkdn/v1', '/admin/pages/(?P<id>\d+)/analytics', [
        ['methods'=>'GET', 'callback'=>'bkdn_api_page_analytics', 'permission_callback'=> bkdn_perm($all)],
    ]);

    // ── Subscribers ───────────────────────────────────────────────────
    register_rest_route('bkdn/v1', '/admin/subscribers', [
        ['methods'=>'GET', 'callback'=>'bkdn_api_list_subscribers', 'permission_callback'=> bkdn_perm($mgr)],
    ]);
    register_rest_route('bkdn/v1', '/admin/subscribers/export', [
        ['methods'=>'GET', 'callback'=>'bkdn_api_export_subscribers', 'permission_callback'=> bkdn_perm($mgr)],
    ]);

    // ── Shortlinks ────────────────────────────────────────────────────
    register_rest_route('bkdn/v1', '/admin/shortlinks', [
        ['methods'=>'GET',  'callback'=>'bkdn_api_list_shortlinks',  'permission_callback'=> bkdn_perm($mgr)],
        ['methods'=>'POST', 'callback'=>'bkdn_api_create_shortlink', 'permission_callback'=> bkdn_perm($mgr)],
    ]);
    register_rest_route('bkdn/v1', '/admin/shortlinks/(?P<id>\d+)', [
        ['methods'=>'PUT',    'callback'=>'bkdn_api_update_shortlink', 'permission_callback'=> bkdn_perm($mgr)],
        ['methods'=>'DELETE', 'callback'=>'bkdn_api_delete_shortlink', 'permission_callback'=> bkdn_perm($mgr)],
    ]);

    // ── Settings ──────────────────────────────────────────────────────
    register_rest_route('bkdn/v1', '/admin/settings', [
        ['methods'=>'GET', 'callback'=>'bkdn_api_get_settings',  'permission_callback'=> bkdn_perm($all)],
        ['methods'=>'PUT', 'callback'=>'bkdn_api_save_settings', 'permission_callback'=> bkdn_perm($mgr)],
    ]);

    // ── Dashboard summary ─────────────────────────────────────────────
    register_rest_route('bkdn/v1', '/admin/dashboard', [
        ['methods'=>'GET', 'callback'=>'bkdn_api_dashboard', 'permission_callback'=> bkdn_perm($all)],
    ]);
}

/* ─── Permission guard for store_manager ─────────────────────────── */

function bkdn_can_edit_page(WP_REST_Request $req, int $page_id): bool {
    $user = bkdn_auth_user_from_request($req);
    if (!$user) return false;
    if (in_array($user['role'], ['super_admin','marketing_manager'], true)) return true;
    if ($user['role'] === 'store_manager') {
        $page = bkdn_get_page_by_id($page_id);
        return $page && $page['store_slug'] === $user['store_slug'];
    }
    return false;
}

/* ─── Pages ───────────────────────────────────────────────────────── */

function bkdn_api_list_pages(WP_REST_Request $req): WP_REST_Response {
    $user  = bkdn_auth_user_from_request($req);
    $pages = bkdn_get_all_pages();
    if ($user['role'] === 'store_manager') {
        $pages = array_filter($pages, fn($p) => $p['store_slug'] === $user['store_slug']);
        $pages = array_values($pages);
    }
    return new WP_REST_Response(['success'=>true,'pages'=>$pages], 200);
}

function bkdn_api_get_page(WP_REST_Request $req): WP_REST_Response {
    $page = bkdn_get_page_by_id((int)$req->get_param('id'));
    if (!$page) return new WP_REST_Response(['success'=>false,'message'=>'Not found'], 404);
    $page['buttons'] = bkdn_get_all_buttons_for_page((int)$page['id']);
    return new WP_REST_Response(['success'=>true,'page'=>$page], 200);
}

function bkdn_api_create_page(WP_REST_Request $req): WP_REST_Response {
    $id = bkdn_upsert_page(bkdn_sanitize_page_input($req));
    return new WP_REST_Response(['success'=>true,'id'=>$id], 201);
}

function bkdn_api_update_page(WP_REST_Request $req): WP_REST_Response {
    $id = (int)$req->get_param('id');
    if (!bkdn_can_edit_page($req, $id)) return new WP_REST_Response(['success'=>false,'message'=>'Forbidden'], 403);
    bkdn_upsert_page(array_merge(bkdn_sanitize_page_input($req), ['id'=>$id]));
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_api_delete_page(WP_REST_Request $req): WP_REST_Response {
    bkdn_delete_page((int)$req->get_param('id'));
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_api_duplicate_page(WP_REST_Request $req): WP_REST_Response {
    $src = bkdn_get_page_by_id((int)$req->get_param('id'));
    if (!$src) return new WP_REST_Response(['success'=>false,'message'=>'Not found'], 404);

    $new_slug = $src['slug'] . '-copy-' . time();
    $new_id = bkdn_upsert_page([
        'slug'        => $new_slug,
        'title'       => $src['title'] . ' (Copy)',
        'headline'    => $src['headline'],
        'subheadline' => $src['subheadline'],
        'store_slug'  => $src['store_slug'],
        'seo_desc'    => $src['seo_desc'],
        'theme_json'  => $src['theme_json'],
        'is_active'   => 0,
    ]);

    $btns = bkdn_get_all_buttons_for_page((int)$src['id']);
    foreach ($btns as $b) {
        global $wpdb;
        unset($b['id']);
        $b['page_id'] = $new_id;
        $wpdb->insert(bkdn_pfx() . 'buttons', $b);
    }

    return new WP_REST_Response(['success'=>true,'id'=>$new_id,'slug'=>$new_slug], 201);
}

function bkdn_sanitize_page_input(WP_REST_Request $req): array {
    $theme_raw = $req->get_param('theme') ?? [];
    $theme = [];
    if (is_array($theme_raw)) {
        foreach ($theme_raw as $k => $v) {
            $theme[sanitize_key($k)] = sanitize_text_field($v);
        }
    }
    return [
        'slug'         => sanitize_title($req->get_param('slug')        ?? ''),
        'title'        => sanitize_text_field($req->get_param('title')       ?? ''),
        'headline'     => sanitize_text_field($req->get_param('headline')    ?? ''),
        'subheadline'  => sanitize_text_field($req->get_param('subheadline') ?? ''),
        'store_slug'   => sanitize_text_field($req->get_param('store_slug')  ?? '') ?: null,
        'seo_desc'     => sanitize_textarea_field($req->get_param('seo_desc')    ?? ''),
        'campaign_name'=> sanitize_text_field($req->get_param('campaign_name') ?? '') ?: null,
        'is_active'    => (int)(bool)$req->get_param('is_active'),
        'published_at' => sanitize_text_field($req->get_param('published_at') ?? '') ?: null,
        'expires_at'   => sanitize_text_field($req->get_param('expires_at')   ?? '') ?: null,
        'theme_json'   => !empty($theme) ? wp_json_encode($theme) : null,
    ];
}

/* ─── Buttons ─────────────────────────────────────────────────────── */

function bkdn_api_list_buttons(WP_REST_Request $req): WP_REST_Response {
    $btns = bkdn_get_all_buttons_for_page((int)$req->get_param('id'));
    return new WP_REST_Response(['success'=>true,'buttons'=>$btns], 200);
}

function bkdn_api_create_button(WP_REST_Request $req): WP_REST_Response {
    $id_page = (int)$req->get_param('id');
    if (!bkdn_can_edit_page($req, $id_page)) return new WP_REST_Response(['success'=>false,'message'=>'Forbidden'], 403);
    $id = bkdn_upsert_button(array_merge(bkdn_sanitize_button_input($req), ['page_id'=>$id_page]));
    return new WP_REST_Response(['success'=>true,'id'=>$id], 201);
}

function bkdn_api_update_button(WP_REST_Request $req): WP_REST_Response {
    $id  = (int)$req->get_param('id');
    $btn = bkdn_get_button_by_id($id);
    if (!$btn || !bkdn_can_edit_page($req, (int)$btn['page_id'])) return new WP_REST_Response(['success'=>false,'message'=>'Forbidden'], 403);
    bkdn_upsert_button(array_merge(bkdn_sanitize_button_input($req), ['id'=>$id,'page_id'=>$btn['page_id']]));
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_api_delete_button(WP_REST_Request $req): WP_REST_Response {
    $id  = (int)$req->get_param('id');
    $btn = bkdn_get_button_by_id($id);
    if (!$btn || !bkdn_can_edit_page($req, (int)$btn['page_id'])) return new WP_REST_Response(['success'=>false,'message'=>'Forbidden'], 403);
    bkdn_delete_button($id);
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_api_duplicate_button(WP_REST_Request $req): WP_REST_Response {
    $btn = bkdn_get_button_by_id((int)$req->get_param('id'));
    if (!$btn) return new WP_REST_Response(['success'=>false,'message'=>'Not found'], 404);
    unset($btn['id']);
    $btn['title']      .= ' (Copy)';
    $btn['sort_order'] += 1;
    $new_id = bkdn_upsert_button($btn);
    return new WP_REST_Response(['success'=>true,'id'=>$new_id], 201);
}

function bkdn_api_reorder_buttons(WP_REST_Request $req): WP_REST_Response {
    $page_id = (int)$req->get_param('id');
    if (!bkdn_can_edit_page($req, $page_id)) return new WP_REST_Response(['success'=>false,'message'=>'Forbidden'], 403);
    $order = array_map('intval', (array)($req->get_param('order') ?? []));
    bkdn_reorder_buttons(array_flip($order));
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_sanitize_button_input(WP_REST_Request $req): array {
    return [
        'title'           => sanitize_text_field($req->get_param('title')       ?? ''),
        'subtitle'        => sanitize_text_field($req->get_param('subtitle')    ?? '') ?: null,
        'url'             => esc_url_raw($req->get_param('url')                 ?? ''),
        'icon_key'        => sanitize_text_field($req->get_param('icon_key')    ?? '') ?: null,
        'style_variant'   => sanitize_text_field($req->get_param('style_variant') ?? 'secondary'),
        'sort_order'      => (int)($req->get_param('sort_order')                ?? 0),
        'priority_score'  => (int)($req->get_param('priority_score')            ?? 0),
        'is_active'       => (int)(bool)$req->get_param('is_active'),
        'enabled'         => (int)(bool)$req->get_param('enabled'),
        'is_featured'     => (int)(bool)$req->get_param('is_featured'),
        'is_revenue_cta'  => (int)(bool)$req->get_param('is_revenue_cta'),
        'opens_in_new_tab'=> (int)(bool)$req->get_param('opens_in_new_tab'),
        'start_at'        => sanitize_text_field($req->get_param('start_at')    ?? '') ?: null,
        'end_at'          => sanitize_text_field($req->get_param('end_at')      ?? '') ?: null,
    ];
}

/* ─── Redirect rules ──────────────────────────────────────────────── */

function bkdn_api_list_redirects(WP_REST_Request $req): WP_REST_Response {
    $rules = bkdn_get_all_redirects_for_page((int)$req->get_param('id'));
    return new WP_REST_Response(['success'=>true,'redirects'=>$rules], 200);
}

function bkdn_api_create_redirect(WP_REST_Request $req): WP_REST_Response {
    $id = bkdn_upsert_redirect(bkdn_sanitize_redirect_input($req, (int)$req->get_param('id')));
    return new WP_REST_Response(['success'=>true,'id'=>$id], 201);
}

function bkdn_api_update_redirect(WP_REST_Request $req): WP_REST_Response {
    bkdn_upsert_redirect(array_merge(bkdn_sanitize_redirect_input($req, null), ['id'=>(int)$req->get_param('id')]));
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_api_delete_redirect(WP_REST_Request $req): WP_REST_Response {
    bkdn_delete_redirect((int)$req->get_param('id'));
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_sanitize_redirect_input(WP_REST_Request $req, ?int $page_id): array {
    $row = [
        'is_active'     => (int)(bool)$req->get_param('is_active'),
        'redirect_type' => in_array($req->get_param('redirect_type'), ['301','302']) ? $req->get_param('redirect_type') : '302',
        'target_url'    => esc_url_raw($req->get_param('target_url') ?? ''),
        'start_at'      => sanitize_text_field($req->get_param('start_at') ?? '') ?: null,
        'end_at'        => sanitize_text_field($req->get_param('end_at')   ?? '') ?: null,
        'notes'         => sanitize_textarea_field($req->get_param('notes') ?? ''),
    ];
    if ($page_id !== null) $row['page_id'] = $page_id;
    return $row;
}

/* ─── Analytics ───────────────────────────────────────────────────── */

function bkdn_api_global_analytics(WP_REST_Request $req): WP_REST_Response {
    $period = sanitize_text_field($req->get_param('period') ?? '7d');
    return new WP_REST_Response(['success'=>true,'analytics'=>bkdn_get_global_analytics($period)], 200);
}

function bkdn_api_page_analytics(WP_REST_Request $req): WP_REST_Response {
    $period = sanitize_text_field($req->get_param('period') ?? '7d');
    $stats  = bkdn_get_analytics_summary((int)$req->get_param('id'), $period);
    return new WP_REST_Response(['success'=>true,'analytics'=>$stats], 200);
}

/* ─── Subscribers ─────────────────────────────────────────────────── */

function bkdn_api_list_subscribers(WP_REST_Request $req): WP_REST_Response {
    $page = max(1, (int)($req->get_param('page') ?? 1));
    $data = bkdn_get_all_subscribers($page, 100);
    return new WP_REST_Response(['success'=>true] + $data, 200);
}

function bkdn_api_export_subscribers(WP_REST_Request $req): void {
    global $wpdb;
    $pfx  = bkdn_pfx();
    $rows = $wpdb->get_results(
        "SELECT s.email, s.first_name, p.slug as page_slug, s.campaign_name, s.integration_status, s.created_at
         FROM {$pfx}subscribers s LEFT JOIN {$pfx}pages p ON p.id = s.source_page_id
         ORDER BY s.created_at DESC",
        ARRAY_A
    ) ?: [];
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="subscribers-' . date('Y-m-d') . '.csv"');
    $f = fopen('php://output', 'w');
    fputcsv($f, ['email','first_name','source_page','campaign','status','created_at']);
    foreach ($rows as $r) fputcsv($f, $r);
    fclose($f);
    exit;
}

/* ─── Shortlinks ──────────────────────────────────────────────────── */

function bkdn_api_list_shortlinks(WP_REST_Request $req): WP_REST_Response {
    return new WP_REST_Response(['success'=>true,'shortlinks'=>bkdn_get_all_shortlinks()], 200);
}

function bkdn_api_create_shortlink(WP_REST_Request $req): WP_REST_Response {
    $id = bkdn_upsert_shortlink(bkdn_sanitize_shortlink_input($req));
    return new WP_REST_Response(['success'=>true,'id'=>$id], 201);
}

function bkdn_api_update_shortlink(WP_REST_Request $req): WP_REST_Response {
    bkdn_upsert_shortlink(array_merge(bkdn_sanitize_shortlink_input($req), ['id'=>(int)$req->get_param('id')]));
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_api_delete_shortlink(WP_REST_Request $req): WP_REST_Response {
    bkdn_delete_shortlink((int)$req->get_param('id'));
    return new WP_REST_Response(['success'=>true], 200);
}

function bkdn_sanitize_shortlink_input(WP_REST_Request $req): array {
    return [
        'slug'         => sanitize_title($req->get_param('slug')         ?? ''),
        'target_url'   => esc_url_raw($req->get_param('target_url')      ?? ''),
        'utm_source'   => sanitize_text_field($req->get_param('utm_source')   ?? '') ?: null,
        'utm_medium'   => sanitize_text_field($req->get_param('utm_medium')   ?? '') ?: null,
        'utm_campaign' => sanitize_text_field($req->get_param('utm_campaign') ?? '') ?: null,
        'notes'        => sanitize_text_field($req->get_param('notes')        ?? '') ?: null,
        'is_active'    => (int)(bool)$req->get_param('is_active'),
        'start_at'     => sanitize_text_field($req->get_param('start_at')     ?? '') ?: null,
        'end_at'       => sanitize_text_field($req->get_param('end_at')       ?? '') ?: null,
    ];
}

/* ─── Settings ────────────────────────────────────────────────────── */

function bkdn_api_get_settings(WP_REST_Request $req): WP_REST_Response {
    $opt = bkdn_get_options();
    unset($opt['password_hash']); // never expose sensitive fields
    return new WP_REST_Response(['success'=>true,'settings'=>$opt], 200);
}

function bkdn_api_save_settings(WP_REST_Request $req): WP_REST_Response {
    $data = $req->get_json_params() ?? [];
    bkdn_save_options($data);
    return new WP_REST_Response(['success'=>true], 200);
}

/* ─── Dashboard ───────────────────────────────────────────────────── */

function bkdn_api_dashboard(WP_REST_Request $req): WP_REST_Response {
    global $wpdb;
    $pfx = bkdn_pfx();
    $user = bkdn_auth_user_from_request($req);

    $page_count = (int)$wpdb->get_var("SELECT COUNT(*) FROM {$pfx}pages WHERE is_active=1");
    $sub_count  = (int)$wpdb->get_var("SELECT COUNT(*) FROM {$pfx}subscribers");
    $sl_count   = (int)$wpdb->get_var("SELECT COUNT(*) FROM {$pfx}shortlinks WHERE is_active=1");
    $active_redirs = (int)$wpdb->get_var("SELECT COUNT(*) FROM {$pfx}redirect_rules WHERE is_active=1");

    $since_24h = gmdate('Y-m-d H:i:s', time() - 86400);
    $views_24h  = (int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$pfx}analytics WHERE event_type='view'  AND created_at>=%s", $since_24h));
    $clicks_24h = (int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$pfx}analytics WHERE event_type='click' AND created_at>=%s", $since_24h));

    $since_7d   = gmdate('Y-m-d H:i:s', time() - 7*86400);
    $top_pages  = $wpdb->get_results($wpdb->prepare(
        "SELECT a.page_id, p.slug, p.title, COUNT(*) as views
         FROM {$pfx}analytics a LEFT JOIN {$pfx}pages p ON p.id=a.page_id
         WHERE a.event_type='view' AND a.created_at>=%s GROUP BY a.page_id ORDER BY views DESC LIMIT 5",
        $since_7d
    ), ARRAY_A) ?: [];

    return new WP_REST_Response(['success'=>true,'dashboard'=>compact(
        'page_count','sub_count','sl_count','active_redirs',
        'views_24h','clicks_24h','top_pages'
    )], 200);
}
