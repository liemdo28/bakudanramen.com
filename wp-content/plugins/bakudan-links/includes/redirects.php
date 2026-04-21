<?php
defined('ABSPATH') || exit;

/**
 * Check for an active redirect rule on a page.
 * Returns the redirect rule array if one is active, null otherwise.
 * Called before rendering the link page — if active, issues the redirect and exits.
 */
function bkdn_maybe_redirect_page(int $page_id): void {
    $rule = bkdn_get_active_redirect($page_id);
    if (!$rule || empty($rule['target_url'])) return;

    $code = in_array((string)$rule['redirect_type'], ['301','302'], true)
        ? (int)$rule['redirect_type']
        : 302;

    wp_redirect(esc_url_raw($rule['target_url']), $code);
    exit;
}
