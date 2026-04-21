<?php
defined('ABSPATH') || exit;

function bkdn_admin_analytics_page(): void {
    if (!current_user_can('manage_options')) return;
    $period = sanitize_text_field($_GET['period'] ?? '7d');
    $stats  = bkdn_get_global_analytics($period);
    ?>
    <div class="wrap bkdn-wrap">
      <h1>Links Hub — Analytics</h1>
      <?php bkdn_admin_nav('bkdn-analytics'); ?>

      <div style="display:flex;gap:8px;margin:16px 0">
        <?php foreach (['1d'=>'Today','7d'=>'7 days','30d'=>'30 days'] as $k=>$v): ?>
        <a href="<?php echo admin_url("admin.php?page=bkdn-analytics&period={$k}"); ?>"
           class="button<?php echo $period===$k?' button-primary':''; ?>"><?php echo $v; ?></a>
        <?php endforeach; ?>
      </div>

      <div class="bkdn-stats-row">
        <div class="bkdn-stat"><span><?php echo number_format($stats['total_views']); ?></span>Total Page Views</div>
        <div class="bkdn-stat"><span><?php echo number_format($stats['total_clicks']); ?></span>Total Button Clicks</div>
      </div>

      <?php if (!empty($stats['top_pages'])): ?>
      <h3 style="margin-top:24px">Top Pages</h3>
      <table class="wp-list-table widefat fixed striped">
        <thead><tr>
          <th>Page</th>
          <th style="width:100px">Views</th>
          <th style="width:140px">Actions</th>
        </tr></thead>
        <tbody>
          <?php foreach ($stats['top_pages'] as $tp): ?>
          <tr>
            <td>
              <strong><?php echo esc_html($tp['title'] ?? 'Page #'.$tp['page_id']); ?></strong><br>
              <code>/links/<?php echo esc_html($tp['slug'] ?? ''); ?></code>
            </td>
            <td><?php echo number_format($tp['views']); ?></td>
            <td>
              <a href="<?php echo admin_url('admin.php?page=bkdn-links&action=edit&page_id='.$tp['page_id'].'&tab=analytics&period='.$period); ?>">Detail →</a>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
      <?php else: ?>
      <p style="color:#888;margin-top:20px">No analytics data yet. Data appears after visitors land on your link pages.</p>
      <?php endif; ?>
    </div>
    <?php
}
