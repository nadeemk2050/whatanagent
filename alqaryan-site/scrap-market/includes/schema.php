<?php
/**
 * Structured data on a single listing.
 *
 * Deliberately mirrors the shape already used on the material pages: same
 * @context, a Brand, an Offer with availability / businessFunction / areaServed
 * and a seller that points at the existing #organization node so Google merges
 * the marketplace into the company it already knows instead of inventing a
 * second business.
 *
 * What is new here is `price` — that is what earns the price line in a search
 * result, and it is the reason the price fields are mandatory.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Map the internal status to a schema.org availability URL.
 *
 * @param string $status available|reserved|sold.
 * @return string
 */
function sm_schema_availability( $status ) {
	switch ( $status ) {
		case 'reserved':
			return 'https://schema.org/LimitedAvailability';
		case 'sold':
			return 'https://schema.org/SoldOut';
		default:
			return 'https://schema.org/InStock';
	}
}

/**
 * Build the graph for one listing.
 *
 * @param int $post_id Post ID.
 * @return array<string,mixed>
 */
function sm_build_schema( $post_id ) {
	$post = get_post( $post_id );
	if ( ! $post ) {
		return array();
	}

	$title    = get_the_title( $post );
	$summary  = has_excerpt( $post ) ? get_the_excerpt( $post ) : wp_strip_all_tags( $post->post_content );
	$summary  = wp_trim_words( (string) $summary, 55, '' );
	$status   = sm_get( $post_id, 'status', 'available' );
	$price    = sm_get( $post_id, 'price' );
	$currency = sm_get( $post_id, 'currency', 'AED' );
	$per      = sm_get( $post_id, 'per', 'MT' );
	$basis    = sm_get( $post_id, 'basis', '' );
	$quantity = sm_get( $post_id, 'quantity' );
	$unit     = sm_get( $post_id, 'unit', 'MT' );

	$material_terms = wp_get_post_terms( $post_id, 'scrap_material', array( 'fields' => 'names' ) );
	$region_terms   = wp_get_post_terms( $post_id, 'scrap_region', array( 'fields' => 'names' ) );

	$images = array();
	$thumb  = get_the_post_thumbnail_url( $post_id, 'full' );
	if ( $thumb ) {
		$images[] = $thumb;
	}

	$offer = array(
		'@type'            => 'Offer',
		'url'              => get_permalink( $post_id ),
		'availability'     => sm_schema_availability( $status ),
		'businessFunction' => 'http://purl.org/goodrelations/v1#Sell',
		'seller'           => array( '@id' => home_url( '/#organization' ) ),
		'priceCurrency'    => $currency,
		'itemCondition'    => 'https://schema.org/UsedCondition',
	);

	if ( is_numeric( $price ) ) {
		$offer['price'] = (float) $price;
		$offer['priceSpecification'] = array(
			'@type'         => 'UnitPriceSpecification',
			'price'         => (float) $price,
			'priceCurrency' => $currency,
			'unitText'      => 'kg' === $per ? 'KG' : ( 'container' === $per ? 'container' : 'MTQ' ),
		);
	}

	if ( '' !== $basis ) {
		// EXW / FOB / CIF are delivery terms, kept as a plain property rather than
		// forced into a schema type that would misrepresent them.
		$offer['deliveryMethod'] = $basis;
	}

	if ( ! empty( $region_terms ) && ! is_wp_error( $region_terms ) ) {
		$offer['areaServed'] = array(
			'@type' => 'Place',
			'name'  => implode( ', ', $region_terms ),
		);
	}

	$product = array(
		'@type'       => 'Product',
		'@id'         => get_permalink( $post_id ) . '#product',
		'name'        => $title,
		'description' => $summary,
		'url'         => get_permalink( $post_id ),
		'brand'       => array(
			'@type' => 'Brand',
			'name'  => 'Al Qaryan Industries',
		),
		'offers'      => $offer,
	);

	if ( $images ) {
		$product['image'] = $images;
	}

	if ( ! empty( $material_terms ) && ! is_wp_error( $material_terms ) ) {
		$product['category'] = implode( ', ', $material_terms );
		$product['material'] = implode( ', ', $material_terms );
	}

	$props = array();
	$grade = sm_get( $post_id, 'grade' );
	$form  = sm_get( $post_id, 'form' );
	$loc   = sm_get( $post_id, 'location' );

	if ( '' !== $grade ) {
		$props[] = array( '@type' => 'PropertyValue', 'name' => 'Grade', 'value' => $grade );
	}
	if ( '' !== $form ) {
		$props[] = array( '@type' => 'PropertyValue', 'name' => 'Form', 'value' => $form );
	}
	if ( '' !== $quantity ) {
		$props[] = array( '@type' => 'PropertyValue', 'name' => 'Quantity', 'value' => $quantity . ' ' . $unit );
	}
	if ( '' !== $loc ) {
		$props[] = array( '@type' => 'PropertyValue', 'name' => 'Location', 'value' => $loc );
	}
	if ( $props ) {
		$product['additionalProperty'] = $props;
	}

	$crumbs = array(
		array(
			'@type'    => 'ListItem',
			'position' => 1,
			'name'     => 'Home',
			'item'     => home_url( '/' ),
		),
		array(
			'@type'    => 'ListItem',
			'position' => 2,
			'name'     => 'Scrap Market',
			'item'     => get_post_type_archive_link( 'scrap_listing' ),
		),
	);

	$position = 3;
	if ( ! empty( $material_terms ) && ! is_wp_error( $material_terms ) ) {
		$terms = wp_get_post_terms( $post_id, 'scrap_material' );
		if ( ! is_wp_error( $terms ) && ! empty( $terms[0] ) ) {
			$link    = get_term_link( $terms[0] );
			$crumbs[] = array(
				'@type'    => 'ListItem',
				'position' => $position++,
				'name'     => $terms[0]->name,
				'item'     => is_wp_error( $link ) ? home_url( '/' ) : $link,
			);
		}
	}
	$crumbs[] = array(
		'@type'    => 'ListItem',
		'position' => $position,
		'name'     => $title,
		'item'     => get_permalink( $post_id ),
	);

	$graph = array(
		'@context'        => 'https://schema.org',
		'@graph'          => array(
			$product,
			array(
				'@type'           => 'BreadcrumbList',
				'itemListElement' => $crumbs,
			),
		),
	);

	return $graph;
}

/**
 * Print the graph in the head of a single listing.
 */
function sm_print_schema() {
	if ( ! is_singular( 'scrap_listing' ) ) {
		return;
	}

	$graph = sm_build_schema( get_queried_object_id() );
	if ( empty( $graph ) ) {
		return;
	}

	printf(
		"<script type=\"application/ld+json\">%s</script>\n",
		wp_json_encode( $graph, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
	);
}
add_action( 'wp_head', 'sm_print_schema', 30 );

/**
 * The archive gets an ItemList so Google understands it is a hub, not a post.
 */
function sm_print_archive_schema() {
	if ( ! is_post_type_archive( 'scrap_listing' ) && ! is_tax( array( 'scrap_material', 'scrap_region', 'scrap_kind' ) ) ) {
		return;
	}

	$items    = array();
	$position = 1;
	$query    = new WP_Query(
		array(
			'post_type'      => 'scrap_listing',
			'post_status'    => 'publish',
			'posts_per_page' => 24,
			'tax_query'      => array(), // inherits the current archive context via pre_get_posts.
			'no_found_rows'  => true,
		)
	);

	foreach ( $query->posts as $listing ) {
		$items[] = array(
			'@type'    => 'ListItem',
			'position' => $position++,
			'url'      => get_permalink( $listing ),
			'name'     => get_the_title( $listing ),
		);
	}
	wp_reset_postdata();

	if ( ! $items ) {
		return;
	}

	$list = array(
		'@context'        => 'https://schema.org',
		'@type'           => 'ItemList',
		'name'            => wp_get_document_title(),
		'itemListElement' => $items,
	);

	printf(
		"<script type=\"application/ld+json\">%s</script>\n",
		wp_json_encode( $list, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
	);
}
add_action( 'wp_head', 'sm_print_archive_schema', 31 );
