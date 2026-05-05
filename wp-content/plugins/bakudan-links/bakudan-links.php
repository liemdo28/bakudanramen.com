<?php
/**
 * Plugin Name:  Bakudan Links Hub
 * Description:  Self-hosted Link Hub platform for bakudanramen.com — replaces Linktree. Serves /links, /links/{slug}, /go/{shortSlug} as standalone pages with analytics, subscribers, shortlinks, and redirect rules.
 * Version:      2.5.0
 * Author:       Bakudan Ramen
 */

defined('ABSPATH') || exit;

define('BKDN_VERSION',     '2.5.0');
define('BKDN_PLUGIN_FILE', __FILE__);
define('BKDN_PLUGIN_DIR',  plugin_dir_path(__FILE__));

/* ─── Autoload ────────────────────────────────────────────────────── */

require_once BKDN_PLUGIN_DIR . 'includes/db.php';
require_once BKDN_PLUGIN_DIR . 'includes/query.php';
require_once BKDN_PLUGIN_DIR . 'includes/icons.php';
require_once BKDN_PLUGIN_DIR . 'includes/template.php';
require_once BKDN_PLUGIN_DIR . 'includes/analytics.php';
require_once BKDN_PLUGIN_DIR . 'includes/shortlinks.php';
require_once BKDN_PLUGIN_DIR . 'includes/redirects.php';
require_once BKDN_PLUGIN_DIR . 'includes/subscribers.php';
require_once BKDN_PLUGIN_DIR . 'includes/auth.php';
require_once BKDN_PLUGIN_DIR . 'includes/admin-api.php';
require_once BKDN_PLUGIN_DIR . 'admin/admin.php';
require_once BKDN_PLUGIN_DIR . 'admin/pages-admin.php';
require_once BKDN_PLUGIN_DIR . 'admin/analytics-admin.php';
require_once BKDN_PLUGIN_DIR . 'admin/subscribers-admin.php';
require_once BKDN_PLUGIN_DIR . 'admin/shortlinks-admin.php';
require_once BKDN_PLUGIN_DIR . 'admin/settings-admin.php';

/* ─── Activation / deactivation ──────────────────────────────────── */

register_activation_hook(__FILE__, function () {
    bkdn_install();
    bkdn_register_rewrites();
    flush_rewrite_rules();
});

register_deactivation_hook(__FILE__, function () {
    flush_rewrite_rules();
});

/* ─── DB upgrade on version bump ─────────────────────────────────── */

add_action('plugins_loaded', function () {
    if (get_option('bkdn_db_version') !== BKDN_DB_VERSION) {
        bkdn_install();
    }
});

/* ─── Rewrite rules ───────────────────────────────────────────────── */

function bkdn_register_rewrites(): void {
    // /links-admin — marketing SPA (must be before /links rules)
    add_rewrite_rule('^links-admin(/.*)?$',      'index.php?bkdn_spa=1',            'top');
    // /links/{slug} — specific store/brand page
    add_rewrite_rule('^links/([a-z0-9-]+)/?$',  'index.php?bkdn_slug=$matches[1]', 'top');
    // /links — main hub (alias to slug=bakudan)
    add_rewrite_rule('^links/?$',                'index.php?bkdn_slug=bakudan',     'top');
    // /go/{shortSlug} — shortlink resolver
    add_rewrite_rule('^go/([a-z0-9_-]+)/?$',    'index.php?bkdn_go=$matches[1]',   'top');
}

add_action('init', 'bkdn_register_rewrites');

add_filter('query_vars', function (array $vars): array {
    $vars[] = 'bkdn_slug';
    $vars[] = 'bkdn_go';
    $vars[] = 'bkdn_spa';
    return $vars;
});

/* ─── Route handler ───────────────────────────────────────────────── */

add_action('template_redirect', function () {
    // ── Marketing admin SPA ─────────────────────────────────────────
    if (get_query_var('bkdn_spa') === '1') {
        status_header(200);
        header('Content-Type: text/html; charset=UTF-8');
        include BKDN_PLUGIN_DIR . 'admin-spa/index.php';
        exit;
    }

    // ── Shortlink route ─────────────────────────────────────────────
    $go_slug = get_query_var('bkdn_go');
    if ($go_slug !== '') {
        bkdn_handle_shortlink(sanitize_text_field($go_slug));
        return;
    }

    // ── Link page route ─────────────────────────────────────────────
    $slug = get_query_var('bkdn_slug');
    if ($slug === '') return;

    $slug = sanitize_text_field($slug);
    $page = bkdn_get_page_by_slug($slug);

    if (!$page) {
        status_header(404);
        header('Content-Type: text/html; charset=UTF-8');
        echo bkdn_render_404();
        exit;
    }

    // Check for active redirect rule
    bkdn_maybe_redirect_page((int)$page['id']);

    // Serve the page
    status_header(200);
    header('Content-Type: text/html; charset=UTF-8');
    echo bkdn_render_page($page);
    exit;
});

/* ─── Flush on permalink save ─────────────────────────────────────── */

add_action('after_switch_theme',     'flush_rewrite_rules');
add_action('permalink_structure_changed', 'flush_rewrite_rules');
