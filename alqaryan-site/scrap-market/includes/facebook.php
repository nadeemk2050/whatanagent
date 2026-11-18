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
 * Meta errors that mean the token itself is dead. No retry can fix these.
 * 190/102 = authentication error; 463/467 = the "session has expired" subcodes.
 *
 * @param int $code    Graph error code.
 * @param int $subcode Graph error_subcode.
 * @return bool
 */
function sm_fb_is_token_error( $code, $subcode = 0 ) {
	$code    = (int) $code;
	$subcode = (int) $subcode;

	return in_array( $code, array( 102, 190, 463, 467 ), true )
		|| in_array( $subcode, array( 458, 459, 460, 463, 464, 467, 492 ), true );
}

/**
 * Turn a Graph API error into a sentence a site owner can act on.
 *
 * @param array  $res_data Decoded response body.
 * @param string $fallback Message to use when Meta sent nothing useful.
 * @return string
 */
function sm_fb_friendly_message( $res_data, $fallback = '' ) {
	$err = isset( $res_data['error'] ) && is_array( $res_data['error'] ) ? $res_data['error'] : array();
	$code = isset( $err['code'] ) ? (int) $err['code'] : 0;
	$sub  = isset( $err['error_subcode'] ) ? (int) $err['error_subcode'] : 0;
	$raw  = isset( $err['message'] ) ? (string) $err['message'] : '';

	if ( sm_fb_is_token_error( $code, $sub ) ) {
		return 'Facebook access token has expired or is invalid. Open Settings → Scrap Market and paste a new long-lived Page access token.' . ( '' !== $raw ? ' (Meta said: ' . $raw . ')' : '' );
	}

	if ( 200 === $code || 10 === $code ) {
		return 'The Facebook token does not have the pages_manage_posts permission. Add it in Meta and generate a new Page token.';
	}

	if ( '' !== $raw ) {
		return 'Facebook rejected the post: ' . $raw;
	}

	return '' !== $fallback ? $fallback : 'Facebook rejected the post.';
}

/**
 * Remember the last failure so Settings can show it, and pause auto-posting for
 * 15 minutes when the token itself is the problem (no point retrying every publish).
 */
function sm_fb_record_error( $message, $token_problem = false ) {
	update_option(
		'sm_fb_last_error',
		array(
			'time'    => time(),
			'message' => (string) $message,
		),
		false
	);

	if ( $token_problem ) {
		set_transient( 'sm_fb_blocked', 1, 15 * MINUTE_IN_SECONDS );
	}
}

/**
 * Clear the failure state after a good post or a successful token test.
 */
function sm_fb_clear_error() {
	delete_option( 'sm_fb_last_error' );
	delete_transient( 'sm_fb_blocked' );
}

/**
 * Ask Meta whether the saved token is still valid, when it expires and what
 * permissions it carries. Used by the "Test Facebook connection" button.
 *
 * @return array<string,mixed>
 */
function sm_fb_debug_token() {
	$settings = sm_settings();
	$token    = trim( (string) $settings['fb_token'] );
	$out      = array(
		'ok'         => false,
		'at'         => time(),
		'expires_at' => 0,
		'scopes'     => array(),
		'message'    => '',
	);

	if ( '' === $token ) {
		$out['message'] = 'No access token is saved.';
		return $out;
	}

	$url  = 'https://graph.facebook.com/v21.0/debug_token?' . http_build_query(
		array(
			'input_token'  => $token,
			'access_token' => $token,
		)
	);
	$resp = wp_remote_get( $url, array( 'timeout' => 20 ) );

	if ( is_wp_error( $resp ) ) {
		$out['message'] = $resp->get_error_message();
		return $out;
	}

	$status = (int) wp_remote_retrieve_response_code( $resp );
	$data   = json_decode( (string) wp_remote_retrieve_body( $resp ), true );

	if ( 200 !== $status ) {
		$out['message'] = sm_fb_friendly_message( $data, 'Meta returned HTTP ' . $status . '.' );
		return $out;
	}

	$d                 = isset( $data['data'] ) && is_array( $data['data'] ) ? $data['data'] : array();
	$out['ok']         = ! empty( $d['is_valid'] );
	$out['expires_at'] = isset( $d['expires_at'] ) ? (int) $d['expires_at'] : 0;
	$out['scopes']     = isset( $d['scopes'] ) && is_array( $d['scopes'] ) ? $d['scopes'] : array();
	$out['message']    = $out['ok']
		? 'Token is valid.'
		: ( isset( $d['error']['message'] ) ? (string) $d['error']['message'] : 'Meta reports the token is not valid.' );

	if ( $out['ok'] ) {
		sm_fb_clear_error();
	}

	return $out;
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
		$msg = 'Facebook Page ID or access token is missing in Settings → Scrap Market.';
		sm_fb_record_error( $msg, true );
		return new WP_Error( 'sm_fb_not_configured', $msg );
	}

	// After a token failure, stop hammering Meta on every publish for 15 minutes.
	// A manual (forced) post always goes through so the owner can retest immediately.
	if ( ! $force && get_transient( 'sm_fb_blocked' ) ) {
		$last = get_option( 'sm_fb_last_error', array() );
		$msg  = ! empty( $last['message'] ) ? $last['message'] : 'Facebook posting is paused after a failed attempt.';
		return new WP_Error( 'sm_fb_paused', $msg );
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
			$code          = isset( $res_data['error']['code'] ) ? (int) $res_data['error']['code'] : 0;
			$sub           = isset( $res_data['error']['error_subcode'] ) ? (int) $res_data['error']['error_subcode'] : 0;
			$msg           = sm_fb_friendly_message( $res_data, 'Unknown Facebook API error' );
			$token_problem = sm_fb_is_token_error( $code, $sub );

			sm_fb_record_error( $msg, $token_problem );

			return new WP_Error( $token_problem ? 'sm_fb_token_expired' : 'sm_fb_error', $msg );
		}
	}

	sm_fb_clear_error();
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

/**
 * Handle direct front-end "Send to Facebook Page" AJAX request.
 * Strictly prevents duplicate posts: once posted, cannot be re-posted.
 */
add_action( 'wp_ajax_sm_send_to_fb', 'sm_handle_ajax_send_to_fb' );
// No wp_ajax_nopriv handler on purpose: sending a listing to the company Page is an
// administrator action, not something a visitor (or a copied nonce) may trigger.

function sm_handle_ajax_send_to_fb() {
	$post_id = isset( $_POST['post_id'] ) ? (int) $_POST['post_id'] : 0;
	$nonce   = isset( $_POST['nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['nonce'] ) ) : '';

	if ( ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( array( 'message' => 'Only a site administrator can send listings to the Facebook Page.' ), 403 );
	}

	if ( ! $post_id || ! wp_verify_nonce( $nonce, 'sm_send_fb_' . $post_id ) ) {
		wp_send_json_error( array( 'message' => 'Security verification failed or invalid listing.' ), 403 );
	}

	if ( 'scrap_listing' !== get_post_type( $post_id ) || 'publish' !== get_post_status( $post_id ) ) {
		wp_send_json_error( array( 'message' => 'Only published scrap listings can be sent to Facebook.' ), 400 );
	}

	// Duplicate prevention: check if already posted
	$existing_fb_id = get_post_meta( $post_id, '_sm_fb_post_id', true );
	if ( ! empty( $existing_fb_id ) ) {
		wp_send_json_error(
			array(
				'message'        => 'This listing was already posted to Facebook Page. Duplicate posting is prevented.',
				'already_posted' => true,
				'fb_post_id'     => $existing_fb_id,
			),
			409
		);
	}

	// Concurrency lock: prevent simultaneous double-clicks
	$transient_key = 'sm_posting_fb_' . $post_id;
	if ( get_transient( $transient_key ) ) {
		wp_send_json_error( array( 'message' => 'Post to Facebook is currently in progress. Please wait a moment.' ), 429 );
	}
	set_transient( $transient_key, 1, 30 );

	$res = sm_post_to_facebook( $post_id, true );
	delete_transient( $transient_key );

	if ( is_wp_error( $res ) ) {
		$code = $res->get_error_code();
		wp_send_json_error(
			array(
				'message'       => $res->get_error_message(),
				'token_expired' => ( 'sm_fb_token_expired' === $code || 'sm_fb_not_configured' === $code ),
			),
			500
		);
	}

	$fb_post_id = ! empty( $res['fb_post_id'] ) ? $res['fb_post_id'] : ( ! empty( $res['post_id'] ) ? $res['post_id'] : '' );

	wp_send_json_success(
		array(
			'message'    => 'Listing posted successfully to Al Qaryan Industries LLC Facebook Page!',
			'fb_post_id' => $fb_post_id,
		)
	);
}

