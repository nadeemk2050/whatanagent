<?php
/**
 * Plugin Name:       Al Qaryan Scrap Market
 * Plugin URI:        https://alqaryangroup.com/scrap-market/
 * Description:       "Scrap Market" listings for alqaryangroup.com — custom post type, taxonomies, Product/Offer schema, IndexNow pings and a guaranteed-300 KB image pipeline. Self-contained so a theme switch cannot take it down.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Al Qaryan Industries
 * License:           GPL-2.0-or-later
 * Text Domain:       alqaryan-scrap-market
 *
 * Why a plugin and not theme files: on 2026-11-02 a theme switch served the site as
 * unstyled HTML for an hour. Anything stored in the active theme dies the same way.
 * This file lives in wp-content/plugins and survives any theme change.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SM_VERSION', '0.1.0' );
define( 'SM_FILE', __FILE__ );
define( 'SM_DIR', plugin_dir_path( __FILE__ ) );
define( 'SM_URL', plugin_dir_url( __FILE__ ) );

/** Hard ceiling for every stored listing image, in bytes (300 KB). */
define( 'SM_MAX_BYTES', 300 * 1024 );

/** Longest edge kept; 1600 px is sharp on a 2x phone screen without wasting bytes. */
define( 'SM_MAX_EDGE', 1600 );

require_once SM_DIR . 'includes/cpt.php';
require_once SM_DIR . 'includes/fields.php';
require_once SM_DIR . 'includes/media.php';
require_once SM_DIR . 'includes/schema.php';
require_once SM_DIR . 'includes/seo.php';

/**
 * Activate: register everything, then flush so /scrap-market/ resolves immediately.
 */
function sm_activate() {
	sm_register_post_type();
	sm_register_taxonomies();
	sm_optimiser_probe( true );
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'sm_activate' );

/**
 * Deactivate: drop the rewrite rules we added.
 */
function sm_deactivate() {
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'sm_deactivate' );

/**
 * Settings live in one option array so there is a single place to audit.
 *
 * @return array<string,string>
 */
function sm_settings() {
	$defaults = array(
		'indexnow_key' => '',
		'vps_endpoint' => 'https://whatanagent.duckdns.org/scrap/api',
		'drive_folder' => 'ScrapMarket',
		'seller_name'  => 'Al Qaryan Industries',
		'seller_phone' => '+92 333 201 0506',
	);
	$saved = get_option( 'sm_settings', array() );

	return is_array( $saved ) ? array_merge( $defaults, $saved ) : $defaults;
}

/**
 * Enqueue the listing stylesheet only where it is needed.
 */
add_action( 'wp_enqueue_scripts', function () {
	if ( is_singular( 'scrap_listing' )
		|| is_post_type_archive( 'scrap_listing' )
		|| is_tax( array( 'scrap_material', 'scrap_region', 'scrap_kind' ) ) ) {
		wp_enqueue_style(
			'scrap-market',
			SM_URL . 'assets/scrap-market.css',
			array(),
			SM_VERSION
		);
	}
} );

/**
 * Settings screen: Settings -> Scrap Market.
 */
add_action( 'admin_menu', function () {
	add_options_page(
		'Scrap Market',
		'Scrap Market',
		'manage_options',
		'scrap-market',
		'sm_render_settings'
	);
} );

function sm_render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	if ( isset( $_POST['sm_settings_nonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['sm_settings_nonce'] ) ), 'sm_save_settings' ) ) {
		$clean = array();
		foreach ( array( 'indexnow_key', 'vps_endpoint', 'drive_folder', 'seller_name', 'seller_phone' ) as $key ) {
			$clean[ $key ] = isset( $_POST[ $key ] ) ? sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) : '';
		}
		update_option( 'sm_settings', $clean );
		echo '<div class="notice notice-success"><p>Saved.</p></div>';
	}

	$s     = sm_settings();
	$probe = sm_optimiser_probe();
	?>
	<div class="wrap">
		<h1>Scrap Market</h1>
		<p>
			Image engine: <strong><?php echo esc_html( $probe['engine'] ); ?></strong>
			&middot; WebP: <strong><?php echo $probe['webp'] ? 'yes' : 'no'; ?></strong>
			&middot; ceiling <?php echo esc_html( size_format( SM_MAX_BYTES ) ); ?>
		</p>
		<form method="post">
			<?php wp_nonce_field( 'sm_save_settings', 'sm_settings_nonce' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="sm_indexnow_key">IndexNow key</label></th>
					<td>
						<input name="indexnow_key" id="sm_indexnow_key" type="text" class="regular-text" value="<?php echo esc_attr( $s['indexnow_key'] ); ?>">
						<p class="description">The file name at the site root. Leave empty to disable pings.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="sm_vps_endpoint">Archive endpoint (VPS)</label></th>
					<td>
						<input name="vps_endpoint" id="sm_vps_endpoint" type="url" class="regular-text" value="<?php echo esc_attr( $s['vps_endpoint'] ); ?>">
						<p class="description">Where finished images are copied for the permanent Google Drive archive.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="sm_drive_folder">Drive folder</label></th>
					<td><input name="drive_folder" id="sm_drive_folder" type="text" class="regular-text" value="<?php echo esc_attr( $s['drive_folder'] ); ?>"></td>
				</tr>
				<tr>
					<th scope="row"><label for="sm_seller_name">Default seller name</label></th>
					<td><input name="seller_name" id="sm_seller_name" type="text" class="regular-text" value="<?php echo esc_attr( $s['seller_name'] ); ?>"></td>
				</tr>
				<tr>
					<th scope="row"><label for="sm_seller_phone">Default phone / WhatsApp</label></th>
					<td><input name="seller_phone" id="sm_seller_phone" type="text" class="regular-text" value="<?php echo esc_attr( $s['seller_phone'] ); ?>"></td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
