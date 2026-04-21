<?php
defined('ABSPATH') || exit;

/* ─── REST handler: POST /bkdn/v1/subscribe ─────────────────────── */

add_action('rest_api_init', function () {
    register_rest_route('bkdn/v1', '/subscribe', [
        'methods'             => 'POST',
        'callback'            => 'bkdn_rest_subscribe',
        'permission_callback' => '__return_true',
    ]);
});

function bkdn_rest_subscribe(WP_REST_Request $req): WP_REST_Response {
    $email = sanitize_email($req->get_param('email') ?? '');

    if (!is_email($email)) {
        return new WP_REST_Response(['success' => false, 'message' => 'Invalid email address.'], 400);
    }

    $result = bkdn_insert_subscriber([
        'email'          => $email,
        'first_name'     => sanitize_text_field($req->get_param('first_name')    ?? ''),
        'source_page_id' => (int)$req->get_param('source_page_id'),
        'store_slug'     => sanitize_text_field($req->get_param('store_slug')    ?? ''),
        'campaign_name'  => sanitize_text_field($req->get_param('campaign_name') ?? ''),
    ]);

    if ($result === 'already_subscribed') {
        return new WP_REST_Response(['success' => true, 'message' => 'Already subscribed!'], 200);
    }

    if ($result !== true) {
        return new WP_REST_Response(['success' => false, 'message' => 'Could not save. Please try again.'], 500);
    }

    return new WP_REST_Response(['success' => true, 'message' => 'Subscribed!'], 200);
}
