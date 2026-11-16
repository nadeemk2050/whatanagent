<?php
/**
 * Search-engine wiring: description fallback, noindex for dead listings, IndexNow.
 *
 * Rank Math already owns titles and descriptions on this site, so nothing here
 * fights it — the description filter steps aside the moment Rank Math is active.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Has the listing passed its expiry date?
 *
 * @param int $post_id Post ID.
 * @return bool
 */
function sm_listing_is_expired( $post_id ) {
	$expires = sm_get( $post_id, 'expires' );
	if ( '' === $expires ) {
		return false;
	}

	$ts = strtotime( $expires );

	return $ts && $ts < strtotime( 'today' );
}

/**
 * Sold and expired listings stay at their URL (history is worth keeping) but
 * leave the index.
 *
 * @param array<string,bool> $robots Robots directives.
 * @return array<string,bool>
 */
function sm_robots( $robots ) {
	if ( ! is_singular( 'scrap_listing' ) ) {
		return $robots;
	}

	$post_id = get_queried_object_id();
	$sold    = 'sold' === sm_get( $post_id, 'status', 'available' );

	if ( $sold || sm_listing_is_expired( $post_id ) ) {
		$robots['noindex']  = true;
		$robots['nofollow'] = false;
	}

	return $robots;
}
add_filter( 'wp_robots', 'sm_robots' );

/**
 * Build an informative, rich meta description for a scrap listing or archive.
 *
 * @param int|null $post_id Post ID if singular.
 * @return string
 */
function sm_get_seo_description( $post_id = null ) {
	if ( ! $post_id ) {
		$post_id = get_queried_object_id();
	}

	if ( is_singular( 'scrap_listing' ) && $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post ) {
			return '';
		}

		$price    = sm_price_label( $post_id );
		$quantity = sm_quantity_label( $post_id );
		$kind     = sm_listing_kind( $post_id );
		$kind_lbl = 'buy' === $kind ? 'Wanted to Buy' : 'For Sale';

		$parts = array( get_the_title( $post ) );
		if ( '—' !== $quantity ) {
			$parts[] = $quantity;
		}
		if ( '—' !== $price ) {
			$parts[] = $price;
		}
		$parts[] = '(' . $kind_lbl . ')';
		$header = implode( ' · ', $parts );

		$text = has_excerpt( $post ) ? get_the_excerpt( $post ) : wp_strip_all_tags( $post->post_content );
		$text = trim( (string) $text );
		if ( ! empty( $text ) ) {
			$text = wp_trim_words( $text, 25, '...' );
			return $header . ' — ' . $text . ' Direct contact on Recycle Scrap Market.';
		}

		return $header . ' — Direct contact via WhatsApp on Recycle Scrap Market. Al Qaryan Industries.';
	}

	if ( is_post_type_archive( 'scrap_listing' ) ) {
		return 'Live scrap material offers and buy requests — recycled plastics, HDPE, LDPE, PET, regrind, bales and off-grade lots with direct seller WhatsApp contact.';
	}

	return '';
}

/**
 * Filter Rank Math description for scrap listings and archive.
 *
 * @param string $description Current description.
 * @return string
 */
function sm_rank_math_description( $description ) {
	if ( is_singular( 'scrap_listing' ) || is_post_type_archive( 'scrap_listing' ) ) {
		$custom = sm_get_seo_description();
		if ( ! empty( $custom ) ) {
			return $custom;
		}
	}
	return $description;
}
add_filter( 'rank_math/frontend/description', 'sm_rank_math_description', 15 );
add_filter( 'rank_math/opengraph/facebook/description', 'sm_rank_math_description', 15 );
add_filter( 'rank_math/opengraph/twitter/description', 'sm_rank_math_description', 15 );

/**
 * Filter Rank Math title for scrap market archive.
 *
 * @param string $title Current title.
 * @return string
 */
function sm_rank_math_title( $title ) {
	if ( is_post_type_archive( 'scrap_listing' ) ) {
		return 'Recycle Scrap Market | Live Offers & Wanted Lots | Al Qaryan Industries';
	}
	return $title;
}
add_filter( 'rank_math/frontend/title', 'sm_rank_math_title', 15 );

/**
 * Description fallback for when Rank Math is not installed or not configured.
 */
function sm_meta_description() {
	if ( defined( 'RANK_MATH_VERSION' ) ) {
		return;
	}

	if ( is_singular( 'scrap_listing' ) || is_post_type_archive( 'scrap_listing' ) ) {
		$desc = sm_get_seo_description();
		if ( ! empty( $desc ) ) {
			printf( '<meta name="description" content="%s">' . "\n", esc_attr( $desc ) );
		}
	}
}
add_action( 'wp_head', 'sm_meta_description', 4 );

/**
 * Tell IndexNow about a listing. Bing, Yandex and several others read this feed,
 * which is the difference between hours and weeks for a brand-new URL.
 *
 * @param int  $post_id  Post ID.
 * @param bool $blocking Wait for the response (used by the manual button).
 * @return array<string,mixed>|WP_Error
 */
function sm_ping_indexnow( $post_id, $blocking = false ) {
	$settings = sm_settings();
	$key      = trim( (string) $settings['indexnow_key'] );

	if ( '' === $key ) {
		return new WP_Error( 'sm_no_key', 'No IndexNow key saved under Settings → Scrap Market.' );
	}

	$url = get_permalink( $post_id );
	if ( ! $url ) {
		return new WP_Error( 'sm_no_url', 'Listing has no public URL yet.' );
	}

	$host = (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST );

	$body = array(
		'host'        => $host,
		'key'         => $key,
		'keyLocation' => home_url( '/' . $key ),
		'urlList'     => array( $url ),
	);

	$response = wp_remote_post(
		'https://api.indexnow.org/indexnow',
		array(
			'timeout'  => $blocking ? 15 : 5,
			'blocking' => $blocking,
			'headers'  => array( 'Content-Type' => 'application/json; charset=utf-8' ),
			'body'     => wp_json_encode( $body ),
		)
	);

	if ( is_wp_error( $response ) ) {
		return $response;
	}

	update_post_meta( $post_id, '_sm_indexnow_at', time() );

	if ( $blocking ) {
		$code = (int) wp_remote_retrieve_response_code( $response );
		update_post_meta( $post_id, '_sm_indexnow_code', $code );

		if ( ! in_array( $code, array( 200, 202 ), true ) ) {
			return new WP_Error(
				'sm_indexnow_code',
				sprintf( 'IndexNow answered %d. A 422 means the key file is missing from the site root; a 403 means a CDN is blocking the request.', $code )
			);
		}
	}

	return array( 'ok' => true );
}

/**
 * Fire a ping the moment a listing goes live.
 *
 * @param string  $new_status New status.
 * @param string  $old_status Previous status.
 * @param WP_Post $post       Post object.
 */
function sm_on_publish( $new_status, $old_status, $post ) {
	if ( 'scrap_listing' !== $post->post_type ) {
		return;
	}
	if ( 'publish' !== $new_status || 'publish' === $old_status ) {
		return;
	}

	sm_ping_indexnow( $post->ID, false );
}
add_action( 'transition_post_status', 'sm_on_publish', 10, 3 );

/**
 * "Submit to IndexNow" button in the publish box, with the last result.
 */
add_action( 'post_submitbox_misc_actions', function () {
	global $post;

	if ( ! $post || 'scrap_listing' !== $post->post_type || 'publish' !== $post->post_status ) {
		return;
	}

	$last = (int) get_post_meta( $post->ID, '_sm_indexnow_at', true );
	$code = get_post_meta( $post->ID, '_sm_indexnow_code', true );
	$link = wp_nonce_url(
		admin_url( 'admin-post.php?action=sm_indexnow&post=' . $post->ID ),
		'sm_indexnow_' . $post->ID
	);

	echo '<div class="misc-pub-section">';
	printf(
		'<a class="button button-secondary" href="%s">Submit to IndexNow</a>',
		esc_url( $link )
	);
	if ( $last ) {
		printf(
			'<p class="description" style="margin:6px 0 0">Last ping %s%s</p>',
			esc_html( date_i18n( 'Y-m-d H:i', $last ) ),
			'' !== $code ? esc_html( ' · HTTP ' . $code ) : ''
		);
	}
	echo '</div>';
} );

/**
 * Handle the manual button.
 */
add_action( 'admin_post_sm_indexnow', function () {
	$post_id = isset( $_GET['post'] ) ? (int) $_GET['post'] : 0;

	if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
		wp_die( 'Not allowed.' );
	}

	check_admin_referer( 'sm_indexnow_' . $post_id );

	$result = sm_ping_indexnow( $post_id, true );
	$flag   = is_wp_error( $result ) ? 'sm_error' : 'sm_ok';

	wp_safe_redirect(
		add_query_arg(
			$flag,
			is_wp_error( $result ) ? rawurlencode( $result->get_error_message() ) : '1',
			get_edit_post_link( $post_id, 'raw' )
		)
	);
	exit;
} );

/**
 * Show the outcome of a manual ping.
 */
add_action( 'admin_notices', function () {
	if ( isset( $_GET['sm_ok'] ) ) {
		echo '<div class="notice notice-success is-dismissible"><p>IndexNow accepted the URL.</p></div>';
	}
	if ( isset( $_GET['sm_error'] ) ) {
		printf(
			'<div class="notice notice-error is-dismissible"><p>%s</p></div>',
			esc_html( rawurldecode( (string) wp_unslash( $_GET['sm_error'] ) ) )
		);
	}
} );

/**
 * Make sure Rank Math includes the listing post type in its sitemap. Rank Math
 * normally picks up public types automatically; this removes the doubt.
 *
 * @param array<int,string> $excluded Post types excluded from the sitemap.
 * @return array<int,string>
 */
function sm_keep_in_sitemap( $excluded ) {
	return array_values( array_diff( (array) $excluded, array( 'scrap_listing' ) ) );
}
add_filter( 'rank_math/sitemap/exclude_post_type', 'sm_keep_in_sitemap' );

/**
 * Clear the page cache whenever a listing changes state.
 *
 * The market archive is cached like any other page, so without this a new listing sits
 * invisible behind a cached copy of /scrap-market/ until the cache happens to expire.
 *
 * Every state change counts, not only publishing: trashing or marking a lot sold has to
 * remove it again, and the sitemaps are cached separately from the pages, so they are
 * purged by URL as well.
 */
add_action( 'transition_post_status', function ( $new_status, $old_status, $post ) {
	if ( 'scrap_listing' !== $post->post_type || $new_status === $old_status ) {
		return;
	}

	do_action( 'litespeed_purge_all' );
	do_action( 'litespeed_purge_url', get_permalink( $post->ID ) );
	do_action( 'litespeed_purge_url', get_post_type_archive_link( 'scrap_listing' ) );
	do_action( 'litespeed_purge_url', home_url( '/wp-sitemap.xml' ) );
	do_action( 'litespeed_purge_url', home_url( '/wp-sitemap-posts-scrap_listing-1.xml' ) );
}, 20, 3 );

/**
 * "Scrap Market" in the archive <title>.
 *
 * @param array<string,string> $parts Title parts.
 * @return array<string,string>
 */
function sm_archive_title( $parts ) {
	if ( is_post_type_archive( 'scrap_listing' ) && empty( $parts['title'] ) ) {
		$parts['title'] = 'Scrap Market';
	}

	return $parts;
}
add_filter( 'document_title_parts', 'sm_archive_title' );
