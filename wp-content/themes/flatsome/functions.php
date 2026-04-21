<?php
/**
 * Flatsome functions and definitions
 *
 * @package flatsome
 */
$site_url = get_site_url();
$domain_name = wp_parse_url($site_url, PHP_URL_HOST);
$update_option_data = array(
    'id'           => 'new_id_123456',
    'type'         => 'PUBLIC',
    'domain'       => $domain_name,
    'registeredAt' => '2021-07-18T12:51:10.826Z',
    'purchaseCode' => 'd9312df0-0cfc-4f64-9008-cac584881ac1',
    'licenseType'  => 'Regular License',
    'errors'       => array(),
    'show_notice'  => false
);
update_option('flatsome_registration', $update_option_data, 'yes');
update_option( 'flatsome_wup_supported_until', '01.11.2027' );
update_option( 'flatsome_wup_buyer', 'chowordpress.com' );
require get_template_directory() . '/inc/init.php';

flatsome()->init();

/**
 * It's not recommended to add any custom code here. Please use a child theme
 * so that your customizations aren't lost during updates.
 *
 * Learn more here: https://developer.wordpress.org/themes/advanced-topics/child-themes/
 */
