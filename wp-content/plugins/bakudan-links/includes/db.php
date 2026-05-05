<?php
defined('ABSPATH') || exit;

define('BKDN_DB_VERSION', '1.0.2');

/* ─── Table creation (called on activation + upgrade) ───────────── */

function bkdn_install(): void {
    global $wpdb;
    $c   = $wpdb->get_charset_collate();
    $pfx = $wpdb->prefix . 'bkdn_';

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    dbDelta("CREATE TABLE {$pfx}pages (
      id           bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      slug         varchar(100)  NOT NULL,
      title        varchar(255)  NOT NULL,
      headline     varchar(255)  DEFAULT NULL,
      subheadline  varchar(255)  DEFAULT NULL,
      store_slug   varchar(100)  DEFAULT NULL,
      logo_path    varchar(500)  DEFAULT NULL,
      hero_image_path varchar(500) DEFAULT NULL,
      og_image_path   varchar(500) DEFAULT NULL,
      theme_json   longtext      DEFAULT NULL,
      seo_desc     varchar(500)  DEFAULT NULL,
      campaign_name varchar(100) DEFAULT NULL,
      is_active    tinyint(1)    NOT NULL DEFAULT 1,
      published_at datetime      DEFAULT NULL,
      expires_at   datetime      DEFAULT NULL,
      created_at   datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY  (id),
      UNIQUE KEY slug (slug)
    ) $c;");

    dbDelta("CREATE TABLE {$pfx}buttons (
      id               bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      page_id          bigint(20) unsigned NOT NULL,
      title            varchar(255) NOT NULL,
      subtitle         varchar(255) DEFAULT NULL,
      icon_key         varchar(50)  DEFAULT NULL,
      custom_icon_svg  longtext     DEFAULT NULL,
      url              varchar(2000) DEFAULT NULL,
      style_variant    varchar(50)  NOT NULL DEFAULT 'secondary',
      sort_order       int(11)      NOT NULL DEFAULT 0,
      priority_score   int(11)      NOT NULL DEFAULT 0,
      is_active        tinyint(1)   NOT NULL DEFAULT 1,
      enabled          tinyint(1)   NOT NULL DEFAULT 1,
      is_featured      tinyint(1)   NOT NULL DEFAULT 0,
      is_revenue_cta   tinyint(1)   NOT NULL DEFAULT 0,
      opens_in_new_tab tinyint(1)   NOT NULL DEFAULT 1,
      start_at         datetime     DEFAULT NULL,
      end_at           datetime     DEFAULT NULL,
      PRIMARY KEY (id),
      KEY page_id (page_id),
      KEY sort_order (sort_order)
    ) $c;");

    dbDelta("CREATE TABLE {$pfx}redirect_rules (
      id            bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      page_id       bigint(20) unsigned DEFAULT NULL,
      is_active     tinyint(1)  NOT NULL DEFAULT 1,
      redirect_type varchar(10) NOT NULL DEFAULT '302',
      target_url    varchar(2000) NOT NULL,
      start_at      datetime    DEFAULT NULL,
      end_at        datetime    DEFAULT NULL,
      notes         text        DEFAULT NULL,
      created_at    datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY page_id (page_id)
    ) $c;");

    dbDelta("CREATE TABLE {$pfx}analytics (
      id           bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      page_id      bigint(20) unsigned DEFAULT NULL,
      button_id    bigint(20) unsigned DEFAULT NULL,
      shortlink_id bigint(20) unsigned DEFAULT NULL,
      event_type   varchar(20) NOT NULL,
      referrer     varchar(1000) DEFAULT NULL,
      device_type  varchar(20)  DEFAULT NULL,
      utm_source   varchar(100) DEFAULT NULL,
      utm_medium   varchar(100) DEFAULT NULL,
      utm_campaign varchar(100) DEFAULT NULL,
      ip_hash      varchar(64)  DEFAULT NULL,
      session_id   varchar(64)  DEFAULT NULL,
      created_at   datetime     NOT NULL,
      PRIMARY KEY  (id),
      KEY page_id  (page_id),
      KEY button_id (button_id),
      KEY event_type (event_type),
      KEY created_at (created_at)
    ) $c;");

    dbDelta("CREATE TABLE {$pfx}subscribers (
      id                 bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      email              varchar(255) NOT NULL,
      first_name         varchar(100) DEFAULT NULL,
      source_page_id     bigint(20) unsigned DEFAULT NULL,
      store_slug         varchar(100) DEFAULT NULL,
      campaign_name      varchar(100) DEFAULT NULL,
      integration_status varchar(50)  NOT NULL DEFAULT 'pending',
      created_at         datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY email (email),
      KEY source_page_id (source_page_id)
    ) $c;");

    dbDelta("CREATE TABLE {$pfx}shortlinks (
      id           bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      slug         varchar(100) NOT NULL,
      target_url   varchar(2000) NOT NULL,
      utm_source   varchar(100) DEFAULT NULL,
      utm_medium   varchar(100) DEFAULT NULL,
      utm_campaign varchar(100) DEFAULT NULL,
      is_active    tinyint(1)   NOT NULL DEFAULT 1,
      click_count  bigint(20)   NOT NULL DEFAULT 0,
      start_at     datetime     DEFAULT NULL,
      end_at       datetime     DEFAULT NULL,
      notes        varchar(500) DEFAULT NULL,
      created_at   datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY slug (slug)
    ) $c;");

    dbDelta("CREATE TABLE {$pfx}admin_users (
      id            bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      name          varchar(100) NOT NULL,
      email         varchar(255) NOT NULL,
      password_hash varchar(255) NOT NULL,
      role          varchar(50)  NOT NULL DEFAULT 'viewer',
      store_slug    varchar(100) DEFAULT NULL,
      is_active     tinyint(1)   NOT NULL DEFAULT 1,
      last_login    datetime     DEFAULT NULL,
      created_at    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY email (email)
    ) $c;");

    update_option('bkdn_db_version', BKDN_DB_VERSION);

    if (!get_option('bkdn_seeded')) {
        bkdn_seed();
        update_option('bkdn_seeded', '1');
    }

    // Seed default admin user once
    if (!get_option('bkdn_admin_user_seeded')) {
        $exists = $wpdb->get_var("SELECT id FROM {$pfx}admin_users WHERE email = 'admin@bakudanramen.com'");
        if (!$exists) {
            $wpdb->insert("{$pfx}admin_users", [
                'name'          => 'Super Admin',
                'email'         => 'admin@bakudanramen.com',
                'password_hash' => password_hash('admin', PASSWORD_BCRYPT),
                'role'          => 'super_admin',
                'is_active'     => 1,
            ]);
        }
        update_option('bkdn_admin_user_seeded', '1');
    }

    // Fix: migrate plain-username 'admin' row to proper email (one-time cleanup)
    if (!get_option('bkdn_admin_email_migrated')) {
        $wpdb->update(
            "{$pfx}admin_users",
            ['email' => 'admin@bakudanramen.com'],
            ['email' => 'admin', 'role' => 'super_admin']
        );
        update_option('bkdn_admin_email_migrated', '1');
    }

    // Migrate baked-in button URLs + visibility to correct production values
    if (!get_option('bkdn_button_urls_v3')) {
        // ── Hide Email Club + Events ───────────────────────────────────
        $wpdb->query("UPDATE {$pfx}buttons SET is_active = 0 WHERE icon_key = 'email'");
        $wpdb->query("UPDATE {$pfx}buttons SET is_active = 0 WHERE icon_key = 'events'");

        // ── Social buttons: update if exist, insert per page if missing ─
        $ig_url = 'https://www.instagram.com/bakudanramen/';
        $fb_url = 'https://www.facebook.com/share/1DtztAQpcV/?mibextid=wwXIfr';

        // Update existing rows
        $wpdb->query("UPDATE {$pfx}buttons SET url = '{$ig_url}', is_active = 1, enabled = 1 WHERE icon_key = 'instagram'");
        $wpdb->query("UPDATE {$pfx}buttons SET url = '{$fb_url}', is_active = 1, enabled = 1 WHERE icon_key = 'facebook'");

        // Insert missing social buttons for each page
        $pages = $wpdb->get_results("SELECT id FROM {$pfx}pages WHERE is_active = 1", ARRAY_A) ?: [];
        foreach ($pages as $pg) {
            $pid = (int)$pg['id'];
            $has_ig = $wpdb->get_var("SELECT id FROM {$pfx}buttons WHERE page_id = {$pid} AND icon_key = 'instagram'");
            if (!$has_ig) {
                $wpdb->insert("{$pfx}buttons", [
                    'page_id'         => $pid,
                    'title'           => 'Instagram',
                    'subtitle'        => '@bakudanramen',
                    'icon_key'        => 'instagram',
                    'url'             => $ig_url,
                    'style_variant'   => 'secondary',
                    'sort_order'      => 50,
                    'is_active'       => 1,
                    'enabled'         => 1,
                    'opens_in_new_tab'=> 1,
                ]);
            }
            $has_fb = $wpdb->get_var("SELECT id FROM {$pfx}buttons WHERE page_id = {$pid} AND icon_key = 'facebook'");
            if (!$has_fb) {
                $wpdb->insert("{$pfx}buttons", [
                    'page_id'         => $pid,
                    'title'           => 'Facebook',
                    'subtitle'        => 'Bakudan Ramen',
                    'icon_key'        => 'facebook',
                    'url'             => $fb_url,
                    'style_variant'   => 'secondary',
                    'sort_order'      => 60,
                    'is_active'       => 1,
                    'enabled'         => 1,
                    'opens_in_new_tab'=> 1,
                ]);
            }
        }

        // ── Order sub-buttons on hub page ──────────────────────────────
        $wpdb->query("UPDATE {$pfx}buttons SET url = 'https://order.toasttab.com/online/bakudanramen' WHERE style_variant = 'order_sub' AND title = 'THE RIM'");
        $wpdb->query("UPDATE {$pfx}buttons SET url = 'https://order.toasttab.com/online/bakudan-ramen-stone-oak' WHERE style_variant = 'order_sub' AND title = 'STONE OAK'");
        $wpdb->query("UPDATE {$pfx}buttons SET url = 'https://order.toasttab.com/online/bakudan-bandera' WHERE style_variant = 'order_sub' AND title = 'BANDERA'");

        // ── Order Online on store pages ────────────────────────────────
        $wpdb->query("UPDATE {$pfx}buttons b INNER JOIN {$pfx}pages p ON b.page_id = p.id SET b.url = 'https://order.toasttab.com/online/bakudanramen' WHERE p.store_slug = 'rim' AND b.style_variant = 'primary'");
        $wpdb->query("UPDATE {$pfx}buttons b INNER JOIN {$pfx}pages p ON b.page_id = p.id SET b.url = 'https://order.toasttab.com/online/bakudan-ramen-stone-oak' WHERE p.store_slug = 'stone-oak' AND b.style_variant = 'primary'");
        $wpdb->query("UPDATE {$pfx}buttons b INNER JOIN {$pfx}pages p ON b.page_id = p.id SET b.url = 'https://order.toasttab.com/online/bakudan-bandera' WHERE p.store_slug = 'bandera' AND b.style_variant = 'primary'");

        update_option('bkdn_button_urls_v3', '1');
    }

    // Force-update URLs to correct production values
    if (!get_option('bkdn_urls_v1')) {
        $saved = get_option('bkdn_options', []);
        $saved['order_rim']      = 'https://order.toasttab.com/online/bakudanramen';
        $saved['order_stone_oak']= 'https://order.toasttab.com/online/bakudan-ramen-stone-oak';
        $saved['order_bandera']  = 'https://order.toasttab.com/online/bakudan-bandera';
        $saved['instagram_url']  = 'https://www.instagram.com/bakudanramen/';
        $saved['facebook_url']   = 'https://www.facebook.com/share/1DtztAQpcV/?mibextid=wwXIfr';
        update_option('bkdn_options', $saved);
        update_option('bkdn_urls_v1', '1');
    }
}

/* ─── Default theme ──────────────────────────────────────────────── */

function bkdn_default_theme(): array {
    return [
        'bg_color'              => '#0a0a0a',
        'card_color'            => '#141414',
        'button_primary_color'  => '#B91C1C',
        'button_secondary_color'=> '#141414',
        'text_primary'          => '#ffffff',
        'text_secondary'        => '#888888',
        'border_color'          => '#262626',
        'border_style'          => 'solid',
        'accent_color'          => '#B91C1C',
        'icon_style'            => 'filled',
    ];
}

/* ─── Seed Bakudan data ──────────────────────────────────────────── */

function bkdn_seed(): void {
    global $wpdb;
    $pfx   = $wpdb->prefix . 'bkdn_';
    $now   = current_time('mysql');
    $theme = wp_json_encode(bkdn_default_theme());
    $opt   = bkdn_get_options();

    $ig      = $opt['instagram_url'];
    $fb      = $opt['facebook_url'];
    $website = 'https://bakudanramen.com';

    $maps = [
        'rim'       => 'https://maps.google.com/?q=Bakudan+Ramen+The+Rim+17619+La+Cantera+Pkwy+San+Antonio+TX',
        'stone-oak' => 'https://maps.google.com/?q=Bakudan+Ramen+Stone+Oak+22506+Hwy+281+San+Antonio+TX',
        'bandera'   => 'https://maps.google.com/?q=Bakudan+Ramen+Bandera+11309+Bandera+Rd+San+Antonio+TX',
    ];

    // ── Pages ─────────────────────────────────────────────────────────
    $pages_data = [
        [
            'slug'        => 'bakudan',
            'title'       => 'Bakudan Ramen — Links',
            'headline'    => 'BAKUDAN RAMEN',
            'subheadline' => 'Authentic Japanese Ramen · San Antonio',
            'store_slug'  => null,
            'seo_desc'    => 'Order online, get directions, and find events for Bakudan Ramen San Antonio.',
        ],
        [
            'slug'        => 'rim',
            'title'       => 'Bakudan Ramen — The Rim',
            'headline'    => 'BAKUDAN — THE RIM',
            'subheadline' => '17619 La Cantera Pkwy UNIT 208 · (210) 257-8080',
            'store_slug'  => 'rim',
            'seo_desc'    => 'Order online and get directions to Bakudan Ramen at The Rim, San Antonio.',
        ],
        [
            'slug'        => 'stone-oak',
            'title'       => 'Bakudan Ramen — Stone Oak',
            'headline'    => 'BAKUDAN — STONE OAK',
            'subheadline' => '22506 U.S. Hwy 281 N Ste 106 · (210) 437-0632',
            'store_slug'  => 'stone-oak',
            'seo_desc'    => 'Order online and get directions to Bakudan Ramen at Stone Oak, San Antonio.',
        ],
        [
            'slug'        => 'bandera',
            'title'       => 'Bakudan Ramen — Bandera',
            'headline'    => 'BAKUDAN — BANDERA',
            'subheadline' => '11309 Bandera Rd Ste 111 · (210) 277-7740',
            'store_slug'  => 'bandera',
            'seo_desc'    => 'Order online and get directions to Bakudan Ramen on Bandera Road, San Antonio.',
        ],
    ];

    foreach ($pages_data as $pd) {
        $exists = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$pfx}pages WHERE slug = %s", $pd['slug']
        ));
        if ($exists) continue;

        $wpdb->insert("{$pfx}pages", [
            'slug'        => $pd['slug'],
            'title'       => $pd['title'],
            'headline'    => $pd['headline'],
            'subheadline' => $pd['subheadline'],
            'store_slug'  => $pd['store_slug'],
            'seo_desc'    => $pd['seo_desc'],
            'theme_json'  => $theme,
            'is_active'   => 1,
            'published_at'=> $now,
        ]);
        $page_id = $wpdb->insert_id;
        bkdn_seed_buttons($pfx, $page_id, $pd['slug'], $opt, $maps, $ig, $fb, $website);
    }
}

function bkdn_seed_buttons(string $pfx, int $page_id, string $slug, array $opt, array $maps, string $ig, string $fb, string $website): void {
    global $wpdb;

    $shared_rows = [
        ['style_variant'=>'secondary','icon_key'=>'website',   'title'=>'Visit Main Website',    'subtitle'=>'Menu, locations, story',            'url'=>$website,                  'enabled'=>1,'sort_order'=>20],
        ['style_variant'=>'secondary','icon_key'=>'email',     'title'=>'Join Our Email Club',   'subtitle'=>'Specials, new menu drops, events',   'url'=>'',                        'enabled'=>0,'sort_order'=>30],
        ['style_variant'=>'secondary','icon_key'=>'events',    'title'=>'Specialty Ramen Events','subtitle'=>'Monthly limited-edition bowls',      'url'=>'',                        'enabled'=>0,'sort_order'=>40],
        ['style_variant'=>'secondary','icon_key'=>'instagram', 'title'=>'Instagram',             'subtitle'=>'@bakudanramen',                      'url'=>$ig,                       'enabled'=>1,'sort_order'=>50],
        ['style_variant'=>'secondary','icon_key'=>'facebook',  'title'=>'Facebook',              'subtitle'=>'Bakudan Ramen',                      'url'=>$fb,                       'enabled'=>1,'sort_order'=>60],
    ];

    $hub_specific = [
        ['style_variant'=>'primary',   'icon_key'=>'order',  'title'=>'Order Online',  'subtitle'=>'Pickup · Delivery · Catering — tap to choose location','url'=>'#','enabled'=>1,'sort_order'=>0],
        ['style_variant'=>'order_sub', 'icon_key'=>null,     'title'=>'THE RIM',       'subtitle'=>'La Cantera',    'url'=>$opt['order_rim'],       'enabled'=>1,'sort_order'=>1],
        ['style_variant'=>'order_sub', 'icon_key'=>null,     'title'=>'STONE OAK',     'subtitle'=>'Hwy 281',       'url'=>$opt['order_stone_oak'], 'enabled'=>1,'sort_order'=>2],
        ['style_variant'=>'order_sub', 'icon_key'=>null,     'title'=>'BANDERA',       'subtitle'=>'Bandera Rd',    'url'=>$opt['order_bandera'],   'enabled'=>1,'sort_order'=>3],
        ['style_variant'=>'coming_soon','icon_key'=>null,    'title'=>'Merchandise · Coming Soon','subtitle'=>null,'url'=>'#','enabled'=>1,'sort_order'=>70],
    ];

    $store_specific = [
        'rim'       => ['order_url'=>$opt['order_rim'],       'map_url'=>$maps['rim'],       'map_sub'=>'17619 La Cantera Pkwy UNIT 208'],
        'stone-oak' => ['order_url'=>$opt['order_stone_oak'], 'map_url'=>$maps['stone-oak'], 'map_sub'=>'22506 U.S. Hwy 281 N Ste 106'],
        'bandera'   => ['order_url'=>$opt['order_bandera'],   'map_url'=>$maps['bandera'],   'map_sub'=>'11309 Bandera Rd Ste 111'],
    ];

    $buttons = [];

    if ($slug === 'bakudan') {
        $buttons = array_merge($hub_specific, $shared_rows);
    } else {
        $s = $store_specific[$slug];
        $buttons = array_merge([
            ['style_variant'=>'primary',   'icon_key'=>'order',      'title'=>'Order Online',   'subtitle'=>'Pickup · Delivery · Catering', 'url'=>$s['order_url'],'enabled'=>1,'sort_order'=>0,'opens_in_new_tab'=>1],
            ['style_variant'=>'secondary', 'icon_key'=>'directions', 'title'=>'Get Directions', 'subtitle'=>$s['map_sub'],                  'url'=>$s['map_url'],  'enabled'=>1,'sort_order'=>10,'opens_in_new_tab'=>1],
        ], $shared_rows);
    }

    foreach ($buttons as $b) {
        $wpdb->insert("{$pfx}buttons", [
            'page_id'        => $page_id,
            'title'          => $b['title'],
            'subtitle'       => $b['subtitle'] ?? null,
            'icon_key'       => $b['icon_key'] ?? null,
            'url'            => $b['url'],
            'style_variant'  => $b['style_variant'],
            'sort_order'     => $b['sort_order'],
            'is_active'      => 1,
            'enabled'        => $b['enabled'] ?? 1,
            'opens_in_new_tab'=> $b['opens_in_new_tab'] ?? 1,
        ]);
    }
}
