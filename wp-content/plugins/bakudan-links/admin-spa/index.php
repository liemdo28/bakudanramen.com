<?php
/**
 * Serves the marketing admin SPA shell at /links-admin.
 * Called by bakudan-links.php template_redirect hook.
 * No WordPress admin UI exposed — pure standalone page.
 */
defined('ABSPATH') || exit;

$plugin_url = plugins_url('bakudan-links');
$rest_root  = rest_url('bkdn/v1');
$site_url   = home_url();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Links Hub — Admin</title>
<link rel="stylesheet" href="<?php echo esc_url($plugin_url . '/admin-spa/assets/app.css'); ?>?v=<?php echo BKDN_VERSION; ?>">
</head>
<body class="bkdn-spa">

<div id="app">
  <!-- Rendered by app.js -->
  <div id="spa-loading" style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#fff;font-family:sans-serif">
    <div style="text-align:center">
      <div style="font-size:48px;margin-bottom:12px">爆</div>
      <div style="color:#64748b">Loading Links Hub...</div>
    </div>
  </div>
</div>

<script>
window.BKDN_CONFIG = {
  rest:    <?php echo wp_json_encode($rest_root); ?>,
  siteUrl: <?php echo wp_json_encode($site_url); ?>,
  version: <?php echo wp_json_encode(BKDN_VERSION); ?>,
  iconKeys: <?php echo wp_json_encode(['order','website','email','events','instagram','facebook','directions','phone','menu','gift','ticket','external']); ?>,
  project: {
    key:           'bakudan-links',
    name:          'Bakudan Ramen — Links Ecosystem',
    description:   'Agency-managed project covering the main website, public link hub (used behind QR codes on table tents and flyers), and the marketing admin dashboard.',
    purpose:       'Replace Linktree subscription. Full control over links, analytics, scheduling, and QR campaigns — no external dependency.',
    owner_team:    'Marketing / Agency',
    support:       'admin@bakudanramen.com',
    status:        'active',
    version:       <?php echo wp_json_encode(BKDN_VERSION); ?>,
    deployed_at:   <?php echo wp_json_encode(date('c', filemtime(BKDN_PLUGIN_FILE))); ?>,
    git_repo:      'https://github.com/liemdo28/bakudanramen.com',
    environment:   'production',
    resources: [
      { type:'website',       label:'Main Website',          url:<?php echo wp_json_encode($site_url); ?>,              desc:'Public brand website for Bakudan Ramen' },
      { type:'public_links',  label:'Public Links Page',     url:<?php echo wp_json_encode($site_url . '/links'); ?>,   desc:'Customer-facing link hub — used behind QR codes on table tents and flyers for all 4 stores' },
      { type:'admin_console', label:'Links Admin Dashboard', url:<?php echo wp_json_encode($site_url . '/links-admin'); ?>, desc:'Internal marketing dashboard for managing /links without code or WordPress access' }
    ],
    stores: [
      { slug:'rim',        name:'The Rim',    address:'17619 La Cantera Pkwy #208' },
      { slug:'stone-oak',  name:'Stone Oak',  address:'22506 US Hwy 281 N #106' },
      { slug:'bandera',    name:'Bandera',    address:'11309 Bandera Rd #111' }
    ],
    notes: [
      'Changes to /links reflect immediately — no deployment needed.',
      'QR codes point to /links/{slug}. Do NOT change page slugs after printing.',
      'To add new buttons: Pages → select store → Buttons tab.',
      'Schedule a button using start_at / end_at — it will auto show/hide.',
      'Instagram and Facebook always show from Settings if no DB button exists.'
    ]
  }
};
</script>
<script src="<?php echo esc_url($plugin_url . '/admin-spa/assets/app.js'); ?>?v=<?php echo BKDN_VERSION; ?>"></script>
</body>
</html>
