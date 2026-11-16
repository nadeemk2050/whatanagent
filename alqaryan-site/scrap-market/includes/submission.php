<?php
/**
 * Front-end posting, the report button and the moderation queue.
 *
 * Posting is deliberately public: anyone can put a lot on the market without an account,
 * which is the whole point of a free market. Because that is open, four cheap controls do
 * the work a login would otherwise do:
 *
 *   1. a honeypot field that only a bot fills in
 *   2. a minimum time on the form — a human takes more than three seconds
 *   3. a per-IP rate limit stored in a transient (5 posts an hour, 20 reports an hour)
 *   4. a nonce, so the form cannot be posted from another site
 *
 * Settings → Scrap Market decides whether a new listing publishes immediately or waits in
 * the queue. The queue screen is shown either way, and also collects reported listings.
 *
 * @package AlQaryanScrapMarket
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * publish = live immediately, pending = wait for approval.
 *
 * @return string
 */
function sm_posting_mode() {
	$s = sm_settings();

	return 'pending' === $s['posting_mode'] ? 'pending' : 'publish';
}

/**
 * Best-effort client IP, without trusting a spoofable header on its own.
 *
 * @return string
 */
function sm_client_ip() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '';

	return filter_var( $ip, FILTER_VALIDATE_IP ) ? $ip : '0.0.0.0';
}

/**
 * Sliding-window rate limit.
 *
 * @param string $bucket  Name of the bucket, e.g. "post".
 * @param int    $max     Allowed hits in the window.
 * @param int    $window  Window length in seconds.
 * @return bool True when the caller is over the limit.
 */
function sm_rate_limited( $bucket, $max, $window ) {
	$key   = 'sm_rl_' . $bucket . '_' . md5( sm_client_ip() );
	$hits  = (int) get_transient( $key );
	$hits++;

	set_transient( $key, $hits, $window );

	return $hits > $max;
}

/**
 * Where the form lives, for redirects.
 *
 * @return string
 */
function sm_post_page_url() {
	$page_id = (int) get_option( 'sm_post_page_id' );
	if ( $page_id && 'publish' === get_post_status( $page_id ) ) {
		return get_permalink( $page_id );
	}

	// Option not written yet (the shortcode writes it on first render): find the page by slug.
	$page = get_page_by_path( 'list-your-scrap' );
	if ( $page instanceof WP_Post && 'publish' === $page->post_status ) {
		return get_permalink( $page );
	}

	return home_url( '/list-your-scrap/' );
}

/**
 * The market archive URL.
 *
 * @return string
 */
function sm_archive_url() {
	$link = get_post_type_archive_link( 'scrap_listing' );

	return $link ? $link : home_url( '/scrap-market/' );
}

/**
 * Human message for a redirect code.
 *
 * @param string $code Message code.
 * @return array{0:string,1:string} Type (ok|error) and text.
 */
function sm_message( $code ) {
	$map = array(
		'posted'     => array( 'ok', 'Your listing is live. Thank you — send a photo of the material if you have one and more buyers will reply.' ),
		'queued'     => array( 'ok', 'Thank you. Your listing has been received and will appear once it has been reviewed.' ),
		'saved'      => array( 'ok', 'Listing updated.' ),
		'deleted'    => array( 'ok', 'The listing has been removed from the market.' ),
		'reported'   => array( 'ok', 'Thank you — the listing has been flagged for review.' ),
		'duplicate'  => array( 'ok', 'That listing was already submitted. Thank you.' ),
		'required'   => array( 'error', 'Please add a title, your name, and a WhatsApp number or an email. Everything else is optional.' ),
		'contact'    => array( 'error', 'Add a WhatsApp number or an email so buyers can reach you.' ),
		'title'      => array( 'error', 'Give the listing a title of at least 3 characters.' ),
		'wrongpass'  => array( 'error', 'That password is not correct.' ),
		'expired'    => array( 'error', 'That edit session has expired. Enter the password again.' ),
		'spam'       => array( 'error', 'That submission looked automated and was not saved. Please try again.' ),
		'throttled'  => array( 'error', 'Too many submissions from this connection. Please try again later.' ),
		'upload'     => array( 'error', 'One of the photos could not be saved. Listings accept JPG, PNG or WebP up to 25 MB.' ),
		'security'   => array( 'error', 'The form expired. Please submit it again.' ),
	);

	return isset( $map[ $code ] ) ? $map[ $code ] : array( 'error', 'Something went wrong. Please try again.' );
}

/* --------------------------------------------------------------------------
 * Drafts: keep what was typed when a submission is rejected.
 * ----------------------------------------------------------------------- */

/**
 * Stash the submitted text fields for the same visitor, so the redirect back to the form
 * can fill them in again. Files cannot be restored, the text can.
 *
 * @param array $source Usually $_POST.
 * @return void
 */
function sm_store_draft( array $source ) {
	$values = array();
	foreach ( $source as $key => $value ) {
		if ( 0 !== strpos( (string) $key, 'sm_' ) || is_array( $value ) ) {
			continue;
		}
		$values[ $key ] = sanitize_text_field( wp_unslash( $value ) );
	}

	set_transient( 'sm_draft_' . md5( sm_client_ip() ), $values, 15 * MINUTE_IN_SECONDS );
}

/**
 * @return array<string,string>
 */
function sm_take_draft() {
	$key    = 'sm_draft_' . md5( sm_client_ip() );
	$values = get_transient( $key );

	if ( ! is_array( $values ) ) {
		return array();
	}

	delete_transient( $key );

	return $values;
}

/* --------------------------------------------------------------------------
 * Reading a submission and writing it to a listing.
 * ----------------------------------------------------------------------- */

/**
 * One request value, sanitised.
 *
 * @param string $key Field name without the sm_ prefix.
 * @return string
 */
function sm_request_value( $key ) {
	return isset( $_POST[ 'sm_' . $key ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'sm_' . $key ] ) ) : '';
}

/**
 * Everything the two forms (post and edit) collect.
 *
 * @return array<string,string>
 */
function sm_collect_input() {
	$kind = sm_request_value( 'kind' );

	return array(
		'kind'           => array_key_exists( $kind, sm_kinds() ) ? $kind : 'sell',
		'title'          => sm_request_value( 'title' ),
		'quantity'       => preg_replace( '/[^0-9.]/', '', sm_request_value( 'quantity' ) ),
		'description'    => isset( $_POST['sm_description'] ) ? sanitize_textarea_field( wp_unslash( $_POST['sm_description'] ) ) : '',
		'seller'         => sm_request_value( 'seller' ),
		'company'        => sm_request_value( 'company' ),
		'whatsapp'       => preg_replace( '/[^0-9+]/', '', sm_request_value( 'whatsapp' ) ),
		'email'          => isset( $_POST['sm_email'] ) ? sanitize_email( wp_unslash( $_POST['sm_email'] ) ) : '',
		'material'       => sanitize_title( sm_request_value( 'material' ) ),
		'material_other' => sm_request_value( 'material_other' ),
		'region'         => sanitize_title( sm_request_value( 'region' ) ),
		'unit'           => sm_request_value( 'unit' ),
		'price'          => preg_replace( '/[^0-9.]/', '', sm_request_value( 'price' ) ),
		'currency'       => sm_request_value( 'currency' ),
		'per'            => sm_request_value( 'per' ),
		'location'       => sm_request_value( 'location' ),
		'status'         => sm_request_value( 'status' ),
	);
}

/**
 * The minimum a listing needs: a name, a person, and a way to answer.
 *
 * @param array<string,string> $data Collected input.
 * @return string Empty when the data is usable, otherwise a message code.
 */
function sm_validate( array $data ) {
	if ( '' === $data['title'] || '' === $data['seller'] ) {
		return 'required';
	}

	if ( mb_strlen( $data['title'] ) < 3 ) {
		return 'title';
	}

	if ( '' === $data['whatsapp'] && '' === $data['email'] ) {
		return 'contact';
	}

	return '';
}

/**
 * Write the collected input onto a listing.
 *
 * @param int                  $post_id Listing ID.
 * @param array<string,string> $data    Output of sm_collect_input().
 * @return void
 */
function sm_save_listing( $post_id, array $data ) {
	wp_update_post(
		array(
			'ID'           => (int) $post_id,
			'post_title'   => $data['title'],
			'post_content' => $data['description'],
			'post_excerpt' => wp_trim_words( $data['description'], 40, '' ),
		)
	);

	$kind_term = term_exists( $data['kind'], 'scrap_kind' );
	if ( $kind_term ) {
		wp_set_object_terms( $post_id, (int) ( is_array( $kind_term ) ? $kind_term['term_id'] : $kind_term ), 'scrap_kind' );
	}

	if ( 'other' === $data['material'] && '' !== $data['material_other'] ) {
		$created = wp_insert_term( $data['material_other'], 'scrap_material' );
		if ( ! is_wp_error( $created ) ) {
			wp_set_object_terms( $post_id, (int) $created['term_id'], 'scrap_material' );
		}
	} elseif ( '' !== $data['material'] ) {
		wp_set_object_terms( $post_id, $data['material'], 'scrap_material' );
	} else {
		wp_set_object_terms( $post_id, array(), 'scrap_material' );
	}

	wp_set_object_terms( $post_id, '' !== $data['region'] ? $data['region'] : array(), 'scrap_region' );

	$meta = array(
		'grade'    => $data['title'],
		'quantity' => $data['quantity'],
		'unit'     => $data['unit'],
		'price'    => $data['price'],
		'currency' => $data['currency'],
		'per'      => $data['per'],
		'location' => $data['location'],
		'seller'   => '' !== $data['seller'] ? $data['seller'] : 'Seller',
		'company'  => $data['company'],
		'whatsapp' => $data['whatsapp'],
		'email'    => $data['email'],
		'status'   => '' !== $data['status'] ? $data['status'] : 'available',
	);

	$allowed = sm_fields();
	foreach ( $meta as $key => $value ) {
		if ( ! isset( $allowed[ $key ] ) ) {
			continue;
		}
		if ( 'select' === $allowed[ $key ]['type'] && '' !== $value && ! array_key_exists( $value, $allowed[ $key ]['options'] ) ) {
			continue;
		}
		if ( '' === $value ) {
			delete_post_meta( $post_id, '_sm_' . $key );
			continue;
		}
		update_post_meta( $post_id, '_sm_' . $key, $value );
	}

	sm_record_price_sort( $post_id );
}

/**
 * Upload the attached photos, drop the ones ticked for removal, keep five at most.
 *
 * @param int   $post_id Listing ID.
 * @param int[] $remove  Attachment IDs to drop.
 * @return int Number of photos added.
 */
function sm_attach_photos( $post_id, array $remove = array() ) {
	$stored  = sm_get( $post_id, 'gallery' );
	$gallery = ( '' !== $stored ) ? array_values( array_filter( array_map( 'absint', explode( ',', $stored ) ) ) ) : array();

	if ( $remove ) {
		$gallery = array_values( array_diff( $gallery, array_map( 'absint', $remove ) ) );
	}

	$added = 0;

	if ( ! empty( $_FILES['sm_photos'] ) && ! empty( $_FILES['sm_photos']['name'] ) && is_array( $_FILES['sm_photos']['name'] ) ) {
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';

		$count = min( 5 - count( $gallery ), count( $_FILES['sm_photos']['name'] ) );

		for ( $i = 0; $i < $count; $i++ ) {
			if ( empty( $_FILES['sm_photos']['name'][ $i ] ) ) {
				continue;
			}
			// Re-shape one file at a time so media_handle_upload sees a normal single upload.
			$_FILES['sm_single'] = array(
				'name'     => $_FILES['sm_photos']['name'][ $i ],
				'type'     => $_FILES['sm_photos']['type'][ $i ],
				'tmp_name' => $_FILES['sm_photos']['tmp_name'][ $i ],
				'error'    => $_FILES['sm_photos']['error'][ $i ],
				'size'     => $_FILES['sm_photos']['size'][ $i ],
			);

			$attachment_id = media_handle_upload( 'sm_single', $post_id );
			if ( ! is_wp_error( $attachment_id ) ) {
				$gallery[] = (int) $attachment_id;
				$added++;
			}
		}
		unset( $_FILES['sm_single'] );
	}

	$gallery = array_slice( array_values( array_unique( $gallery ) ), 0, 5 );

	if ( $gallery ) {
		set_post_thumbnail( $post_id, $gallery[0] );
		update_post_meta( $post_id, '_sm_gallery', implode( ',', $gallery ) );
	} else {
		delete_post_thumbnail( $post_id );
		delete_post_meta( $post_id, '_sm_gallery' );
	}

	return $added;
}

/**
 * Answer a handler: JSON for the scripted form, a redirect for a plain one.
 *
 * @param bool   $ok       Whether the action succeeded.
 * @param string $code     Message code from sm_message().
 * @param string $base_url Where to go next, before the message argument is added.
 * @return void
 */
function sm_reply( $ok, $code, $base_url ) {
	$target = add_query_arg( 'sm_msg', $code, $base_url );

	if ( ! empty( $_POST['sm_ajax'] ) ) {
		list( , $text ) = sm_message( $code );
		wp_send_json(
			array(
				'ok'       => (bool) $ok,
				'code'     => $code,
				'message'  => $text,
				'redirect' => $target,
			)
		);
	}

	wp_safe_redirect( $target );
	exit;
}

/* --------------------------------------------------------------------------
 * Owner controls: edit and delete behind a shared password.
 * ----------------------------------------------------------------------- */

/**
 * The password that unlocks editing. Change it with the sm_manage_password filter.
 *
 * @return string
 */
function sm_manage_password() {
	$password = get_option( 'sm_manage_password' );

	if ( ! is_string( $password ) || '' === $password ) {
		$password = 'abcd';
	}

	return (string) apply_filters( 'sm_manage_password', $password );
}

/**
 * Has this visitor already entered the password for this listing?
 *
 * @param int $post_id Listing ID.
 * @return bool
 */
function sm_manage_authorised( $post_id ) {
	$raw = isset( $_COOKIE['sm_manage'] ) ? (string) wp_unslash( $_COOKIE['sm_manage'] ) : '';
	$bits = explode( '|', $raw );

	if ( 3 !== count( $bits ) ) {
		return false;
	}

	list( $id, $expiry, $signature ) = $bits;

	if ( (int) $id !== (int) $post_id || (int) $expiry < time() ) {
		return false;
	}

	return hash_equals( hash_hmac( 'sha256', $id . '|' . $expiry, wp_salt( 'auth' ) ), $signature );
}

/**
 * Remember the password check for half an hour.
 *
 * @param int $post_id Listing ID.
 * @return void
 */
function sm_grant_manage( $post_id ) {
	$expiry    = time() + 30 * MINUTE_IN_SECONDS;
	$signature = hash_hmac( 'sha256', $post_id . '|' . $expiry, wp_salt( 'auth' ) );
	$value     = $post_id . '|' . $expiry . '|' . $signature;

	setcookie(
		'sm_manage',
		$value,
		array(
			'expires'  => $expiry,
			'path'     => '/',
			'httponly' => true,
			'samesite' => 'Lax',
			'secure'   => is_ssl(),
		)
	);

	$_COOKIE['sm_manage'] = $value;
}

/**
 * URL of the manage panel for one listing.
 *
 * @param int $post_id Listing ID.
 * @return string
 */
function sm_manage_url( $post_id ) {
	return add_query_arg( 'sm', 'manage', get_permalink( $post_id ) );
}

/**
 * Check the password and open a manage session.
 *
 * @return void
 */
function sm_handle_manage_auth() {
	$post_id = isset( $_POST['listing'] ) ? (int) $_POST['listing'] : 0;
	$nonce   = isset( $_POST['sm_manage_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['sm_manage_nonce'] ) ) : '';

	if ( ! $post_id || 'scrap_listing' !== get_post_type( $post_id ) || ! wp_verify_nonce( $nonce, 'sm_manage_auth_' . $post_id ) ) {
		sm_reply( false, 'security', sm_archive_url() );
	}

	if ( sm_rate_limited( 'manage', 10, HOUR_IN_SECONDS ) ) {
		sm_reply( false, 'throttled', get_permalink( $post_id ) );
	}

	$entered = isset( $_POST['sm_password'] ) ? (string) wp_unslash( $_POST['sm_password'] ) : '';

	if ( ! hash_equals( sm_manage_password(), $entered ) ) {
		sm_reply( false, 'wrongpass', get_permalink( $post_id ) );
	}

	sm_grant_manage( $post_id );
	sm_reply( true, 'saved', sm_manage_url( $post_id ) );
}
add_action( 'admin_post_sm_manage_auth', 'sm_handle_manage_auth' );
add_action( 'admin_post_nopriv_sm_manage_auth', 'sm_handle_manage_auth' );

/**
 * Save the edit form.
 *
 * @return void
 */
function sm_handle_manage_save() {
	$post_id = isset( $_POST['listing'] ) ? (int) $_POST['listing'] : 0;
	$nonce   = isset( $_POST['sm_manage_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['sm_manage_nonce'] ) ) : '';

	if ( ! $post_id || 'scrap_listing' !== get_post_type( $post_id ) || ! wp_verify_nonce( $nonce, 'sm_manage_save_' . $post_id ) ) {
		sm_reply( false, 'security', sm_archive_url() );
	}

	if ( ! sm_manage_authorised( $post_id ) ) {
		sm_reply( false, 'expired', sm_manage_url( $post_id ) );
	}

	$data  = sm_collect_input();
	$error = sm_validate( $data );

	if ( '' !== $error ) {
		sm_store_draft( $_POST );
		sm_reply( false, $error, sm_manage_url( $post_id ) );
	}

	$remove = array();
	if ( ! empty( $_POST['sm_remove_photos'] ) && is_array( $_POST['sm_remove_photos'] ) ) {
		$remove = array_map( 'absint', wp_unslash( $_POST['sm_remove_photos'] ) );
	}

	sm_save_listing( $post_id, $data );
	sm_attach_photos( $post_id, $remove );

	sm_reply( true, 'saved', sm_manage_url( $post_id ) );
}
add_action( 'admin_post_sm_manage_save', 'sm_handle_manage_save' );
add_action( 'admin_post_nopriv_sm_manage_save', 'sm_handle_manage_save' );

/**
 * Move a listing to the trash.
 *
 * @return void
 */
function sm_handle_manage_delete() {
	$post_id = isset( $_POST['listing'] ) ? (int) $_POST['listing'] : 0;
	$nonce   = isset( $_POST['sm_manage_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['sm_manage_nonce'] ) ) : '';

	if ( ! $post_id || 'scrap_listing' !== get_post_type( $post_id ) || ! wp_verify_nonce( $nonce, 'sm_manage_delete_' . $post_id ) ) {
		sm_reply( false, 'security', sm_archive_url() );
	}

	if ( ! sm_manage_authorised( $post_id ) ) {
		sm_reply( false, 'expired', sm_manage_url( $post_id ) );
	}

	wp_trash_post( $post_id );

	sm_reply( true, 'deleted', sm_archive_url() );
}
add_action( 'admin_post_sm_manage_delete', 'sm_handle_manage_delete' );
add_action( 'admin_post_nopriv_sm_manage_delete', 'sm_handle_manage_delete' );

/**
 * Keep the cache away from the pages that carry per-visitor state.
 *
 * The posting form and the manage panel contain a nonce and, after a rejection, the text
 * the visitor just typed. A cached copy would hand the next visitor a stale form and lose
 * the draft, so these views ask LiteSpeed (and the browser) not to store them.
 *
 * @return void
 */
function sm_no_cache_views() {
	$post_page = (int) get_option( 'sm_post_page_id' );

	$needs = ( $post_page && is_page( $post_page ) )
		|| is_page( 'list-your-scrap' )
		|| ( is_singular( 'scrap_listing' ) && ( isset( $_GET['sm'] ) || isset( $_GET['sm_msg'] ) || isset( $_COOKIE['sm_manage'] ) ) );

	if ( ! $needs ) {
		return;
	}

	do_action( 'litespeed_control_set_nocache', 'Scrap market form' );
	nocache_headers();
}
add_action( 'template_redirect', 'sm_no_cache_views', 1 );

/**
 * Values that fill the shared field markup: a rejected draft, or an existing listing.
 *
 * @param int $post_id Listing to load, or 0 for a new one.
 * @return array<string,string>
 */
function sm_form_values( $post_id = 0 ) {
	$values = array(
		'kind'           => 'sell',
		'title'          => '',
		'material'       => '',
		'material_other' => '',
		'quantity'       => '',
		'unit'           => 'MT',
		'price'          => '',
		'currency'       => 'AED',
		'per'            => 'MT',
		'region'         => '',
		'location'       => '',
		'description'    => '',
		'seller'         => '',
		'company'        => '',
		'whatsapp'       => '',
		'email'          => '',
		'status'         => 'available',
	);

	if ( $post_id ) {
		$values['kind']        = sm_listing_kind( $post_id );
		$values['title']       = (string) get_the_title( $post_id );
		$values['quantity']    = sm_get( $post_id, 'quantity' );
		$values['unit']        = sm_get( $post_id, 'unit', 'MT' );
		$values['price']       = sm_get( $post_id, 'price' );
		$values['currency']    = sm_get( $post_id, 'currency', 'AED' );
		$values['per']         = sm_get( $post_id, 'per', 'MT' );
		$values['location']    = sm_get( $post_id, 'location' );
		$values['description'] = (string) get_post_field( 'post_content', $post_id );
		$values['seller']      = sm_get( $post_id, 'seller' );
		$values['company']     = sm_get( $post_id, 'company' );
		$values['whatsapp']    = sm_get( $post_id, 'whatsapp' );
		$values['email']       = sm_get( $post_id, 'email' );
		$values['status']      = sm_get( $post_id, 'status', 'available' );

		$terms = wp_get_post_terms( $post_id, 'scrap_material' );
		if ( ! is_wp_error( $terms ) && ! empty( $terms[0] ) ) {
			$values['material'] = $terms[0]->slug;
		}

		$regions = wp_get_post_terms( $post_id, 'scrap_region' );
		if ( ! is_wp_error( $regions ) && ! empty( $regions[0] ) ) {
			$values['region'] = $regions[0]->slug;
		}
	}

	return $values;
}

/**
 * The photo picker: several at once, one at a time, or straight from the camera, each one
 * croppable before it is added.
 *
 * @param int[] $existing Attachments already on the listing.
 * @return string
 */
function sm_render_photo_field( array $existing = array() ) {
	ob_start();
	?>
	<div class="sm-photos" data-photos data-max="5">
		<div class="sm-photos__head">
			<span class="sm-field__label">Photos <i>up to 5</i></span>
			<span class="sm-photos__count" data-photos-count>0 / 5</span>
		</div>

		<?php if ( $existing ) : ?>
			<ul class="sm-photos__existing">
				<?php foreach ( $existing as $attachment_id ) : ?>
					<li>
						<?php echo wp_get_attachment_image( (int) $attachment_id, 'thumbnail', false, array( 'alt' => '' ) ); ?>
						<label class="sm-photos__remove">
							<input type="checkbox" name="sm_remove_photos[]" value="<?php echo esc_attr( (string) $attachment_id ); ?>">
							<span>Remove</span>
						</label>
					</li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>

		<input class="sm-photos__input" type="file" name="sm_photos[]"
			accept="image/jpeg,image/png,image/webp" multiple data-photos-add>
		<input class="sm-photos__input" type="file" accept="image/jpeg,image/png,image/webp"
			capture="environment" data-photos-snap-input>

		<div class="sm-photos__bar">
			<button class="sm-btn sm-btn--ghost" type="button" data-photos-pick>＋ Add photos</button>
			<button class="sm-btn sm-btn--ghost" type="button" data-photos-snap>📷 Take a photo</button>
			<button class="sm-btn sm-btn--ghost" type="button" data-photos-clear hidden>Remove all</button>
		</div>

		<ul class="sm-photos__grid" data-photos-grid></ul>
		<small>Pick them one by one or all at once, crop each one if you want. Every photo is compressed to under 300 KB and location data is stripped.</small>
	</div>
	<?php
	return (string) ob_get_clean();
}

/**
 * The fieldsets shared by the posting form and the edit form.
 *
 * @param array<string,string> $values Filled values.
 * @param array                $args   photos (html), consent (bool), status (bool).
 * @return void
 */
function sm_render_fields( array $values, array $args = array() ) {
	$args = array_merge(
		array(
			'photos'  => '',
			'consent' => true,
			'status'  => false,
		),
		$args
	);

	$materials = get_terms( array( 'taxonomy' => 'scrap_material', 'hide_empty' => false ) );
	$regions   = get_terms( array( 'taxonomy' => 'scrap_region', 'hide_empty' => false ) );
	$fields    = sm_fields();
	$kinds     = sm_kinds();

	$value = function ( $key ) use ( $values ) {
		return isset( $values[ $key ] ) ? (string) $values[ $key ] : '';
	};
	?>
	<fieldset class="sm-fs">
		<legend>1. What is it?</legend>

		<div class="sm-kinds" role="radiogroup" aria-label="Listing type">
			<?php foreach ( $kinds as $slug => $kind ) : ?>
				<label class="sm-kindbox">
					<input type="radio" name="sm_kind" value="<?php echo esc_attr( $slug ); ?>" <?php checked( $value( 'kind' ), $slug ); ?>>
					<span>
						<b><?php echo esc_html( $kind['label'] ); ?></b>
						<em><?php echo esc_html( $kind['hint'] ); ?></em>
					</span>
				</label>
			<?php endforeach; ?>
		</div>

		<label class="sm-field">
			<span>Title <i>required</i></span>
			<input type="text" name="sm_title" maxlength="120" required
				value="<?php echo esc_attr( $value( 'title' ) ); ?>"
				placeholder="e.g. HDPE jerry can scrap, washed regrind — 24 MT, Karachi">
			<small>Write the grade, the quantity and the city. This is what people search for.</small>
		</label>

		<div class="sm-row">
			<label class="sm-field">
				<span>Material</span>
				<select name="sm_material">
					<option value="">Choose…</option>
					<?php foreach ( $materials as $term ) : ?>
						<?php if ( $term instanceof WP_Term ) : ?>
							<option value="<?php echo esc_attr( $term->slug ); ?>" <?php selected( $value( 'material' ), $term->slug ); ?>><?php echo esc_html( $term->name ); ?></option>
						<?php endif; ?>
					<?php endforeach; ?>
					<option value="other" <?php selected( $value( 'material' ), 'other' ); ?>>Other (name it below)</option>
				</select>
			</label>
			<label class="sm-field">
				<span>Material name, if "Other"</span>
				<input type="text" name="sm_material_other" maxlength="60"
					value="<?php echo esc_attr( $value( 'material_other' ) ); ?>" placeholder="e.g. EVA film">
			</label>
		</div>
	</fieldset>

	<fieldset class="sm-fs">
		<legend>2. How much, and at what price?</legend>
		<div class="sm-row">
			<label class="sm-field">
				<span>Quantity</span>
				<input type="text" name="sm_quantity" inputmode="decimal"
					value="<?php echo esc_attr( $value( 'quantity' ) ); ?>" placeholder="24">
			</label>
			<label class="sm-field">
				<span>Unit</span>
				<select name="sm_unit">
					<?php foreach ( $fields['unit']['options'] as $option => $label ) : ?>
						<option value="<?php echo esc_attr( $option ); ?>" <?php selected( $value( 'unit' ), $option ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</label>
		</div>
		<div class="sm-row">
			<label class="sm-field">
				<span>Price</span>
				<input type="text" name="sm_price" inputmode="decimal"
					value="<?php echo esc_attr( $value( 'price' ) ); ?>" placeholder="1850">
				<small>Leave empty for "price on request".</small>
			</label>
			<label class="sm-field">
				<span>Currency</span>
				<select name="sm_currency">
					<?php foreach ( $fields['currency']['options'] as $option => $label ) : ?>
						<option value="<?php echo esc_attr( $option ); ?>" <?php selected( $value( 'currency' ), $option ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</label>
			<label class="sm-field">
				<span>Price per</span>
				<select name="sm_per">
					<?php foreach ( $fields['per']['options'] as $option => $label ) : ?>
						<option value="<?php echo esc_attr( $option ); ?>" <?php selected( $value( 'per' ), $option ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</label>
		</div>
	</fieldset>

	<fieldset class="sm-fs">
		<legend>3. Where is it?</legend>
		<div class="sm-row">
			<label class="sm-field">
				<span>Region</span>
				<select name="sm_region">
					<option value="">Choose…</option>
					<?php foreach ( $regions as $term ) : ?>
						<?php if ( $term instanceof WP_Term ) : ?>
							<option value="<?php echo esc_attr( $term->slug ); ?>" <?php selected( $value( 'region' ), $term->slug ); ?>><?php echo esc_html( $term->name ); ?></option>
						<?php endif; ?>
					<?php endforeach; ?>
				</select>
			</label>
			<label class="sm-field">
				<span>City / port</span>
				<input type="text" name="sm_location" maxlength="80"
					value="<?php echo esc_attr( $value( 'location' ) ); ?>" placeholder="e.g. Jebel Ali, Dubai">
			</label>
		</div>
	</fieldset>

	<fieldset class="sm-fs">
		<legend>4. Photos and description</legend>
		<?php echo $args['photos']; // phpcs:ignore WordPress.Security.EscapeOutput -- built above with escaped values. ?>
		<label class="sm-field">
			<span>Description</span>
			<textarea name="sm_description" rows="5" maxlength="2000"
				placeholder="Grade, colour, contamination, packing, loading, payment terms…"><?php echo esc_textarea( $value( 'description' ) ); ?></textarea>
		</label>
	</fieldset>

	<fieldset class="sm-fs">
		<legend>5. How should buyers reach you?</legend>
		<div class="sm-row">
			<label class="sm-field">
				<span>Name <i>required</i></span>
				<input type="text" name="sm_seller" maxlength="80" required
					value="<?php echo esc_attr( $value( 'seller' ) ); ?>">
			</label>
			<label class="sm-field">
				<span>Company</span>
				<input type="text" name="sm_company" maxlength="120"
					value="<?php echo esc_attr( $value( 'company' ) ); ?>">
			</label>
		</div>
		<div class="sm-row">
			<label class="sm-field">
				<span>WhatsApp / phone</span>
				<input type="text" name="sm_whatsapp" inputmode="tel" maxlength="30"
					value="<?php echo esc_attr( $value( 'whatsapp' ) ); ?>" placeholder="971501234567">
				<small>A phone number or an email — one of the two is enough.</small>
			</label>
			<label class="sm-field">
				<span>Email</span>
				<input type="email" name="sm_email" maxlength="120"
					value="<?php echo esc_attr( $value( 'email' ) ); ?>">
			</label>
		</div>

		<?php if ( $args['status'] ) : ?>
			<label class="sm-field">
				<span>Status</span>
				<select name="sm_status">
					<?php foreach ( sm_fields()['status']['options'] as $option => $label ) : ?>
						<option value="<?php echo esc_attr( $option ); ?>" <?php selected( $value( 'status' ), $option ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
				<small>Mark it sold once the lot is gone — that closes it without deleting it.</small>
			</label>
		<?php endif; ?>

		<?php if ( $args['consent'] ) : ?>
			<label class="sm-consent">
				<input type="checkbox" name="sm_consent" value="1" required>
				<span>I agree that these details are published publicly, and that they are mine to publish.</span>
			</label>
		<?php endif; ?>
	</fieldset>
	<?php
}

/**
 * Front-end form. Renders nothing to anonymous users when posting is switched off.
 *
 * @return string
 */
function sm_render_form() {
	// Remember which page holds the form, so redirects after posting land back on it.
	$page_id = is_singular() ? (int) get_the_ID() : 0;
	if ( $page_id && (int) get_option( 'sm_post_page_id' ) !== $page_id ) {
		update_option( 'sm_post_page_id', $page_id );
	}

	$s = sm_settings();
	if ( empty( $s['posting_open'] ) ) {
		return '<div class="sm-panel"><p class="sm-muted">Posting is closed at the moment. Send the details on WhatsApp and we will list it for you.</p></div>';
	}

	// A rejected submission left its text behind — put it back in the fields.
	$draft  = sm_take_draft();
	$values = sm_form_values( 0 );
	foreach ( $values as $key => $default ) {
		if ( isset( $draft[ 'sm_' . $key ] ) && '' !== $draft[ 'sm_' . $key ] ) {
			$values[ $key ] = (string) $draft[ 'sm_' . $key ];
		}
	}

	ob_start();
	?>
	<div class="sm-form-wrap" id="post-form">
		<?php if ( isset( $_GET['sm_msg'] ) ) : ?>
			<?php list( $type, $text ) = sm_message( sanitize_key( wp_unslash( $_GET['sm_msg'] ) ) ); ?>
			<div class="sm-alert sm-alert--<?php echo esc_attr( $type ); ?>"><?php echo esc_html( $text ); ?></div>
		<?php endif; ?>

		<form class="sm-form" method="post" enctype="multipart/form-data"
			action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-sm-form>
			<input type="hidden" name="action" value="sm_submit">
			<input type="hidden" name="sm_ajax" value="1">
			<?php wp_nonce_field( 'sm_submit', 'sm_submit_nonce' ); ?>
			<input type="hidden" name="sm_ts" value="<?php echo esc_attr( (string) time() ); ?>">
			<input type="hidden" name="sm_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" class="sm-hp">

			<?php sm_render_fields( $values, array( 'photos' => sm_render_photo_field() ) ); ?>

			<div class="sm-form-actions">
				<button class="sm-btn sm-btn--primary" type="submit">Publish listing</button>
				<span class="sm-muted">Free. No account needed.</span>
			</div>
			<p class="sm-form__msg" data-form-msg role="status"></p>
		</form>
	</div>
	<?php
	return (string) ob_get_clean();
}
add_shortcode( 'scrap_market_post', 'sm_render_form' );

/**
 * The "edit or delete" block shown on a listing page.
 *
 * Nothing renders until the visitor asks for it: the link opens the panel, the panel asks
 * for the password, and only then is the edit form shown.
 *
 * @param int $post_id Listing ID.
 * @return void
 */
function sm_render_manage( $post_id ) {
	$post_id = (int) $post_id;

	if ( 'scrap_listing' !== get_post_type( $post_id ) ) {
		return;
	}

	$open = isset( $_GET['sm'] ) && 'manage' === sanitize_key( wp_unslash( $_GET['sm'] ) );

	echo '<div class="sm-manage" id="sm-manage">';

	if ( isset( $_GET['sm_msg'] ) ) {
		$code = sanitize_key( wp_unslash( $_GET['sm_msg'] ) );
		// The single template prints its own report confirmation.
		if ( 'reported' !== $code ) {
			list( $type, $text ) = sm_message( $code );
			printf( '<div class="sm-alert sm-alert--%s">%s</div>', esc_attr( $type ), esc_html( $text ) );
		}
	}

	if ( ! $open ) {
		printf(
			'<p class="sm-manage__hint"><a class="sm-link" href="%s">Posted this lot? Edit or delete it</a></p>',
			esc_url( sm_manage_url( $post_id ) )
		);
		echo '</div>';

		return;
	}

	if ( ! sm_manage_authorised( $post_id ) ) {
		?>
		<form class="sm-form sm-manage__auth" method="post"
			action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-sm-form>
			<input type="hidden" name="action" value="sm_manage_auth">
			<input type="hidden" name="sm_ajax" value="1">
			<input type="hidden" name="listing" value="<?php echo esc_attr( (string) $post_id ); ?>">
			<?php wp_nonce_field( 'sm_manage_auth_' . $post_id, 'sm_manage_nonce' ); ?>
			<h2 class="sm-h2">Edit this listing</h2>
			<label class="sm-field">
				<span>Password <i>required</i></span>
				<input type="password" name="sm_password" required autocomplete="current-password">
				<small>The editing password for the market.</small>
			</label>
			<div class="sm-form-actions">
				<button class="sm-btn sm-btn--primary" type="submit">Unlock editing</button>
				<a class="sm-link" href="<?php echo esc_url( get_permalink( $post_id ) ); ?>">Cancel</a>
			</div>
			<p class="sm-form__msg" data-form-msg role="status"></p>
		</form>
		<?php
		echo '</div>';

		return;
	}

	$values = sm_form_values( $post_id );
	$draft  = sm_take_draft();
	foreach ( $values as $key => $default ) {
		if ( isset( $draft[ 'sm_' . $key ] ) && '' !== $draft[ 'sm_' . $key ] ) {
			$values[ $key ] = (string) $draft[ 'sm_' . $key ];
		}
	}

	$gallery = array();
	$stored  = sm_get( $post_id, 'gallery' );
	if ( '' !== $stored ) {
		$gallery = array_values( array_filter( array_map( 'absint', explode( ',', $stored ) ) ) );
	}
	?>
	<form class="sm-form sm-manage__form" method="post" enctype="multipart/form-data"
		action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-sm-form>
		<input type="hidden" name="action" value="sm_manage_save">
		<input type="hidden" name="sm_ajax" value="1">
		<input type="hidden" name="listing" value="<?php echo esc_attr( (string) $post_id ); ?>">
		<?php wp_nonce_field( 'sm_manage_save_' . $post_id, 'sm_manage_nonce' ); ?>

		<h2 class="sm-h2">Edit this listing</h2>
		<?php
		sm_render_fields(
			$values,
			array(
				'photos'  => sm_render_photo_field( $gallery ),
				'consent' => false,
				'status'  => true,
			)
		);
		?>

		<div class="sm-form-actions">
			<button class="sm-btn sm-btn--primary" type="submit">Save changes</button>
			<a class="sm-link" href="<?php echo esc_url( get_permalink( $post_id ) ); ?>">Back to the listing</a>
		</div>
		<p class="sm-form__msg" data-form-msg role="status"></p>
	</form>

	<form class="sm-manage__delete" method="post"
		action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"
		data-confirm="Delete this listing? It leaves the market immediately and can be restored from the WordPress trash.">
		<input type="hidden" name="action" value="sm_manage_delete">
		<input type="hidden" name="listing" value="<?php echo esc_attr( (string) $post_id ); ?>">
		<?php wp_nonce_field( 'sm_manage_delete_' . $post_id, 'sm_manage_nonce' ); ?>
		<button class="sm-link sm-link--danger" type="submit">Delete this listing</button>
	</form>
	<?php
	echo '</div>';
}


/**
 * Handle a posted listing.
 */
function sm_handle_submission() {
	if ( ! isset( $_POST['sm_submit_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['sm_submit_nonce'] ) ), 'sm_submit' ) ) {
		sm_reply( false, 'security', sm_post_page_url() );
	}

	$back = sm_post_page_url();

	// Honeypot: a human never sees this field, so a value means a bot.
	if ( ! empty( $_POST['sm_hp'] ) ) {
		sm_reply( false, 'spam', $back );
	}

	// A form filled in under three seconds was not read by a person.
	$started = isset( $_POST['sm_ts'] ) ? (int) $_POST['sm_ts'] : 0;
	if ( $started && ( time() - $started ) < 3 ) {
		sm_reply( false, 'spam', $back );
	}

	if ( sm_rate_limited( 'post', 5, HOUR_IN_SECONDS ) ) {
		sm_reply( false, 'throttled', $back );
	}

	$data  = sm_collect_input();
	$error = sm_validate( $data );

	if ( '' === $error && empty( $_POST['sm_consent'] ) ) {
		$error = 'required';
	}

	if ( '' !== $error ) {
		// Keep what was typed so the form does not come back empty.
		sm_store_draft( $_POST );
		sm_reply( false, $error, $back );
	}

	// Repeat submissions of the same thing from the same IP inside an hour are dropped.
	$fingerprint = 'sm_dup_' . md5( sm_client_ip() . '|' . mb_strtolower( $data['title'] ) );
	if ( get_transient( $fingerprint ) ) {
		sm_reply( true, 'duplicate', $back );
	}

	$post_id = wp_insert_post(
		array(
			'post_type'    => 'scrap_listing',
			'post_status'  => sm_posting_mode(),
			'post_title'   => $data['title'],
			'post_content' => $data['description'],
			'post_excerpt' => wp_trim_words( $data['description'], 40, '' ),
		),
		true
	);

	if ( is_wp_error( $post_id ) ) {
		sm_store_draft( $_POST );
		sm_reply( false, 'required', $back );
	}

	set_transient( $fingerprint, 1, HOUR_IN_SECONDS );
	update_post_meta( $post_id, '_sm_source', 'front-end' );

	sm_save_listing( $post_id, $data );
	sm_attach_photos( $post_id );

	$mode = sm_posting_mode();

	sm_reply( true, 'publish' === $mode ? 'posted' : 'queued', get_permalink( $post_id ) );
}
add_action( 'admin_post_sm_submit', 'sm_handle_submission' );
add_action( 'admin_post_nopriv_sm_submit', 'sm_handle_submission' );


/**
 * Flag a listing for review. Open to everyone, rate limited, and idempotent per IP.
 */
function sm_handle_report() {
	$post_id = isset( $_GET['listing'] ) ? (int) $_GET['listing'] : 0;
	$nonce   = isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';

	if ( ! $post_id || ! wp_verify_nonce( $nonce, 'sm_report_' . $post_id ) || 'scrap_listing' !== get_post_type( $post_id ) ) {
		wp_safe_redirect( sm_archive_url() );
		exit;
	}

	$target = get_permalink( $post_id );

	if ( ! sm_rate_limited( 'report', 20, HOUR_IN_SECONDS ) ) {
		$flag = 'sm_reported_' . $post_id . '_' . md5( sm_client_ip() );
		if ( ! get_transient( $flag ) ) {
			set_transient( $flag, 1, WEEK_IN_SECONDS );
			$reports = (int) get_post_meta( $post_id, '_sm_reports', true );
			update_post_meta( $post_id, '_sm_reports', $reports + 1 );
			update_post_meta( $post_id, '_sm_reported_at', time() );
		}
	}

	wp_safe_redirect( add_query_arg( 'sm_msg', 'reported', $target ) );
	exit;
}
add_action( 'admin_post_sm_report', 'sm_handle_report' );
add_action( 'admin_post_nopriv_sm_report', 'sm_handle_report' );

/**
 * Keep _sm_price_sort in step with the price, so price sorting never drops a listing.
 *
 * @param int $post_id Post ID.
 * @return void
 */
function sm_record_price_sort( $post_id ) {
	$price = sm_get( (int) $post_id, 'price' );
	$value = ( '' !== $price && is_numeric( $price ) ) ? (float) $price : 999999999;

	update_post_meta( (int) $post_id, '_sm_price_sort', $value );
}
add_action( 'save_post_scrap_listing', 'sm_record_price_sort', 20 );

/**
 * Report link for a listing.
 *
 * @param int $post_id Post ID.
 * @return string
 */
function sm_report_link( $post_id ) {
	return wp_nonce_url(
		add_query_arg(
			array(
				'action'  => 'sm_report',
				'listing' => (int) $post_id,
			),
			admin_url( 'admin-post.php' )
		),
		'sm_report_' . (int) $post_id
	);
}
