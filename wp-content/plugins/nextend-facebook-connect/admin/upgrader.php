<?php

use NSL\Notices;

class NextendSocialUpgrader {

    const PLUGIN_SLUG = 'nextend-social-login-pro';
    const PLUGIN_FILE = 'nextend-social-login-pro/nextend-social-login-pro.php';
    const UPDATE_CACHE_KEY = 'nsl_pro_plugin_information';

    const CLEAR_CACHE_KEY = 'nsl_pro_clear_update_cache';
    const UPDATE_SUCCESS_CACHE_TTL = 12 * HOUR_IN_SECONDS;
    const UPDATE_ERROR_CACHE_TTL = 12 * HOUR_IN_SECONDS;

    public static function init() {

        add_filter('plugins_api', [
            self::class,
            'plugins_api'
        ], 20, 3);

        add_filter('upgrader_pre_download', [
            self::class,
            'upgrader_pre_download'
        ], 10, 3);

        add_filter('pre_set_site_transient_update_plugins', [
            self::class,
            'injectUpdate'
        ]);

        add_action('upgrader_process_complete', [
            self::class,
            'upgrader_process_complete'
        ], 10, 2);

        add_action('admin_init', [
            self::class,
            'maybeClearUpdateCacheAfterUpgrade'
        ]);
    }

    public static function plugins_api($res, $action, $args) {

        if ($action !== 'plugin_information') {
            return $res;
        }

        if (!is_object($args) || empty($args->slug) || $args->slug !== self::PLUGIN_SLUG) {
            return $res;
        }

        try {
            $res = (object)NextendSocialLoginAdmin::apiCall('plugin_information', array(
                'slug' => self::PLUGIN_SLUG,
            ));
        } catch (Exception $e) {
            $res = new WP_Error('error', $e->getMessage());
        }

        return $res;
    }

    public static function upgrader_pre_download($reply, $package, $upgrader) {

        $needle = NextendSocialLoginAdmin::getEndpoint();

        if (strpos($package, $needle) === 0) {
            add_filter('http_response', [
                self::class,
                'http_response'
            ], 10, 3);
        }

        return $reply;
    }

    public static function http_response($response, $r, $url) {

        $needle = NextendSocialLoginAdmin::getEndpoint();

        if (strpos($url, $needle) === 0 && (is_wp_error($response) || 200 != wp_remote_retrieve_response_code($response))) {
            if (is_wp_error($response)) {
                return $response;
            }

            if (isset($response['filename']) && file_exists($response['filename'])) {
                $body = @json_decode(@file_get_contents($response['filename']), true);

                if (is_array($body) && isset($body['message'])) {
                    $message = 'Nextend Social Login Pro Addon: ' . $body['message'];

                    if (isset($body['code']) && $body['code'] === 'license_invalid' && NextendSocialLogin::hasLicense()) {
                        NextendSocialLogin::$settings->update(array(
                            'license_key' => ''
                        ));
                        $message .= ' - the stored license key has been removed!';
                    }

                    Notices::addError($message);

                    return new WP_Error('error', $message);
                }
            }
        }

        return $response;
    }

    public static function injectUpdate($transient) {

        if (!is_object($transient)) {
            return $transient;
        }

        if (!class_exists('NextendSocialLoginPRO', false)) {
            return $transient;
        }

        if (empty($transient->checked) || !is_array($transient->checked)) {
            return $transient;
        }

        if (!isset($transient->checked[self::PLUGIN_FILE])) {
            return $transient;
        }

        $item = self::getPluginInformationForUpdateCheck();

        if (is_wp_error($item) || !is_object($item) || empty($item->new_version)) {
            return $transient;
        }

        $item->plugin = self::PLUGIN_FILE;

        if (version_compare(NextendSocialLoginPRO::$version, $item->new_version, '<')) {
            $transient->response[self::PLUGIN_FILE] = $item;

            if (isset($transient->no_update[self::PLUGIN_FILE])) {
                unset($transient->no_update[self::PLUGIN_FILE]);
            }
        } else {
            $transient->no_update[self::PLUGIN_FILE] = $item;

            if (isset($transient->response[self::PLUGIN_FILE])) {
                unset($transient->response[self::PLUGIN_FILE]);
            }
        }

        return $transient;
    }

    public static function upgrader_process_complete($upgrader, $hook_extra) {
        if (isset($hook_extra['action']) && $hook_extra['action'] == 'update' && isset($hook_extra['type']) && $hook_extra['type'] == 'plugin' && isset($hook_extra['plugins']) && is_array($hook_extra['plugins'])) {
            if (in_array(self::PLUGIN_FILE, $hook_extra['plugins'], true)) {
                update_site_option(self::CLEAR_CACHE_KEY, 1);
            }
        }
    }

    public static function maybeClearUpdateCacheAfterUpgrade() {
        if (get_site_option(self::CLEAR_CACHE_KEY)) {
            delete_site_option(self::CLEAR_CACHE_KEY);
            self::clearUpdateCache();
        }
    }

    private static function getPluginInformationForUpdateCheck() {

        $cached = get_site_transient(self::UPDATE_CACHE_KEY);

        if (is_array($cached) && isset($cached['success'])) {
            if ($cached['success']) {
                return $cached['data'];
            }

            return new WP_Error($cached['error']['code'], $cached['error']['message']);
        }

        try {
            $item = (object)NextendSocialLoginAdmin::apiCall('plugin_information', array(
                'slug' => self::PLUGIN_SLUG,
            ));
        } catch (Exception $e) {
            $error = array(
                'code'    => 'request_failed',
                'message' => $e->getMessage(),
            );

            set_site_transient(self::UPDATE_CACHE_KEY, array(
                'success' => false,
                'error'   => $error,
            ), self::UPDATE_ERROR_CACHE_TTL);

            return new WP_Error($error['code'], $error['message']);
        }

        if (!is_object($item) || empty($item->new_version)) {
            $error = array(
                'code'    => 'invalid_response',
                'message' => 'Invalid plugin update response.',
            );

            set_site_transient(self::UPDATE_CACHE_KEY, array(
                'success' => false,
                'error'   => $error,
            ), self::UPDATE_ERROR_CACHE_TTL);

            return new WP_Error($error['code'], $error['message']);
        }

        set_site_transient(self::UPDATE_CACHE_KEY, array(
            'success' => true,
            'data'    => $item,
        ), self::UPDATE_SUCCESS_CACHE_TTL);

        return $item;
    }

    public static function clearUpdateCache() {
        delete_site_transient('update_plugins');
        delete_site_transient(self::UPDATE_CACHE_KEY);
    }

    public static function forceUpdateCheck() {
        delete_site_transient('update_plugins');
        delete_site_transient(self::UPDATE_CACHE_KEY);
        wp_update_plugins();
    }
}