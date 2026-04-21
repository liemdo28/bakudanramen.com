<?php
defined('ABSPATH') || exit;

function bkdn_admin_pages_page(): void {
    if (!current_user_can('manage_options')) return;

    // ── Sub-action: edit single page ──────────────────────────────────
    if (isset($_GET['action']) && $_GET['action'] === 'edit' && !empty($_GET['page_id'])) {
        bkdn_admin_page_editor((int)$_GET['page_id']);
        return;
    }

    // ── Sub-action: new page ───────────────────────────────────────────
    if (isset($_GET['action']) && $_GET['action'] === 'new') {
        bkdn_admin_page_editor(0);
        return;
    }

    // ── Sub-action: delete page ────────────────────────────────────────
    if (isset($_GET['action']) && $_GET['action'] === 'delete' && !empty($_GET['page_id'])) {
        check_admin_referer('bkdn_delete_page_' . (int)$_GET['page_id']);
        bkdn_delete_page((int)$_GET['page_id']);
        wp_redirect(admin_url('admin.php?page=bkdn-links&deleted=1'));
        exit;
    }

    // ── List pages ────────────────────────────────────────────────────
    if (isset($_GET['deleted'])) bkdn_admin_notice('Page deleted.');

    $pages = bkdn_get_all_pages();
    ?>
    <div class="wrap bkdn-wrap">
      <h1 class="wp-heading-inline">Links Hub — Pages</h1>
      <a href="<?php echo admin_url('admin.php?page=bkdn-links&action=new'); ?>" class="page-title-action">Add New</a>
      <?php bkdn_admin_nav('bkdn-links'); ?>
      <table class="wp-list-table widefat fixed striped">
        <thead>
          <tr>
            <th style="width:120px">Slug</th>
            <th>Title</th>
            <th style="width:100px">Store</th>
            <th style="width:60px">Active</th>
            <th style="width:120px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <?php if (empty($pages)): ?>
          <tr><td colspan="5" style="text-align:center;padding:20px;color:#888">No pages yet. <a href="<?php echo admin_url('admin.php?page=bkdn-links&action=new'); ?>">Add one</a>.</td></tr>
          <?php endif; ?>
          <?php foreach ($pages as $page): ?>
          <tr>
            <td><code><?php echo esc_html($page['slug']); ?></code></td>
            <td>
              <strong><?php echo esc_html($page['title']); ?></strong><br>
              <span style="color:#888;font-size:11px">
                <a href="<?php echo esc_url(home_url('/links/' . $page['slug'])); ?>" target="_blank">↗ View public</a>
              </span>
            </td>
            <td><?php echo esc_html($page['store_slug'] ?: '—'); ?></td>
            <td><?php echo $page['is_active'] ? '<span style="color:#46b450">●</span>' : '<span style="color:#dc3545">●</span>'; ?></td>
            <td>
              <a href="<?php echo admin_url('admin.php?page=bkdn-links&action=edit&page_id='.$page['id']); ?>">Edit</a> |
              <a href="<?php echo wp_nonce_url(admin_url('admin.php?page=bkdn-links&action=delete&page_id='.$page['id']), 'bkdn_delete_page_'.$page['id']); ?>"
                 onclick="return confirm('Delete this page and all its buttons?')" style="color:#dc3545">Delete</a>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <?php
}

/* ─── Page editor ─────────────────────────────────────────────────── */

function bkdn_admin_page_editor(int $page_id): void {
    $page    = $page_id ? bkdn_get_page_by_id($page_id) : null;
    $buttons = $page_id ? bkdn_get_all_buttons_for_page($page_id) : [];
    $is_new  = !$page_id;

    // ── Handle page settings save ──────────────────────────────────────
    if (isset($_POST['bkdn_page_nonce']) && wp_verify_nonce($_POST['bkdn_page_nonce'], 'bkdn_save_page')) {
        $theme = [
            'bg_color'              => sanitize_hex_color($_POST['bg_color']              ?? '#0a0a0a'),
            'card_color'            => sanitize_hex_color($_POST['card_color']            ?? '#141414'),
            'accent_color'          => sanitize_hex_color($_POST['accent_color']          ?? '#B91C1C'),
            'button_primary_color'  => sanitize_hex_color($_POST['button_primary_color']  ?? '#B91C1C'),
            'text_primary'          => sanitize_hex_color($_POST['text_primary']          ?? '#ffffff'),
            'text_secondary'        => sanitize_hex_color($_POST['text_secondary']        ?? '#888888'),
            'border_color'          => sanitize_hex_color($_POST['border_color']          ?? '#262626'),
        ];
        $saved_id = bkdn_upsert_page([
            'id'           => $page_id ?: null,
            'slug'         => sanitize_title($_POST['slug'] ?? ''),
            'title'        => sanitize_text_field($_POST['title']       ?? ''),
            'headline'     => sanitize_text_field($_POST['headline']    ?? ''),
            'subheadline'  => sanitize_text_field($_POST['subheadline'] ?? ''),
            'store_slug'   => sanitize_text_field($_POST['store_slug']  ?? ''),
            'seo_desc'     => sanitize_textarea_field($_POST['seo_desc'] ?? ''),
            'is_active'    => !empty($_POST['is_active']) ? 1 : 0,
            'theme_json'   => wp_json_encode($theme),
        ]);
        if ($is_new) {
            wp_redirect(admin_url("admin.php?page=bkdn-links&action=edit&page_id={$saved_id}&saved=1"));
            exit;
        }
        $page    = bkdn_get_page_by_id($saved_id);
        $page_id = $saved_id;
        bkdn_admin_notice('Page settings saved.');
    }

    // ── Handle button add/edit ─────────────────────────────────────────
    if (isset($_POST['bkdn_btn_nonce']) && wp_verify_nonce($_POST['bkdn_btn_nonce'], 'bkdn_save_button')) {
        bkdn_upsert_button([
            'id'              => !empty($_POST['btn_id']) ? (int)$_POST['btn_id'] : null,
            'page_id'         => $page_id,
            'title'           => sanitize_text_field($_POST['btn_title']    ?? ''),
            'subtitle'        => sanitize_text_field($_POST['btn_subtitle'] ?? ''),
            'url'             => esc_url_raw($_POST['btn_url']              ?? ''),
            'icon_key'        => sanitize_text_field($_POST['btn_icon']     ?? ''),
            'style_variant'   => sanitize_text_field($_POST['btn_style']    ?? 'secondary'),
            'sort_order'      => (int)($_POST['btn_sort']                   ?? 0),
            'enabled'         => !empty($_POST['btn_enabled'])         ? 1 : 0,
            'is_featured'     => !empty($_POST['btn_featured'])        ? 1 : 0,
            'is_revenue_cta'  => !empty($_POST['btn_revenue'])         ? 1 : 0,
            'opens_in_new_tab'=> !empty($_POST['btn_new_tab'])         ? 1 : 0,
            'start_at'        => sanitize_text_field($_POST['btn_start_at'] ?? ''),
            'end_at'          => sanitize_text_field($_POST['btn_end_at']   ?? ''),
        ]);
        $buttons = bkdn_get_all_buttons_for_page($page_id);
        bkdn_admin_notice('Button saved.');
    }

    // ── Handle button delete ───────────────────────────────────────────
    if (isset($_GET['del_btn']) && isset($_GET['_wpnonce']) && wp_verify_nonce($_GET['_wpnonce'], 'bkdn_del_btn_'.(int)$_GET['del_btn'])) {
        bkdn_delete_button((int)$_GET['del_btn']);
        $buttons = bkdn_get_all_buttons_for_page($page_id);
        bkdn_admin_notice('Button deleted.');
    }

    // ── Handle redirect rules ──────────────────────────────────────────
    if (isset($_POST['bkdn_redirect_nonce']) && wp_verify_nonce($_POST['bkdn_redirect_nonce'], 'bkdn_save_redirect')) {
        bkdn_upsert_redirect([
            'id'            => !empty($_POST['redirect_id']) ? (int)$_POST['redirect_id'] : null,
            'page_id'       => $page_id,
            'is_active'     => !empty($_POST['redirect_active']) ? 1 : 0,
            'redirect_type' => sanitize_text_field($_POST['redirect_type'] ?? '302'),
            'target_url'    => esc_url_raw($_POST['redirect_url']          ?? ''),
            'start_at'      => sanitize_text_field($_POST['redirect_start'] ?? '') ?: null,
            'end_at'        => sanitize_text_field($_POST['redirect_end']   ?? '') ?: null,
            'notes'         => sanitize_textarea_field($_POST['redirect_notes'] ?? ''),
        ]);
        bkdn_admin_notice('Redirect rule saved.');
    }

    $redirects   = $page_id ? bkdn_get_all_redirects_for_page($page_id) : [];
    $active_redir= $page_id ? bkdn_get_active_redirect($page_id) : null;
    $theme       = ($page && $page['theme']) ? $page['theme'] : bkdn_default_theme();
    $public_url  = $page_id ? esc_url(home_url('/links/' . $page['slug'])) : '';

    $tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'buttons';
    ?>
    <div class="wrap bkdn-wrap">
      <h1>
        <?php echo $is_new ? 'New Page' : 'Edit: ' . esc_html($page['title'] ?? ''); ?>
        <?php if ($public_url): ?>
        <a href="<?php echo $public_url; ?>" target="_blank" class="page-title-action">↗ View Page</a>
        <?php endif; ?>
        <a href="<?php echo admin_url('admin.php?page=bkdn-links'); ?>" class="page-title-action">← All Pages</a>
      </h1>
      <?php if ($active_redir): ?>
      <div class="notice notice-warning"><p>⚠️ <strong>Active redirect:</strong> Visitors are currently being sent to <code><?php echo esc_html($active_redir['target_url']); ?></code></p></div>
      <?php endif; ?>

      <!-- Tab navigation -->
      <?php
      $tabs = ['settings'=>'⚙ Settings','buttons'=>'🔗 Buttons','redirects'=>'↪ Redirects'];
      if (!$is_new) $tabs['analytics'] = '📊 Analytics';
      echo '<nav class="nav-tab-wrapper">';
      foreach ($tabs as $key => $label) {
          $url = admin_url("admin.php?page=bkdn-links&action=edit&page_id={$page_id}&tab={$key}");
          $cls = ($tab === $key) ? ' nav-tab-active' : '';
          echo "<a href=\"{$url}\" class=\"nav-tab{$cls}\">{$label}</a>";
      }
      echo '</nav>';
      ?>

      <!-- SETTINGS TAB -->
      <?php if ($tab === 'settings'): ?>
      <form method="post" class="bkdn-form">
        <?php wp_nonce_field('bkdn_save_page','bkdn_page_nonce'); ?>
        <table class="form-table">
          <tr><th>Slug <span style="color:red">*</span></th>
            <td><input type="text" name="slug" value="<?php echo esc_attr($page['slug'] ?? ''); ?>" required class="regular-text">
            <p class="description">URL: bakudanramen.com/links/<strong><?php echo esc_html($page['slug'] ?? 'your-slug'); ?></strong></p></td></tr>
          <tr><th>Title</th>
            <td><input type="text" name="title" value="<?php echo esc_attr($page['title'] ?? ''); ?>" class="large-text"></td></tr>
          <tr><th>Headline</th>
            <td><input type="text" name="headline" value="<?php echo esc_attr($page['headline'] ?? ''); ?>" class="large-text"></td></tr>
          <tr><th>Subheadline</th>
            <td><input type="text" name="subheadline" value="<?php echo esc_attr($page['subheadline'] ?? ''); ?>" class="large-text"></td></tr>
          <tr><th>Store Slug</th>
            <td><input type="text" name="store_slug" value="<?php echo esc_attr($page['store_slug'] ?? ''); ?>" class="regular-text" placeholder="rim | stone-oak | bandera | (blank for hub)"></td></tr>
          <tr><th>SEO Description</th>
            <td><textarea name="seo_desc" rows="2" class="large-text"><?php echo esc_textarea($page['seo_desc'] ?? ''); ?></textarea></td></tr>
          <tr><th>Active</th>
            <td><label><input type="checkbox" name="is_active" value="1" <?php checked($page['is_active'] ?? 1); ?>> Published and visible</label></td></tr>
        </table>

        <h3>Theme Colors</h3>
        <table class="form-table">
          <?php
          $color_fields = [
            'bg_color'             => 'Background',
            'card_color'           => 'Card / Row background',
            'accent_color'         => 'Accent (borders, icons)',
            'button_primary_color' => 'Primary button hover',
            'text_primary'         => 'Primary text',
            'text_secondary'       => 'Secondary text',
            'border_color'         => 'Border color',
          ];
          foreach ($color_fields as $fname => $flabel):
          ?>
          <tr><th><?php echo esc_html($flabel); ?></th>
            <td><input type="color" name="<?php echo esc_attr($fname); ?>"
                       value="<?php echo esc_attr($theme[$fname] ?? '#000000'); ?>">
                <code><?php echo esc_html($theme[$fname] ?? ''); ?></code></td></tr>
          <?php endforeach; ?>
        </table>
        <?php submit_button('Save Page Settings'); ?>
      </form>

      <!-- BUTTONS TAB -->
      <?php elseif ($tab === 'buttons'): ?>
      <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;margin-top:16px">

        <!-- Button list -->
        <div>
          <h3>Buttons <small style="font-weight:400;color:#888">(drag to reorder — coming soon)</small></h3>
          <table class="wp-list-table widefat fixed striped bkdn-btn-table">
            <thead><tr>
              <th style="width:32px">#</th>
              <th>Title</th>
              <th style="width:80px">Style</th>
              <th style="width:50px">On</th>
              <th style="width:100px">Actions</th>
            </tr></thead>
            <tbody>
              <?php foreach ($buttons as $i => $btn): ?>
              <tr>
                <td style="color:#888"><?php echo $i+1; ?></td>
                <td>
                  <strong><?php echo esc_html($btn['title']); ?></strong>
                  <?php if ($btn['is_featured']): ?> <span class="bkdn-badge-feat">★ Featured</span><?php endif; ?>
                  <?php if ($btn['is_revenue_cta']): ?> <span class="bkdn-badge-rev">$ Revenue</span><?php endif; ?>
                  <?php if (!empty($btn['url']) && $btn['url'] !== '#'): ?>
                  <br><span style="font-size:11px;color:#888"><?php echo esc_html(substr($btn['url'],0,50)); ?></span>
                  <?php endif; ?>
                </td>
                <td><code><?php echo esc_html($btn['style_variant']); ?></code></td>
                <td><?php echo $btn['enabled'] ? '✓' : '—'; ?></td>
                <td>
                  <a href="<?php echo admin_url("admin.php?page=bkdn-links&action=edit&page_id={$page_id}&tab=buttons&edit_btn={$btn['id']}"); ?>">Edit</a> |
                  <a href="<?php echo wp_nonce_url(admin_url("admin.php?page=bkdn-links&action=edit&page_id={$page_id}&tab=buttons&del_btn={$btn['id']}"), 'bkdn_del_btn_'.$btn['id']); ?>"
                     onclick="return confirm('Delete this button?')" style="color:#dc3545">Del</a>
                </td>
              </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>

        <!-- Add/edit button form -->
        <?php
        $edit_btn = null;
        if (!empty($_GET['edit_btn'])) {
            $edit_btn = bkdn_get_button_by_id((int)$_GET['edit_btn']);
        }
        ?>
        <div class="bkdn-panel">
          <h3><?php echo $edit_btn ? 'Edit Button' : 'Add Button'; ?></h3>
          <form method="post">
            <?php wp_nonce_field('bkdn_save_button','bkdn_btn_nonce'); ?>
            <?php if ($edit_btn): ?>
            <input type="hidden" name="btn_id" value="<?php echo (int)$edit_btn['id']; ?>">
            <?php endif; ?>
            <p>
              <label>Title<br><input type="text" name="btn_title" value="<?php echo esc_attr($edit_btn['title'] ?? ''); ?>" class="widefat" required></label>
            </p>
            <p>
              <label>Subtitle<br><input type="text" name="btn_subtitle" value="<?php echo esc_attr($edit_btn['subtitle'] ?? ''); ?>" class="widefat" placeholder="Description under title"></label>
            </p>
            <p>
              <label>URL<br><input type="text" name="btn_url" value="<?php echo esc_attr($edit_btn['url'] ?? ''); ?>" class="widefat" placeholder="https://..."></label>
            </p>
            <p>
              <label>Style<br>
                <select name="btn_style" class="widefat">
                  <?php
                  $styles = ['secondary','primary','order_sub','coming_soon'];
                  foreach ($styles as $sv):
                  ?>
                  <option value="<?php echo $sv; ?>" <?php selected($edit_btn['style_variant'] ?? 'secondary', $sv); ?>><?php echo $sv; ?></option>
                  <?php endforeach; ?>
                </select>
              </label>
            </p>
            <p>
              <label>Icon key<br>
                <input type="text" name="btn_icon" value="<?php echo esc_attr($edit_btn['icon_key'] ?? ''); ?>" class="widefat" placeholder="order, website, email, instagram...">
              </label>
            </p>
            <p>
              <label>Sort order<br><input type="number" name="btn_sort" value="<?php echo (int)($edit_btn['sort_order'] ?? 0); ?>" class="small-text"></label>
            </p>
            <p>
              <label><input type="checkbox" name="btn_enabled" value="1" <?php checked($edit_btn['enabled'] ?? 1); ?>> Enabled (visible)</label>
            </p>
            <p>
              <label><input type="checkbox" name="btn_featured" value="1" <?php checked(!empty($edit_btn['is_featured'])); ?>> ★ Featured</label>
            </p>
            <p>
              <label><input type="checkbox" name="btn_revenue" value="1" <?php checked(!empty($edit_btn['is_revenue_cta'])); ?>> $ Revenue CTA</label>
            </p>
            <p>
              <label><input type="checkbox" name="btn_new_tab" value="1" <?php checked(!empty($edit_btn['opens_in_new_tab'])); ?>> Open in new tab</label>
            </p>
            <p>
              <label>Show from (optional)<br><input type="datetime-local" name="btn_start_at" value="<?php echo esc_attr(str_replace(' ','T',$edit_btn['start_at'] ?? '')); ?>" class="widefat"></label>
            </p>
            <p>
              <label>Hide after (optional)<br><input type="datetime-local" name="btn_end_at" value="<?php echo esc_attr(str_replace(' ','T',$edit_btn['end_at'] ?? '')); ?>" class="widefat"></label>
            </p>
            <?php submit_button($edit_btn ? 'Update Button' : 'Add Button', 'primary', 'submit', false); ?>
            <?php if ($edit_btn): ?>
            <a href="<?php echo admin_url("admin.php?page=bkdn-links&action=edit&page_id={$page_id}&tab=buttons"); ?>" class="button">Cancel</a>
            <?php endif; ?>
          </form>
        </div>
      </div>

      <!-- REDIRECTS TAB -->
      <?php elseif ($tab === 'redirects'): ?>
      <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;margin-top:16px">
        <div>
          <h3>Redirect Rules</h3>
          <p style="color:#888;font-size:13px">When an active rule exists, visitors are redirected instead of seeing the link page.</p>
          <?php if (empty($redirects)): ?>
          <p style="color:#888">No redirect rules yet.</p>
          <?php else: ?>
          <table class="wp-list-table widefat fixed striped">
            <thead><tr><th>Target URL</th><th style="width:60px">Type</th><th style="width:60px">Active</th><th style="width:80px">Actions</th></tr></thead>
            <tbody>
              <?php foreach ($redirects as $r): ?>
              <tr>
                <td><?php echo esc_html(substr($r['target_url'],0,60)); ?><br><small style="color:#888"><?php echo esc_html($r['notes'] ?? ''); ?></small></td>
                <td><code><?php echo esc_html($r['redirect_type']); ?></code></td>
                <td><?php echo $r['is_active'] ? '<span style="color:#46b450">●</span>' : '—'; ?></td>
                <td>
                  <a href="<?php echo admin_url("admin.php?page=bkdn-links&action=edit&page_id={$page_id}&tab=redirects&edit_redir={$r['id']}"); ?>">Edit</a> |
                  <a href="<?php echo wp_nonce_url(admin_url("admin.php?page=bkdn-links&action=edit&page_id={$page_id}&tab=redirects&del_redir={$r['id']}"), 'bkdn_del_redir_'.$r['id']); ?>"
                     onclick="return confirm('Delete redirect?')" style="color:#dc3545">Del</a>
                </td>
              </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
          <?php endif; ?>
        </div>
        <?php
        // Handle delete redirect
        if (!empty($_GET['del_redir']) && !empty($_GET['_wpnonce']) && wp_verify_nonce($_GET['_wpnonce'], 'bkdn_del_redir_'.(int)$_GET['del_redir'])) {
            bkdn_delete_redirect((int)$_GET['del_redir']);
            echo '<script>location.href=location.href.replace(/&del_redir=\d+/,"").replace(/&_wpnonce=[^&]+/,"");</script>';
        }
        $edit_redir = null;
        if (!empty($_GET['edit_redir'])) {
            global $wpdb;
            $edit_redir = $wpdb->get_row($wpdb->prepare("SELECT * FROM ".bkdn_pfx()."redirect_rules WHERE id=%d",(int)$_GET['edit_redir']),ARRAY_A);
        }
        ?>
        <div class="bkdn-panel">
          <h3><?php echo $edit_redir ? 'Edit Rule' : 'New Redirect Rule'; ?></h3>
          <form method="post">
            <?php wp_nonce_field('bkdn_save_redirect','bkdn_redirect_nonce'); ?>
            <?php if ($edit_redir): ?><input type="hidden" name="redirect_id" value="<?php echo (int)$edit_redir['id']; ?>"><?php endif; ?>
            <p><label>Target URL <span style="color:red">*</span><br><input type="url" name="redirect_url" value="<?php echo esc_attr($edit_redir['target_url'] ?? ''); ?>" class="widefat" required></label></p>
            <p><label>Type<br>
              <select name="redirect_type" class="widefat">
                <option value="302" <?php selected($edit_redir['redirect_type'] ?? '302','302'); ?>>302 Temporary (recommended)</option>
                <option value="301" <?php selected($edit_redir['redirect_type'] ?? '','301'); ?>>301 Permanent</option>
              </select></label>
            </p>
            <p><label>Active from (optional)<br><input type="datetime-local" name="redirect_start" value="<?php echo esc_attr(str_replace(' ','T',$edit_redir['start_at'] ?? '')); ?>" class="widefat"></label></p>
            <p><label>Expires (optional)<br><input type="datetime-local" name="redirect_end" value="<?php echo esc_attr(str_replace(' ','T',$edit_redir['end_at'] ?? '')); ?>" class="widefat"></label></p>
            <p><label>Note<br><textarea name="redirect_notes" rows="2" class="widefat" placeholder="e.g. Spring promo redirect"><?php echo esc_textarea($edit_redir['notes'] ?? ''); ?></textarea></label></p>
            <p><label><input type="checkbox" name="redirect_active" value="1" <?php checked($edit_redir ? $edit_redir['is_active'] : 0); ?>> Active now</label></p>
            <?php submit_button($edit_redir ? 'Update Rule' : 'Save Rule', 'primary', 'submit', false); ?>
          </form>
        </div>
      </div>

      <!-- ANALYTICS TAB -->
      <?php elseif ($tab === 'analytics'): ?>
      <?php
      $period  = sanitize_text_field($_GET['period'] ?? '7d');
      $stats   = bkdn_get_analytics_summary($page_id, $period);
      $ctr     = $stats['views'] > 0 ? round($stats['clicks'] / $stats['views'] * 100, 1) : 0;
      ?>
      <div style="margin-top:16px">
        <div style="display:flex;gap:8px;margin-bottom:20px">
          <?php foreach (['1d'=>'Today','7d'=>'7 days','30d'=>'30 days'] as $k=>$v): ?>
          <a href="<?php echo admin_url("admin.php?page=bkdn-links&action=edit&page_id={$page_id}&tab=analytics&period={$k}"); ?>"
             class="button<?php echo $period===$k?' button-primary':''; ?>"><?php echo $v; ?></a>
          <?php endforeach; ?>
        </div>
        <div class="bkdn-stats-row">
          <div class="bkdn-stat"><span><?php echo number_format($stats['views']); ?></span>Page Views</div>
          <div class="bkdn-stat"><span><?php echo number_format($stats['clicks']); ?></span>Button Clicks</div>
          <div class="bkdn-stat"><span><?php echo $ctr; ?>%</span>CTR</div>
        </div>
        <?php if (!empty($stats['top_buttons'])): ?>
        <h3 style="margin-top:20px">Top Buttons</h3>
        <table class="wp-list-table widefat fixed">
          <thead><tr><th>Button</th><th style="width:100px">Clicks</th></tr></thead>
          <tbody>
            <?php foreach ($stats['top_buttons'] as $tb): ?>
            <tr><td><?php echo esc_html($tb['title'] ?? 'Button #'.$tb['button_id']); ?></td><td><?php echo number_format($tb['clicks']); ?></td></tr>
            <?php endforeach; ?>
          </tbody>
        </table>
        <?php endif; ?>
        <?php if (!empty($stats['devices'])): ?>
        <h3 style="margin-top:20px">Device Breakdown</h3>
        <table class="wp-list-table widefat fixed">
          <thead><tr><th>Device</th><th style="width:100px">Views</th></tr></thead>
          <tbody>
            <?php foreach ($stats['devices'] as $d): ?>
            <tr><td><?php echo esc_html(ucfirst($d['device_type'] ?? 'unknown')); ?></td><td><?php echo number_format($d['cnt']); ?></td></tr>
            <?php endforeach; ?>
          </tbody>
        </table>
        <?php endif; ?>
      </div>
      <?php endif; ?>

    </div>
    <?php
}
