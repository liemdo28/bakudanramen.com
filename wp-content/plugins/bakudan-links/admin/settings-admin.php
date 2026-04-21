<?php
defined('ABSPATH') || exit;

function bkdn_admin_settings_page(): void {
    if (!current_user_can('manage_options')) return;

    if (isset($_POST['bkdn_settings_nonce']) && wp_verify_nonce($_POST['bkdn_settings_nonce'], 'bkdn_save_settings')) {
        bkdn_save_options($_POST);
        bkdn_admin_notice('Settings saved.');
    }

    $opt = bkdn_get_options();
    ?>
    <div class="wrap bkdn-wrap">
      <h1>Links Hub — Settings</h1>
      <?php bkdn_admin_nav('bkdn-links-settings'); ?>

      <form method="post" style="max-width:800px">
        <?php wp_nonce_field('bkdn_save_settings','bkdn_settings_nonce'); ?>

        <!-- Online ordering -->
        <h2>🛒 Online Ordering (Toast)</h2>
        <table class="form-table">
          <tr><th>The Rim</th>
            <td><input type="url" name="order_rim" value="<?php echo esc_attr($opt['order_rim']); ?>" class="large-text">
            <p class="description">e.g. https://www.toasttab.com/bakudan-ramen-the-rim/v3</p></td></tr>
          <tr><th>Stone Oak</th>
            <td><input type="url" name="order_stone_oak" value="<?php echo esc_attr($opt['order_stone_oak']); ?>" class="large-text"></td></tr>
          <tr><th>Bandera</th>
            <td><input type="url" name="order_bandera" value="<?php echo esc_attr($opt['order_bandera']); ?>" class="large-text"></td></tr>
        </table>

        <!-- Social -->
        <h2 style="margin-top:2rem">📱 Social Media</h2>
        <table class="form-table">
          <tr><th>Instagram</th>
            <td><input type="url" name="instagram_url" value="<?php echo esc_attr($opt['instagram_url']); ?>" class="large-text" placeholder="https://instagram.com/bakudanramen"></td></tr>
          <tr><th>Facebook</th>
            <td><input type="url" name="facebook_url" value="<?php echo esc_attr($opt['facebook_url']); ?>" class="large-text" placeholder="https://facebook.com/bakudanramen"></td></tr>
        </table>

        <!-- Optional sections -->
        <h2 style="margin-top:2rem">⚙️ Optional Sections</h2>
        <p style="color:#666">These are hidden by default. Enable and assign a URL to show them on all pages.</p>
        <table class="form-table">
          <tr><th>Email Club</th>
            <td>
              <label><input type="checkbox" name="email_club_enabled" value="1" <?php checked($opt['email_club_enabled']); ?>> Show on link pages</label><br><br>
              <input type="url" name="email_club_url" value="<?php echo esc_attr($opt['email_club_url']); ?>" class="large-text" placeholder="https://bakudanramen.com/email-club">
              <p class="description">Leave blank to show as disabled (grayed out)</p>
            </td></tr>
          <tr><th>Events</th>
            <td>
              <label><input type="checkbox" name="events_enabled" value="1" <?php checked($opt['events_enabled']); ?>> Show on link pages</label><br><br>
              <input type="url" name="events_url" value="<?php echo esc_attr($opt['events_url']); ?>" class="large-text" placeholder="https://bakudanramen.com/events">
            </td></tr>
        </table>

        <!-- Email signup form -->
        <h2 style="margin-top:2rem">📧 Email Signup Form</h2>
        <p style="color:#666">Inline form shown at the bottom of each public link page.</p>
        <table class="form-table">
          <tr><th>Enable signup form</th>
            <td><label><input type="checkbox" name="signup_form_enabled" value="1" <?php checked($opt['signup_form_enabled']); ?>> Show inline signup form on public pages</label></td></tr>
          <tr><th>CTA text</th>
            <td><input type="text" name="signup_cta_text" value="<?php echo esc_attr($opt['signup_cta_text']); ?>" class="regular-text" placeholder="Get specials & menu drops"></td></tr>
          <tr><th>Incentive text</th>
            <td><input type="text" name="signup_incentive" value="<?php echo esc_attr($opt['signup_incentive']); ?>" class="large-text" placeholder="e.g. Be first to know about limited bowls and happy hour deals"></td></tr>
        </table>

        <!-- Quick links -->
        <h2 style="margin-top:2rem">🔗 Quick Links</h2>
        <ul style="margin:.5rem 0 0 1.5rem;list-style:disc;line-height:2">
          <li><a href="<?php echo esc_url(home_url('/links')); ?>" target="_blank">bakudanramen.com/links</a> — Main hub</li>
          <li><a href="<?php echo esc_url(home_url('/links/rim')); ?>" target="_blank">bakudanramen.com/links/rim</a></li>
          <li><a href="<?php echo esc_url(home_url('/links/stone-oak')); ?>" target="_blank">bakudanramen.com/links/stone-oak</a></li>
          <li><a href="<?php echo esc_url(home_url('/links/bandera')); ?>" target="_blank">bakudanramen.com/links/bandera</a></li>
          <li><a href="<?php echo esc_url(admin_url('admin.php?page=bkdn-shortlinks')); ?>">Shortlinks manager →</a></li>
        </ul>

        <?php submit_button('Save All Settings'); ?>
      </form>
    </div>
    <?php
}
