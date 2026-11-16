<?php
/**
 * Facebook Page auto-publishing for Scrap Market listings.
 *
 * Uses Meta Graph API to publish photo/text listing posts directly to
 * Al Qaryan Industries LLC Page without browser bots.
 *
 * @package AlQaryanScrapMarket
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Publish a scrap listing to Facebook Page.
 *
 * @param int  $post_id Post ID.
 * @param bool $force   Force re-post even if already posted.
 * @return array<string,mixed>|WP_Error Response with fb post id or error.
 */
function sm_post_to_facebook( $post_id, $force = false ) {
	$settings = sm_settings();
	$page_id  = trim( (string) $settings['fb_page_id'] );
	$token    = trim( (string) $settings['fb_token'] );

	if ( empty( $page_id ) || empty( $token ) ) {
		return new WP_Error( 'sm_fb_not_configured', 'Facebook Page ID or Access Token is missing in Settings → Scrap Market.' );
	}

	$existing_fb_id = get_post_meta( $post_id, '_sm_fb_post_id', true );
	if ( ! empty( $existing_fb_id ) && ! $force ) {
		return array(
			'ok'      => true,
			'post_id' => $existing_fb_id,
			'note'    => 'Already posted to Facebook previously.',
		);
	}

	$kind       = sm_listing_kind( $post_id );
	$kind_label = 'buy' === $kind ? 'WANTED TO BUY' : 'FOR SALE';
	$title      = get_the_title( $post_id );
	$price      = sm_price_label( $post_id );
	$quantity   = sm_quantity_label( $post_id );
	$location   = sm_get( $post_id, 'location' );
	$raw_phone  = sm_get( $post_id, 'whatsapp', $settings['seller_phone'] );
	$digits     = preg_replace( '/[^0-9]/', '', (string) $raw_phone );
	$phone      = preg_replace( '/^00/', '', (string) $digits );
	if ( preg_match( '/^0(5[0-9]{8})$/', $phone, $m ) ) {
		$phone = '971' . $m[1];
	}
	$permalink = get_permalink( $post_id );

	$lines   = array();
	$lines[] = '📢 ' . $kind_label . ': ' . $title;
	if ( '—' !== $quantity ) {
		$lines[] = '📦 Quantity: ' . $quantity;
	}
	if ( '—' !== $price ) {
		$lines[] = '💰 Price: ' . $price;
	}
	if ( ! empty( $location ) ) {
		$lines[] = '📍 Location: ' . $location;
	}
	$lines[] = '';
	if ( ! empty( $phone ) ) {
		$lines[] = '💬 WhatsApp Seller Directly:';
		$lines[] = 'https://wa.me/' . $phone . '?text=' . rawurlencode( 'Hello, I saw your lot on Al Qaryan Scrap Market: ' . $title );
		$lines[] = '';
	}
	$lines[] = '🔗 Full Lot Details & Inspection on Recycle Scrap Market:';
	$lines[] = $permalink;

	$caption = implode( "\n", $lines );

	$thumb_id = get_post_thumbnail_id( $post_id );
	$img_path = $thumb_id ? get_attached_file( $thumb_id ) : '';

	$fb_post_id = '';

	// If listing has an image file on disk, post as a photo post
	if ( ! empty( $img_path ) && file_exists( $img_path ) && function_exists( 'curl_init' ) ) {
		$mime = wp_check_filetype( $img_path );
		$type = ! empty( $mime['type'] ) ? $mime['type'] : 'image/jpeg';

		$ch    = curl_init();
		$cfile = new CURLFile( $img_path, $type, basename( $img_path ) );
		$data  = array(
			'source'       => $cfile,
			'caption'      => $caption,
			'access_token' => $token,
		);

		curl_setopt( $ch, CURLOPT_URL, 'https://graph.facebook.com/v21.0/' . rawurlencode( $page_id ) . '/photos' );
		curl_setopt( $ch, CURLOPT_POST, 1 );
		curl_setopt( $ch, CURLOPT_POSTFIELDS, $data );
		curl_setopt( $ch, CURLOPT_RETURNTRANSFER, true );
		curl_setopt( $ch, CURLOPT_TIMEOUT, 30 );

		$response = curl_exec( $ch );
		$status   = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		curl_close( $ch );

		$res_data = json_decode( (string) $response, true );
		if ( 200 === $status && ! empty( $res_data['id'] ) ) {
			$fb_post_id = ! empty( $res_data['post_id'] ) ? $res_data['post_id'] : $res_data['id'];
		}
	}

	// Fallback to text/link post if photo post was not made
	if ( empty( $fb_post_id ) ) {
		$endpoint = 'https://graph.facebook.com/v21.0/' . rawurlencode( $page_id ) . '/feed';
		$body     = array(
			'message'      => $caption,
			'link'         => $permalink,
			'access_token' => $token,
		);

		$resp = wp_remote_post(
			$endpoint,
			array(
				'timeout' => 20,
				'body'    => $body,
			)
		);

		if ( is_wp_error( $resp ) ) {
			return $resp;
		}

		$status   = wp_remote_retrieve_response_code( $resp );
		$res_data = json_decode( wp_remote_retrieve_body( $resp ), true );

		if ( 200 === $status && ! empty( $res_data['id'] ) ) {
			$fb_post_id = $res_data['id'];
		} else {
			$err_msg = ! empty( $res_data['error']['message'] ) ? $res_data['error']['message'] : 'Unknown Facebook API error';
			return new WP_Error( 'sm_fb_error', $err_msg );
		}
	}

	update_post_meta( $post_id, '_sm_fb_post_id', $fb_post_id );
	update_post_meta( $post_id, '_sm_fb_posted_at', time() );

	return array(
		'ok'         => true,
		'fb_post_id' => $fb_post_id,
	);
}

/**
 * Auto-publish when a listing moves to published status.
 */
add_action( 'transition_post_status', function ( $new_status, $old_status, $post ) {
	if ( ! ( $post instanceof WP_Post ) || 'scrap_listing' !== $post->post_type ) {
		return;
	}

	if ( 'publish' !== $new_status || 'publish' === $old_status ) {
		return;
	}

	$settings = sm_settings();
	if ( empty( $settings['fb_auto_post'] ) || empty( $settings['fb_token'] ) ) {
		return;
	}

	if ( get_post_meta( $post->ID, '_sm_fb_post_id', true ) ) {
		return;
	}

	sm_post_to_facebook( $post->ID );
}, 20, 3 );

/**
 * Handle manual "Post to Facebook" admin action.
 */
add_action( 'admin_action_sm_post_fb', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Unauthorized' );
	}

	$post_id = isset( $_GET['post_id'] ) ? (int) $_GET['post_id'] : 0;
	check_admin_referer( 'sm_post_fb_' . $post_id );

	if ( ! $post_id ) {
		wp_safe_redirect( admin_url( 'edit.php?post_type=scrap_listing' ) );
		exit;
	}

	$res = sm_post_to_facebook( $post_id, true );
	if ( is_wp_error( $res ) ) {
		wp_die( esc_html( $res->get_error_message() ) );
	}

	wp_safe_redirect( admin_url( 'edit.php?post_type=scrap_listing&sm_fb_posted=1' ) );
	exit;
} );

/**
 * Add Facebook column in admin listings table.
 */
add_filter( 'manage_scrap_listing_posts_columns', function ( $cols ) {
	$cols['sm_facebook'] = 'Facebook';
	return $cols;
} );

add_action( 'manage_scrap_listing_posts_custom_column', function ( $col, $post_id ) {
	if ( 'sm_facebook' !== $col ) {
		return;
	}

	$fb_id = get_post_meta( $post_id, '_sm_fb_post_id', true );
	if ( ! empty( $fb_id ) ) {
		echo '<span style="color:#15803d;font-weight:600;">✓ Posted</span>';
	} else {
		$url = wp_nonce_url( admin_url( 'admin.php?action=sm_post_fb&post_id=' . $post_id ), 'sm_post_fb_' . $post_id );
		echo '<a class="button button-small" href="' . esc_url( $url ) . '">📤 Post to Facebook</a>';
	}
}, 10, 2 );
