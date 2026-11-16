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
		'reported'   => array( 'ok', 'Thank you — the listing has been flagged for review.' ),
		'duplicate'  => array( 'ok', 'That listing was already submitted. Thank you.' ),
		'required'   => array( 'error', 'Please fill in the kind, title, material, quantity and description.' ),
		'contact'    => array( 'error', 'Add a WhatsApp number or an email so buyers can reach you.' ),
		'title'      => array( 'error', 'Give the listing a title of at least 8 characters.' ),
		'spam'       => array( 'error', 'That submission looked automated and was not saved. Please try again.' ),
		'throttled'  => array( 'error', 'Too many submissions from this connection. Please try again later.' ),
		'upload'     => array( 'error', 'One of the photos could not be saved. Listings accept JPG, PNG or WebP up to 25 MB.' ),
		'security'   => array( 'error', 'The form expired. Please submit it again.' ),
	);

	return isset( $map[ $code ] ) ? $map[ $code ] : array( 'error', 'Something went wrong. Please try again.' );
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

	$materials = get_terms( array( 'taxonomy' => 'scrap_material', 'hide_empty' => false ) );
	$regions   = get_terms( array( 'taxonomy' => 'scrap_region', 'hide_empty' => false ) );
	$kinds     = sm_kinds();
	$fields    = sm_fields();

	ob_start();
	?>
	<div class="sm-form-wrap" id="post-form">
		<?php if ( isset( $_GET['sm_msg'] ) ) : ?>
			<?php list( $type, $text ) = sm_message( sanitize_key( wp_unslash( $_GET['sm_msg'] ) ) ); ?>
			<div class="sm-alert sm-alert--<?php echo esc_attr( $type ); ?>"><?php echo esc_html( $text ); ?></div>
		<?php endif; ?>

		<form class="sm-form" method="post" enctype="multipart/form-data" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" novalidate>
			<input type="hidden" name="action" value="sm_submit">
			<?php wp_nonce_field( 'sm_submit', 'sm_submit_nonce' ); ?>
			<input type="hidden" name="sm_ts" value="<?php echo esc_attr( (string) time() ); ?>">
			<input type="hidden" name="sm_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" class="sm-hp">

			<fieldset class="sm-fs">
				<legend>1. What is it?</legend>

				<div class="sm-kinds" role="radiogroup" aria-label="Listing type">
					<?php foreach ( $kinds as $slug => $kind ) : ?>
						<label class="sm-kindbox">
							<input type="radio" name="sm_kind" value="<?php echo esc_attr( $slug ); ?>" <?php checked( 'sell', $slug ); ?> required>
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
						placeholder="e.g. HDPE jerry can scrap, washed regrind — 24 MT, Karachi">
					<small>Write the grade, the quantity and the city. This is what people search for.</small>
				</label>

				<div class="sm-row">
					<label class="sm-field">
						<span>Material <i>required</i></span>
						<select name="sm_material" required>
							<option value="">Choose…</option>
							<?php foreach ( $materials as $term ) : ?>
								<?php if ( $term instanceof WP_Term ) : ?>
									<option value="<?php echo esc_attr( $term->slug ); ?>"><?php echo esc_html( $term->name ); ?></option>
								<?php endif; ?>
							<?php endforeach; ?>
							<option value="other">Other (name it below)</option>
						</select>
					</label>
					<label class="sm-field">
						<span>Material name, if "Other"</span>
						<input type="text" name="sm_material_other" maxlength="60" placeholder="e.g. EVA film">
					</label>
				</div>
			</fieldset>

			<fieldset class="sm-fs">
				<legend>2. How much, and at what price?</legend>
				<div class="sm-row">
					<label class="sm-field">
						<span>Quantity <i>required</i></span>
						<input type="text" name="sm_quantity" inputmode="decimal" required placeholder="24">
					</label>
					<label class="sm-field">
						<span>Unit</span>
						<select name="sm_unit">
							<?php foreach ( $fields['unit']['options'] as $value => $label ) : ?>
								<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
							<?php endforeach; ?>
						</select>
					</label>
				</div>
				<div class="sm-row">
					<label class="sm-field">
						<span>Price</span>
						<input type="text" name="sm_price" inputmode="decimal" placeholder="1850">
						<small>Leave empty for "price on request".</small>
					</label>
					<label class="sm-field">
						<span>Currency</span>
						<select name="sm_currency">
							<?php foreach ( $fields['currency']['options'] as $value => $label ) : ?>
								<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
							<?php endforeach; ?>
						</select>
					</label>
					<label class="sm-field">
						<span>Price per</span>
						<select name="sm_per">
							<?php foreach ( $fields['per']['options'] as $value => $label ) : ?>
								<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
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
									<option value="<?php echo esc_attr( $term->slug ); ?>"><?php echo esc_html( $term->name ); ?></option>
								<?php endif; ?>
							<?php endforeach; ?>
						</select>
					</label>
					<label class="sm-field">
						<span>City / port</span>
						<input type="text" name="sm_location" maxlength="80" placeholder="e.g. Jebel Ali, Dubai">
					</label>
				</div>
			</fieldset>

			<fieldset class="sm-fs">
				<legend>4. Photos and description</legend>
				<label class="sm-field">
					<span>Photos <i>up to 5</i></span>
					<input type="file" name="sm_photos[]" accept="image/jpeg,image/png,image/webp" multiple>
					<small>Straight from the phone is fine. Every photo is compressed to under 300 KB and location data is stripped.</small>
				</label>
				<label class="sm-field">
					<span>Description <i>required</i></span>
					<textarea name="sm_description" rows="5" required maxlength="2000"
						placeholder="Grade, colour, contamination, packing, loading, payment terms…"></textarea>
				</label>
			</fieldset>

			<fieldset class="sm-fs">
				<legend>5. How should buyers reach you?</legend>
				<div class="sm-row">
					<label class="sm-field">
						<span>Name <i>required</i></span>
						<input type="text" name="sm_seller" maxlength="80" required>
					</label>
					<label class="sm-field">
						<span>Company</span>
						<input type="text" name="sm_company" maxlength="120">
					</label>
				</div>
				<div class="sm-row">
					<label class="sm-field">
						<span>WhatsApp / phone</span>
						<input type="text" name="sm_whatsapp" inputmode="tel" maxlength="30" placeholder="971501234567">
						<small>Digits with country code — this is the button buyers tap.</small>
					</label>
					<label class="sm-field">
						<span>Email</span>
						<input type="email" name="sm_email" maxlength="120">
					</label>
				</div>
				<label class="sm-consent">
					<input type="checkbox" name="sm_consent" value="1" required>
					<span>I agree that these details are published publicly, and that they are mine to publish.</span>
				</label>
			</fieldset>

			<div class="sm-form-actions">
				<button class="sm-btn sm-btn--primary" type="submit">Publish listing</button>
				<span class="sm-muted">Free. No account needed.</span>
			</div>
		</form>
	</div>
	<?php
	return (string) ob_get_clean();
}
add_shortcode( 'scrap_market_post', 'sm_render_form' );

/**
 * Handle a posted listing.
 */
function sm_handle_submission() {
	if ( ! isset( $_POST['sm_submit_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['sm_submit_nonce'] ) ), 'sm_submit' ) ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'security', sm_post_page_url() ) );
		exit;
	}

	$back = sm_post_page_url();

	// Honeypot: a human never sees this field, so a value means a bot.
	if ( ! empty( $_POST['sm_hp'] ) ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'spam', $back ) );
		exit;
	}

	// A form filled in under three seconds was not read by a person.
	$started = isset( $_POST['sm_ts'] ) ? (int) $_POST['sm_ts'] : 0;
	if ( $started && ( time() - $started ) < 3 ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'spam', $back ) );
		exit;
	}

	if ( sm_rate_limited( 'post', 5, HOUR_IN_SECONDS ) ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'throttled', $back ) );
		exit;
	}

	$get = function ( $key ) {
		return isset( $_POST[ 'sm_' . $key ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'sm_' . $key ] ) ) : '';
	};

	$kind        = $get( 'kind' );
	$title       = $get( 'title' );
	$quantity    = $get( 'quantity' );
	$description = isset( $_POST['sm_description'] ) ? sanitize_textarea_field( wp_unslash( $_POST['sm_description'] ) ) : '';
	$seller      = $get( 'seller' );
	$whatsapp    = preg_replace( '/[^0-9+]/', '', $get( 'whatsapp' ) );
	$email       = isset( $_POST['sm_email'] ) ? sanitize_email( wp_unslash( $_POST['sm_email'] ) ) : '';
	$material    = sanitize_title( $get( 'material' ) );
	$material_new = $get( 'material_other' );

	if ( ! array_key_exists( $kind, sm_kinds() ) ) {
		$kind = 'sell';
	}
	if ( '' === $title || '' === $quantity || '' === $description || '' === $material ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'required', $back ) );
		exit;
	}
	if ( mb_strlen( $title ) < 8 ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'title', $back ) );
		exit;
	}
	if ( '' === $whatsapp && '' === $email ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'contact', $back ) );
		exit;
	}
	if ( empty( $_POST['sm_consent'] ) ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'required', $back ) );
		exit;
	}

	// Repeat submissions of the same thing from the same IP inside an hour are dropped.
	$fingerprint = 'sm_dup_' . md5( sm_client_ip() . '|' . mb_strtolower( $title ) );
	if ( get_transient( $fingerprint ) ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'duplicate', $back ) );
		exit;
	}

	$post_id = wp_insert_post(
		array(
			'post_type'    => 'scrap_listing',
			'post_status'  => sm_posting_mode(),
			'post_title'   => $title,
			'post_content' => $description,
			'post_excerpt' => wp_trim_words( $description, 40, '' ),
		),
		true
	);

	if ( is_wp_error( $post_id ) ) {
		wp_safe_redirect( add_query_arg( 'sm_msg', 'required', $back ) );
		exit;
	}

	set_transient( $fingerprint, 1, HOUR_IN_SECONDS );

	/* ------------------------------------------------------------- taxonomies */
	$kind_term = term_exists( $kind, 'scrap_kind' );
	if ( $kind_term ) {
		wp_set_object_terms( $post_id, (int) ( is_array( $kind_term ) ? $kind_term['term_id'] : $kind_term ), 'scrap_kind' );
	}

	if ( 'other' === $material && '' !== $material_new ) {
		$created = wp_insert_term( $material_new, 'scrap_material' );
		if ( ! is_wp_error( $created ) ) {
			wp_set_object_terms( $post_id, (int) $created['term_id'], 'scrap_material' );
		}
	} elseif ( '' !== $material ) {
		wp_set_object_terms( $post_id, $material, 'scrap_material' );
	}

	$region = sanitize_title( $get( 'region' ) );
	if ( '' !== $region ) {
		wp_set_object_terms( $post_id, $region, 'scrap_region' );
	}

	/* ------------------------------------------------------------------ meta */
	$meta = array(
		'grade'    => $get( 'grade' ) ? $get( 'grade' ) : $title,
		'form'     => $get( 'form' ),
		'quantity' => preg_replace( '/[^0-9.]/', '', $quantity ),
		'unit'     => $get( 'unit' ),
		'price'    => preg_replace( '/[^0-9.]/', '', $get( 'price' ) ),
		'currency' => $get( 'currency' ),
		'per'      => $get( 'per' ),
		'location' => $get( 'location' ),
		'status'   => 'available',
		'seller'   => $seller ? $seller : 'Seller',
		'company'  => $get( 'company' ),
		'whatsapp' => $whatsapp,
		'email'    => $email,
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
			continue;
		}
		update_post_meta( $post_id, '_sm_' . $key, $value );
	}

	update_post_meta( $post_id, '_sm_source', 'front-end' );

	/* ---------------------------------------------------------------- photos */
	if ( ! empty( $_FILES['sm_photos'] ) && ! empty( $_FILES['sm_photos']['name'] ) && is_array( $_FILES['sm_photos']['name'] ) ) {
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';

		$gallery = array();
		$count   = min( 5, count( $_FILES['sm_photos']['name'] ) );

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
			}
		}
		unset( $_FILES['sm_single'] );

		if ( $gallery ) {
			set_post_thumbnail( $post_id, $gallery[0] );
			update_post_meta( $post_id, '_sm_gallery', implode( ',', $gallery ) );
		}
	}

	sm_record_price_sort( $post_id );

	$msg = 'publish' === sm_posting_mode() ? 'posted' : 'queued';

	wp_safe_redirect( 'posted' === $msg ? get_permalink( $post_id ) : add_query_arg( 'sm_msg', $msg, $back ) );
	exit;
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
