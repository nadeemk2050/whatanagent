<?php
/**
 * Market query: the For Sale / Need to Buy switch, search, facet filters and sorting.
 *
 * Every control is a plain GET parameter, so each filtered view is a real, linkable URL
 * that works without JavaScript and can be indexed or sent on WhatsApp. The search is
 * implemented as a WHERE clause on the current query rather than WordPress's `s`
 * parameter, because `s` turns the request into a general search and the market
 * template would no longer be used.
 *
 * @package AlQaryanScrapMarket
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The two directions a listing can go, in the words buyers actually use.
 *
 * @return array<string,array<string,string>>
 */
function sm_kinds() {
	return array(
		'sell' => array(
			'label' => 'For Sale',
			'short' => 'Selling',
			'hint'  => 'Material offered for sale',
		),
		'buy'  => array(
			'label' => 'Need to Buy',
			'short' => 'Wanted',
			'hint'  => 'Material a buyer is looking for',
		),
	);
}

/**
 * True while the main query is rendering a market view.
 *
 * @return bool
 */
function sm_market_context() {
	return ! empty( $GLOBALS['sm_market_archive'] );
}

/**
 * The kind of one listing, defaulting to "For Sale".
 *
 * @param int $post_id Post ID.
 * @return string sell|buy
 */
function sm_listing_kind( $post_id ) {
	$terms = wp_get_post_terms( (int) $post_id, 'scrap_kind', array( 'fields' => 'slugs' ) );
	$slug  = ( ! is_wp_error( $terms ) && ! empty( $terms[0] ) ) ? (string) $terms[0] : '';

	// Only the two known directions get a badge; anything else falls back to For Sale so a
	// stray term can never produce an undefined index in the templates.
	return array_key_exists( $slug, sm_kinds() ) ? $slug : 'sell';
}

/**
 * The kind requested by the current URL, or '' for both.
 *
 * @return string
 */
function sm_requested_kind() {
	$kind = isset( $_GET['kind'] ) ? sanitize_key( wp_unslash( $_GET['kind'] ) ) : '';

	return array_key_exists( $kind, sm_kinds() ) ? $kind : '';
}

/**
 * Live counts per kind, for the switch tabs.
 *
 * @return array<string,int>
 */
function sm_kind_counts() {
	$out = array( 'all' => 0, 'sell' => 0, 'buy' => 0 );
	foreach ( array_keys( sm_kinds() ) as $slug ) {
		$term = get_term_by( 'slug', $slug, 'scrap_kind' );
		if ( $term instanceof WP_Term ) {
			$out[ $slug ] = (int) $term->count;
			$out['all']  += (int) $term->count;
		}
	}

	return $out;
}

/**
 * Rebuild the current market URL with some filters changed.
 *
 * @param array<string,string> $change Filter => value. An empty value removes the filter.
 * @param string               $base   Base URL; defaults to the market archive.
 * @return string
 */
function sm_market_url( array $change = array(), $base = '' ) {
	$base = $base ? $base : get_post_type_archive_link( 'scrap_listing' );
	$args = array();

	foreach ( array( 'kind', 'q', 'material', 'region', 'qty', 'sort' ) as $key ) {
		if ( isset( $_GET[ $key ] ) && '' !== $_GET[ $key ] ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$args[ $key ] = sanitize_text_field( wp_unslash( $_GET[ $key ] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		}
	}

	foreach ( $change as $key => $value ) {
		if ( '' === $value || null === $value ) {
			unset( $args[ $key ] );
		} else {
			$args[ $key ] = $value;
		}
	}

	return $args ? add_query_arg( $args, $base ) : $base;
}

/**
 * Read one active filter from the URL.
 *
 * @param string $key Parameter name.
 * @return string
 */
function sm_filter( $key ) {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended
	return isset( $_GET[ $key ] ) ? sanitize_text_field( wp_unslash( $_GET[ $key ] ) ) : '';
}

/**
 * Apply the market filters to the main query.
 */
add_action( 'pre_get_posts', function ( $query ) {
	if ( is_admin() || ! $query->is_main_query() ) {
		return;
	}
	if ( ! $query->is_post_type_archive( 'scrap_listing' ) && ! $query->is_tax( array( 'scrap_material', 'scrap_region', 'scrap_kind' ) ) ) {
		return;
	}

	$GLOBALS['sm_market_archive'] = true;

	$query->set( 'posts_per_page', 20 );
	$query->set( 'ignore_sticky_posts', true );

	/* ---------------------------------------------------------------- taxonomy */
	$tax_query = (array) $query->get( 'tax_query' );

	$kind = sm_requested_kind();
	if ( '' !== $kind ) {
		$tax_query[] = array(
			'taxonomy' => 'scrap_kind',
			'field'    => 'slug',
			'terms'    => $kind,
		);
	}

	$material = sanitize_title( sm_filter( 'material' ) );
	if ( '' !== $material && ! $query->is_tax( 'scrap_material' ) ) {
		$tax_query[] = array(
			'taxonomy' => 'scrap_material',
			'field'    => 'slug',
			'terms'    => $material,
		);
	}

	$region = sanitize_title( sm_filter( 'region' ) );
	if ( '' !== $region && ! $query->is_tax( 'scrap_region' ) ) {
		$tax_query[] = array(
			'taxonomy' => 'scrap_region',
			'field'    => 'slug',
			'terms'    => $region,
		);
	}

	if ( $tax_query ) {
		$query->set( 'tax_query', $tax_query );
	}

	/* -------------------------------------------------------------------- meta */
	$meta_query = (array) $query->get( 'meta_query' );

	$qty = sm_filter( 'qty' );
	if ( '' !== $qty && is_numeric( $qty ) ) {
		$meta_query[] = array(
			'key'     => '_sm_quantity',
			'value'   => (float) $qty,
			'compare' => '>=',
			'type'    => 'DECIMAL(12,3)',
		);
	}

	if ( $meta_query ) {
		$query->set( 'meta_query', $meta_query );
	}

	/* ------------------------------------------------------------------- order */
	$sort = sm_filter( 'sort' );
	if ( 'price_asc' === $sort || 'price_desc' === $sort ) {
		// Every listing stores _sm_price_sort (a number, or 9.9e8 when unpriced), so price
		// order never silently drops the listings that have no rate yet.
		$query->set( 'meta_key', '_sm_price_sort' );
		$query->set(
			'orderby',
			array(
				'meta_value_num' => 'price_asc' === $sort ? 'ASC' : 'DESC',
				'date'           => 'DESC',
			)
		);
	} else {
		$query->set( 'orderby', 'date' );
		$query->set( 'order', 'oldest' === $sort ? 'ASC' : 'DESC' );
	}
} );

/**
 * Free-text search over title and excerpt, scoped to the market query only.
 */
add_action( 'pre_get_posts', function ( $query ) {
	if ( is_admin() || ! $query->is_main_query() ) {
		return;
	}
	$term = trim( sm_filter( 'q' ) );
	if ( '' === $term ) {
		return;
	}

	global $wpdb;

	$like = '%' . $wpdb->esc_like( $term ) . '%';

	add_filter(
		'posts_where',
		function ( $where, $q ) use ( $query, $wpdb, $like ) {
			if ( $q !== $query ) {
				return $where;
			}

			return $where . $wpdb->prepare(
				" AND ( {$wpdb->posts}.post_title LIKE %s OR {$wpdb->posts}.post_excerpt LIKE %s OR {$wpdb->posts}.post_content LIKE %s ) ",
				$like,
				$like,
				$like
			);
		},
		10,
		2
	);
}, 20 );

/**
 * Keep the market template on a market view even when the search has no results.
 *
 * @param string $template Resolved template.
 * @return string
 */
add_filter( 'template_include', function ( $template ) {
	return sm_market_context() ? sm_market_template() : $template;
}, 30 );

/**
 * Path to the archive template.
 *
 * @return string
 */
function sm_market_template() {
	$override = locate_template( array( 'archive-scrap_listing.php', 'scrap-market/archive-scrap_listing.php' ) );
	if ( $override ) {
		return $override;
	}
	$ours = SM_DIR . 'templates/archive-scrap_listing.php';

	return file_exists( $ours ) ? $ours : '';
}
