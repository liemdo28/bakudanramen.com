<?php
/**
 * Welcome screen getting started template
 */

use function Flatsome\Admin\status;
?>

<div id="tab-activate" class="col cols panel flatsome-panel">
	<div class="cols">
		<div class="inner-panel col-span-3">
			<h3><?php esc_html_e( 'Theme registration', 'flatsome' ); ?></h3>
			<?php echo flatsome_envato()->admin->render_directory_warning(); ?>
			<?php echo flatsome_envato()->admin->render_registration_form(); ?>
		</div>
		<div class="inner-panel">
 <?php
    $slug = basename( get_template_directory() );

    $output = '';

    //get errors so we can show them
    $errors = get_option( $slug . '_wup_errors', array() );
    delete_option( $slug . '_wup_errors' ); //delete existing errors as we will handle them next
    //check if we have a purchase code saved already
    $purchase_code = sanitize_text_field( get_option( $slug . '_wup_purchase_code', '' ) );

    //output errors and notifications
    if ( ! empty( $errors ) ) {
      foreach ( $errors as $key => $error ) {
        echo '<div class="notice-error notice-alt"><p>' . $error . '</p></div>';
      }
    }
?>
  <?php if(flatsome_is_theme_enabled()){ ?>
  <?php


    $sold         = date( "F jS, Y", strtotime( get_option( $slug . 'registeredAt', '' ) ) );
    $support_ends = date( "F jS, Y", strtotime( get_option( $slug . '_wup_supported_until', '' ) ) );

    $support_message = '<span style="color:green">Active</span>';

    // If support expired
    if ( flatsome_is_support_expired( $slug ) ) {
      $support_message = flatsome_is_invalid_support_time( $support_ends ) ? '<strong style="color:orange;">Invalid (please try to re-update)</strong>' : '<strong style="color:red;">Expired</strong>';
    }

    // Buyer
    $buyer = get_option( $slug . '_wup_buyer', '' )

    ?>
    <h3>License details</h3>
    <style>.license-table{width: 100%;} .license-table td{padding: 10px 0; border-bottom: 1px solid #eee;}</style>
    <table class="license-table">
     <tbody>
      <tr>
        <td><strong>Purchased</strong></td>
        <td><?php echo $sold; ?></td>
      </tr>
      <tr>
        <td>
          <?php if(flatsome_is_support_expired($slug)){ ?>
            <strong>Support ended</strong>
          <?php } else { ?>
            <strong>Support ends</strong>
          <?php } ?>
        </td>
        <td><?php echo $support_ends; ?></td>
      </tr>
      <tr>
        <td><strong>Username</strong></td>
        <td><?php echo $buyer; ?></td>
      </tr>
      </tbody>
    </table>
  <?php } ?>

			<h3><?php esc_html_e( 'Status', 'flatsome' ); ?></h3>
			<?php status()->render_section_overview(); ?>


		</div>
	</div>
</div>