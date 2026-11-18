<?php
/**
 * Plugin Name:       Al Qaryan Scrap Market
 * Plugin URI:        https://alqaryangroup.com/scrap-market/
 * Description:       "Scrap Market" listings for alqaryangroup.com — custom post type, taxonomies, Product/Offer schema, IndexNow pings and a guaranteed-300 KB image pipeline. Self-contained so a theme switch cannot take it down.
 * Version:           0.3.8
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

define( 'SM_VERSION', '0.3.8' );
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
require_once SM_DIR . 'includes/query.php';
require_once SM_DIR . 'includes/submission.php';
require_once SM_DIR . 'includes/queue.php';
require_once SM_DIR . 'includes/schema.php';
require_once SM_DIR . 'includes/seo.php';
require_once SM_DIR . 'includes/facebook.php';

/**
 * Activate: register everything, then flush so /scrap-market/ resolves immediately.
 */
function sm_activate() {
	sm_register_post_type();
	sm_register_taxonomies();
	sm_seed_terms();
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
		'indexnow_key' => 'f90e62ce9199ff70fd09452c4519dbf9',
		'vps_endpoint' => 'https://whatanagent.duckdns.org/scrap/api',
		'drive_folder' => 'ScrapMarket',
		'seller_name'  => 'Al Qaryan Industries',
		'seller_phone' => '+92 333 201 0506',
		'posting_open' => '1',
		'posting_mode' => 'publish',
		'fb_page_id'   => '1383856674820826',
		// No token ships with the plugin. A stale token in the source is what showed
		// "Session has expired" to visitors; it must come from Settings → Scrap Market.
		'fb_token'     => '',
	);
	$saved = get_option( 'sm_settings', array() );

	return is_array( $saved ) ? array_merge( $defaults, $saved ) : $defaults;
}

/**
 * Enqueue the listing stylesheet and the small enhancement script.
 */
add_action( 'wp_enqueue_scripts', function () {
	// The posting page is whichever page holds the shortcode, so match its stored ID as well
	// as the slug the earlier release assumed.
	$post_page = (int) get_option( 'sm_post_page_id' );

	if ( is_singular( 'scrap_listing' )
		|| is_post_type_archive( 'scrap_listing' )
		|| is_tax( array( 'scrap_material', 'scrap_region', 'scrap_kind' ) )
		|| ( $post_page && is_page( $post_page ) )
		|| is_page( array( 'scrap-market-post', 'list-your-scrap' ) ) ) {
		wp_enqueue_style(
			'scrap-market',
			SM_URL . 'assets/scrap-market.css',
			array(),
			SM_VERSION
		);

		wp_enqueue_script(
			'scrap-market',
			SM_URL . 'assets/scrap-market.js',
			array(),
			SM_VERSION,
			true
		);

		wp_localize_script(
			'scrap-market',
			'sm_ajax',
			array(
				'ajax_url' => admin_url( 'admin-ajax.php' ),
			)
		);
	}
} );

/**
 * Flush rewrite rules once per version, from an ordinary front-end request.
 *
 * The activation hook flushes too, but at that moment another plugin's rewrite rules
 * (Rank Math's sitemaps, for one) may not be registered yet, and the flush then persists a
 * ruleset without them — which is exactly how /sitemap_index.xml turns into a 404.
 * wp_loaded runs after every plugin has registered, and the version check means this
 * happens once per release rather than on every request.
 */
add_action( 'wp_loaded', function () {
	// Admin and cron requests are skipped on purpose: Rank Math registers its sitemap routes
	// for front-end requests, so flushing from wp-admin is what quietly writes a ruleset
	// without them and 404s /sitemap_index.xml.
	if ( is_admin() || wp_doing_cron() ) {
		return;
	}
	if ( get_option( 'sm_rules_version' ) !== SM_VERSION ) {
		flush_rewrite_rules( false );
		update_option( 'sm_rules_version', SM_VERSION );
	}
}, 9999 );

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
		foreach ( array( 'indexnow_key', 'vps_endpoint', 'drive_folder', 'seller_name', 'seller_phone', 'fb_page_id', 'fb_token' ) as $key ) {
			$clean[ $key ] = isset( $_POST[ $key ] ) ? sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) : '';
		}
		$clean['posting_open'] = empty( $_POST['posting_open'] ) ? '' : '1';
		$clean['posting_mode'] = ( isset( $_POST['posting_mode'] ) && 'pending' === $_POST['posting_mode'] ) ? 'pending' : 'publish';
		update_option( 'sm_settings', $clean );
		// A new token must not inherit the previous token's pause or error state.
		delete_option( 'sm_fb_last_error' );
		delete_option( 'sm_fb_test_result' );
		delete_transient( 'sm_fb_blocked' );
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
				<tr>
					<th scope="row">Public posting</th>
					<td>
						<label>
							<input name="posting_open" id="sm_posting_open" type="checkbox" value="1" <?php checked( ! empty( $s['posting_open'] ) ); ?>>
							Let visitors post their own listings from the website
						</label>
						<p class="description">Honeypot, a minimum fill time, a nonce and a 5-per-hour per-IP limit run on every submission.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="sm_posting_mode">New listing goes</label></th>
					<td>
						<select name="posting_mode" id="sm_posting_mode">
							<option value="publish" <?php selected( 'publish' === $s['posting_mode'] ); ?>>Live immediately</option>
							<option value="pending" <?php selected( 'pending' === $s['posting_mode'] ); ?>>Into the review queue</option>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="sm_fb_page_id">Facebook Page ID</label></th>
					<td>
						<input name="fb_page_id" id="sm_fb_page_id" type="text" class="regular-text" value="<?php echo esc_attr( isset( $s['fb_page_id'] ) ? $s['fb_page_id'] : '' ); ?>">
						<p class="description">Al Qaryan Industries LLC Page ID.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="sm_fb_token">Facebook Page Token</label></th>
					<td>
						<input name="fb_token" id="sm_fb_token" type="password" class="large-text" value="<?php echo esc_attr( isset( $s['fb_token'] ) ? $s['fb_token'] : '' ); ?>">
						<p class="description">Page Access Token with pages_manage_posts scope.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Facebook Auto-Posting</th>
					<td>
						<label>
							<input name="fb_auto_post" id="sm_fb_auto_post" type="checkbox" value="1" <?php checked( ! empty( $s['fb_auto_post'] ) ); ?>>
							Automatically post new listings to Facebook Page when published
						</label>
					</td>
				</tr>
				<tr>
					<th scope="row">Facebook connection</th>
					<td>
						<?php
						$has_token = ! empty( $s['fb_token'] );
						$last      = get_option( 'sm_fb_last_error', array() );
						$test      = get_option( 'sm_fb_test_result', array() );
						?>
						<p style="margin:0 0 8px;">
							<?php if ( ! $has_token ) : ?>
								<strong style="color:#b91c1c;">No token saved.</strong> Posting to the Page will fail until one is added.
							<?php elseif ( is_array( $last ) && ! empty( $last['message'] ) ) : ?>
								<strong style="color:#b91c1c;">Last post failed <?php echo esc_html( human_time_diff( (int) $last['time'] ) ); ?> ago:</strong>
								<?php echo esc_html( $last['message'] ); ?>
							<?php else : ?>
								<strong style="color:#15803d;">Token saved.</strong> No failure recorded since the last successful post.
							<?php endif; ?>
						</p>
						<?php if ( is_array( $test ) && ! empty( $test['at'] ) ) : ?>
							<p style="margin:0 0 8px;">
								Test <?php echo esc_html( human_time_diff( (int) $test['at'] ) ); ?> ago:
								<?php if ( ! empty( $test['ok'] ) ) : ?>
									<strong style="color:#15803d;">valid</strong>
									<?php if ( ! empty( $test['expires_at'] ) ) : ?>
										· expires <?php echo esc_html( gmdate( 'Y-m-d H:i', (int) $test['expires_at'] ) ); ?> UTC
									<?php else : ?>
										· never expires
									<?php endif; ?>
									<?php if ( ! empty( $test['scopes'] ) ) : ?>
										· scopes: <?php echo esc_html( implode( ', ', (array) $test['scopes'] ) ); ?>
									<?php endif; ?>
								<?php else : ?>
									<strong style="color:#b91c1c;">failed</strong> — <?php echo esc_html( $test['message'] ); ?>
								<?php endif; ?>
							</p>
						<?php endif; ?>
						<a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=sm_fb_test' ), 'sm_fb_test' ) ); ?>">Test Facebook connection</a>
						<p class="description" style="margin-top:8px;">Use a <strong>long-lived Page access token</strong> with <code>pages_manage_posts</code>. A normal user token expires after about 60 days — that is the usual cause of “Session has expired”.</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * Admin-post: verify the saved Facebook token with Meta's debug_token endpoint.
	 * The result is stored so the settings screen can show it without calling Meta on every load.
	 */
	add_action( 'admin_post_sm_fb_test', function () {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Unauthorized' );
		}
		check_admin_referer( 'sm_fb_test' );

		if ( function_exists( 'sm_fb_debug_token' ) ) {
			update_option( 'sm_fb_test_result', sm_fb_debug_token(), false );
		}

		wp_safe_redirect( admin_url( 'options-general.php?page=scrap-market&sm_fb_tested=1' ) );
		exit;
	} );
