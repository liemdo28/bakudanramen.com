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
  iconKeys: <?php echo wp_json_encode(['order','website','email','events','instagram','facebook','directions','phone','menu','gift','ticket','external']); ?>
};
</script>
<script src="<?php echo esc_url($plugin_url . '/admin-spa/assets/app.js'); ?>?v=<?php echo BKDN_VERSION; ?>"></script>
</body>
</html>
