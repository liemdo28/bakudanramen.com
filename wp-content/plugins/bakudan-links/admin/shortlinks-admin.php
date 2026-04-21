<?php
defined('ABSPATH') || exit;

function bkdn_admin_shortlinks_page(): void {
    if (!current_user_can('manage_options')) return;

    // Save
    if (isset($_POST['bkdn_shortlink_nonce']) && wp_verify_nonce($_POST['bkdn_shortlink_nonce'], 'bkdn_save_shortlink')) {
        bkdn_upsert_shortlink([
            'id'           => !empty($_POST['sl_id']) ? (int)$_POST['sl_id'] : null,
            'slug'         => sanitize_title($_POST['sl_slug']       ?? ''),
            'target_url'   => esc_url_raw($_POST['sl_target']        ?? ''),
            'utm_source'   => sanitize_text_field($_POST['sl_utm_source']   ?? ''),
            'utm_medium'   => sanitize_text_field($_POST['sl_utm_medium']   ?? ''),
            'utm_campaign' => sanitize_text_field($_POST['sl_utm_campaign'] ?? ''),
            'notes'        => sanitize_text_field($_POST['sl_notes']        ?? ''),
            'is_active'    => !empty($_POST['sl_active']) ? 1 : 0,
            'start_at'     => sanitize_text_field($_POST['sl_start'] ?? '') ?: null,
            'end_at'       => sanitize_text_field($_POST['sl_end']   ?? '') ?: null,
        ]);
        bkdn_admin_notice('Shortlink saved.');
    }

    // Delete
    if (!empty($_GET['del_sl']) && !empty($_GET['_wpnonce']) && wp_verify_nonce($_GET['_wpnonce'], 'bkdn_del_sl_'.(int)$_GET['del_sl'])) {
        bkdn_delete_shortlink((int)$_GET['del_sl']);
        bkdn_admin_notice('Shortlink deleted.');
    }

    $links    = bkdn_get_all_shortlinks();
    $edit_sl  = null;
    if (!empty($_GET['edit_sl'])) {
        foreach ($links as $l) {
            if ((int)$l['id'] === (int)$_GET['edit_sl']) { $edit_sl = $l; break; }
        }
    }
    ?>
    <div class="wrap bkdn-wrap">
      <h1>Links Hub — Shortlinks</h1>
      <?php bkdn_admin_nav('bkdn-shortlinks'); ?>
      <p style="color:#888">Create short URLs like <code>bakudanramen.com/go/order</code> that redirect with UTM tracking.</p>

      <div style="display:grid;grid-template-columns:1fr 360px;gap:24px;margin-top:16px">

        <!-- List -->
        <div>
          <table class="wp-list-table widefat fixed striped">
            <thead><tr>
              <th style="width:120px">Shortlink</th>
              <th>Target</th>
              <th style="width:70px">Clicks</th>
              <th style="width:60px">Active</th>
              <th style="width:100px">Actions</th>
            </tr></thead>
            <tbody>
              <?php if (empty($links)): ?>
              <tr><td colspan="5" style="text-align:center;padding:20px;color:#888">No shortlinks yet.</td></tr>
              <?php endif; ?>
              <?php foreach ($links as $l): ?>
              <tr>
                <td>
                  <a href="<?php echo esc_url(home_url('/go/'.$l['slug'])); ?>" target="_blank">
                    /go/<?php echo esc_html($l['slug']); ?>
                  </a>
                </td>
                <td style="font-size:12px"><?php echo esc_html(substr($l['target_url'],0,55)); ?></td>
                <td><?php echo number_format($l['click_count']); ?></td>
                <td><?php echo $l['is_active'] ? '<span style="color:#46b450">●</span>' : '—'; ?></td>
                <td>
                  <a href="<?php echo admin_url('admin.php?page=bkdn-shortlinks&edit_sl='.$l['id']); ?>">Edit</a> |
                  <a href="<?php echo wp_nonce_url(admin_url('admin.php?page=bkdn-shortlinks&del_sl='.$l['id']), 'bkdn_del_sl_'.$l['id']); ?>"
                     onclick="return confirm('Delete this shortlink?')" style="color:#dc3545">Del</a>
                </td>
              </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>

        <!-- Form -->
        <div class="bkdn-panel">
          <h3><?php echo $edit_sl ? 'Edit Shortlink' : 'New Shortlink'; ?></h3>
          <form method="post">
            <?php wp_nonce_field('bkdn_save_shortlink','bkdn_shortlink_nonce'); ?>
            <?php if ($edit_sl): ?><input type="hidden" name="sl_id" value="<?php echo (int)$edit_sl['id']; ?>"><?php endif; ?>
            <p>
              <label>Slug <span style="color:red">*</span><br>
                <span style="color:#888;font-size:12px">bakudanramen.com/go/</span>
                <input type="text" name="sl_slug" value="<?php echo esc_attr($edit_sl['slug'] ?? ''); ?>" class="widefat" required placeholder="order">
              </label>
            </p>
            <p><label>Target URL <span style="color:red">*</span><br><input type="url" name="sl_target" value="<?php echo esc_attr($edit_sl['target_url'] ?? ''); ?>" class="widefat" required></label></p>
            <p><label>utm_source<br><input type="text" name="sl_utm_source" value="<?php echo esc_attr($edit_sl['utm_source'] ?? ''); ?>" class="widefat" placeholder="flyer"></label></p>
            <p><label>utm_medium<br><input type="text" name="sl_utm_medium" value="<?php echo esc_attr($edit_sl['utm_medium'] ?? ''); ?>" class="widefat" placeholder="qr"></label></p>
            <p><label>utm_campaign<br><input type="text" name="sl_utm_campaign" value="<?php echo esc_attr($edit_sl['utm_campaign'] ?? ''); ?>" class="widefat" placeholder="spring_ramen"></label></p>
            <p><label>Note<br><input type="text" name="sl_notes" value="<?php echo esc_attr($edit_sl['notes'] ?? ''); ?>" class="widefat" placeholder="For table tent QR codes"></label></p>
            <p><label>Active from<br><input type="datetime-local" name="sl_start" value="<?php echo esc_attr(str_replace(' ','T',$edit_sl['start_at'] ?? '')); ?>" class="widefat"></label></p>
            <p><label>Expires<br><input type="datetime-local" name="sl_end" value="<?php echo esc_attr(str_replace(' ','T',$edit_sl['end_at'] ?? '')); ?>" class="widefat"></label></p>
            <p><label><input type="checkbox" name="sl_active" value="1" <?php checked(!isset($edit_sl) || !empty($edit_sl['is_active'])); ?>> Active</label></p>
            <?php submit_button($edit_sl ? 'Update Shortlink' : 'Create Shortlink', 'primary', 'submit', false); ?>
            <?php if ($edit_sl): ?><a href="<?php echo admin_url('admin.php?page=bkdn-shortlinks'); ?>" class="button">Cancel</a><?php endif; ?>
          </form>
        </div>
      </div>
    </div>
    <?php
}
