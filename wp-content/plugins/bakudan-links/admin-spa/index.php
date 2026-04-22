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
  <!-- Rendered by app.js — replaced on DOMContentLoaded -->
  <div id="spa-loading" style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#fff;font-family:sans-serif">
    <div style="text-align:center">
      <div style="font-size:48px;margin-bottom:12px">爆</div>
      <div id="spa-loading-msg" style="color:#64748b;font-size:14px">Loading Links Hub...</div>
      <div id="spa-loading-err" style="display:none;margin-top:24px;max-width:380px;padding:16px 20px;background:#1e293b;border:1px solid #7f1d1d;border-radius:10px;text-align:left">
        <div style="color:#fca5a5;font-weight:600;margin-bottom:6px">&#9888; Admin failed to start</div>
        <div id="spa-err-detail" style="color:#94a3b8;font-size:12px;margin-bottom:14px">The admin interface did not load in time. Check that the plugin is active and the REST API is reachable.</div>
        <button onclick="window.location.reload()" style="padding:7px 16px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600">Reload Page</button>
      </div>
    </div>
  </div>
</div>

<script>
// Boot watchdog — independent of app.js.
// If BKDN_BOOTED is not true within 10 s, show error state.
(function () {
  var TIMEOUT = 10000;
  var t = setTimeout(function () {
    if (window.BKDN_BOOTED) return;
    var msg = document.getElementById('spa-loading-msg');
    var err = document.getElementById('spa-loading-err');
    if (msg) msg.style.display = 'none';
    if (err) err.style.display = 'block';
    var detail = document.getElementById('spa-err-detail');
    if (detail && !window.BKDN_CONFIG) {
      detail.textContent = 'BKDN_CONFIG is missing — the PHP plugin may have a fatal error. Check the server error log.';
    }
  }, TIMEOUT);
  // If app boots fast, cancel the watchdog
  document.addEventListener('bkdn:booted', function () { clearTimeout(t); });
})();
</script>

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
