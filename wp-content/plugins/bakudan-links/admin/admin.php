<?php
defined('ABSPATH') || exit;

add_action('admin_menu', function () {
    add_menu_page(
        'Links Hub', 'Links Hub', 'manage_options',
        'bkdn-links', 'bkdn_admin_pages_page',
        'dashicons-admin-links', 30
    );
    add_submenu_page('bkdn-links', 'Pages',       'Pages',       'manage_options', 'bkdn-links',            'bkdn_admin_pages_page');
    add_submenu_page('bkdn-links', 'Shortlinks',  'Shortlinks',  'manage_options', 'bkdn-shortlinks',       'bkdn_admin_shortlinks_page');
    add_submenu_page('bkdn-links', 'Subscribers', 'Subscribers', 'manage_options', 'bkdn-subscribers',      'bkdn_admin_subscribers_page');
    add_submenu_page('bkdn-links', 'Analytics',   'Analytics',   'manage_options', 'bkdn-analytics',        'bkdn_admin_analytics_page');
    add_submenu_page('bkdn-links', 'Settings',    'Settings',    'manage_options', 'bkdn-links-settings',   'bkdn_admin_settings_page');
});

add_action('admin_enqueue_scripts', function ($hook) {
    if (!str_contains($hook, 'bkdn') && !str_contains($hook, 'bakudan')) return;
    wp_enqueue_style('bkdn-admin', plugins_url('assets/admin.css', BKDN_PLUGIN_FILE), [], BKDN_VERSION);
});

/* ─── Shared helpers ──────────────────────────────────────────────── */

function bkdn_admin_nav(string $current = ''): void {
    $links = [
        'bkdn-links'          => 'Pages',
        'bkdn-shortlinks'     => 'Shortlinks',
        'bkdn-subscribers'    => 'Subscribers',
        'bkdn-analytics'      => 'Analytics',
        'bkdn-links-settings' => 'Settings',
    ];
    echo '<nav class="bkdn-subnav">';
    foreach ($links as $slug => $label) {
        $url = admin_url('admin.php?page=' . $slug);
        $cls = ($current === $slug) ? ' class="current"' : '';
        echo "<a href=\"{$url}\"{$cls}>{$label}</a> ";
    }
    echo '</nav>';
}

function bkdn_admin_notice(string $msg, string $type = 'success'): void {
    echo "<div class=\"notice notice-{$type} is-dismissible\"><p>{$msg}</p></div>";
}
