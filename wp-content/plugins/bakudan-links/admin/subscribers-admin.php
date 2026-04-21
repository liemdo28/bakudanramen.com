<?php
defined('ABSPATH') || exit;

function bkdn_admin_subscribers_page(): void {
    if (!current_user_can('manage_options')) return;

    // CSV export
    if (!empty($_GET['export']) && $_GET['export'] === 'csv') {
        check_admin_referer('bkdn_export_subscribers');
        bkdn_export_subscribers_csv();
        exit;
    }

    $current_page = max(1, (int)($_GET['paged'] ?? 1));
    $data         = bkdn_get_all_subscribers($current_page, 50);
    $total_pages  = (int)ceil($data['total'] / $data['per']);
    ?>
    <div class="wrap bkdn-wrap">
      <h1 class="wp-heading-inline">Links Hub — Subscribers</h1>
      <a href="<?php echo wp_nonce_url(admin_url('admin.php?page=bkdn-subscribers&export=csv'), 'bkdn_export_subscribers'); ?>"
         class="page-title-action">⬇ Export CSV</a>
      <?php bkdn_admin_nav('bkdn-subscribers'); ?>

      <p style="color:#888">
        <?php echo number_format($data['total']); ?> total subscribers.
        <?php if ($data['total'] === 0): ?>
        Enable the signup form in <a href="<?php echo admin_url('admin.php?page=bkdn-links-settings'); ?>">Settings</a> to start capturing emails.
        <?php endif; ?>
      </p>

      <table class="wp-list-table widefat fixed striped">
        <thead><tr>
          <th>Email</th>
          <th style="width:120px">Name</th>
          <th style="width:100px">Source</th>
          <th style="width:120px">Campaign</th>
          <th style="width:80px">Status</th>
          <th style="width:140px">Date</th>
        </tr></thead>
        <tbody>
          <?php if (empty($data['rows'])): ?>
          <tr><td colspan="6" style="text-align:center;padding:20px;color:#888">No subscribers yet.</td></tr>
          <?php endif; ?>
          <?php foreach ($data['rows'] as $s): ?>
          <tr>
            <td><?php echo esc_html($s['email']); ?></td>
            <td><?php echo esc_html($s['first_name'] ?: '—'); ?></td>
            <td><?php echo esc_html($s['page_slug'] ? '/links/'.$s['page_slug'] : '—'); ?></td>
            <td><?php echo esc_html($s['campaign_name'] ?: '—'); ?></td>
            <td><span class="bkdn-status-<?php echo esc_attr($s['integration_status']); ?>"><?php echo esc_html($s['integration_status']); ?></span></td>
            <td style="font-size:12px"><?php echo esc_html(wp_date('M j, Y g:i a', strtotime($s['created_at']))); ?></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>

      <?php if ($total_pages > 1): ?>
      <div class="tablenav bottom"><div class="tablenav-pages">
        <?php for ($i=1; $i<=$total_pages; $i++): ?>
        <a href="<?php echo admin_url("admin.php?page=bkdn-subscribers&paged={$i}"); ?>"
           class="<?php echo $i===$current_page ? 'button button-primary' : 'button'; ?>"><?php echo $i; ?></a>
        <?php endfor; ?>
      </div></div>
      <?php endif; ?>
    </div>
    <?php
}

function bkdn_export_subscribers_csv(): void {
    global $wpdb;
    $pfx  = bkdn_pfx();
    $rows = $wpdb->get_results(
        "SELECT s.*, p.slug as page_slug FROM {$pfx}subscribers s
         LEFT JOIN {$pfx}pages p ON p.id = s.source_page_id
         ORDER BY s.created_at DESC",
        ARRAY_A
    ) ?: [];

    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="bakudan-subscribers-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['email','first_name','source_page','campaign_name','status','created_at']);
    foreach ($rows as $r) {
        fputcsv($out, [$r['email'], $r['first_name'] ?? '', $r['page_slug'] ?? '', $r['campaign_name'] ?? '', $r['integration_status'], $r['created_at']]);
    }
    fclose($out);
}
