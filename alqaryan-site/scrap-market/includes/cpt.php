<?php
/**
 * The listing post type and its taxonomies.
 *
 * URLs:
 *   /scrap-market/                    archive
 *   /scrap-market/{slug}/             one listing
 *   /scrap-market/material/hdpe/      taxonomy
 *   /scrap-market/region/dubai/       taxonomy
 *   /scrap-market/listing/sell/       taxonomy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function sm_register_post_type() {
	$labels = array(
		'name'                  => 'Scrap Market',
		'singular_name'         => 'Listing',
		'menu_name'             => 'Scrap Market',
		'add_new'               => 'Add Listing',
		'add_new_item'          => 'Add New Listing',
		'edit_item'             => 'Edit Listing',
		'new_item'              => 'New Listing',
		'view_item'             => 'View Listing',
		'search_items'          => 'Search Listings',
		'not_found'             => 'No listings yet.',
		'not_found_in_trash'    => 'No listings in the bin.',
		'all_items'             => 'All Listings',
		'featured_image'        => 'Main photo',
		'set_featured_image'    => 'Set main photo',
		'remove_featured_image' => 'Remove main photo',
	);

	register_post_type(
		'scrap_listing',
		array(
			'labels'             => $labels,
			'description'        => 'Buy and sell offers on the Scrap Market.',
			'public'             => true,
			'publicly_queryable' => true,
			'show_ui'            => true,
			'show_in_menu'       => true,
			'show_in_nav_menus'  => true,
			'show_in_rest'       => true,
			'menu_icon'          => 'dashicons-store',
			'menu_position'      => 26,
			'hierarchical'       => false,
			'has_archive'        => 'scrap-market',
			'rewrite'            => array(
				'slug'       => 'scrap-market',
				'with_front' => false,
				'feeds'      => true,
				'pages'      => true,
			),
			'supports'           => array( 'title', 'editor', 'thumbnail', 'excerpt', 'comments', 'author', 'revisions' ),
			'taxonomies'         => array( 'scrap_material', 'scrap_region', 'scrap_kind' ),
			'capability_type'    => 'post',
			'map_meta_cap'       => true,
		)
	);
}
add_action( 'init', 'sm_register_post_type', 5 );

function sm_register_taxonomies() {
	register_taxonomy(
		'scrap_material',
		array( 'scrap_listing' ),
		array(
			'labels'            => array(
				'name'          => 'Materials',
				'singular_name' => 'Material',
				'add_new_item'  => 'Add Material',
				'all_items'     => 'All Materials',
			),
			'public'            => true,
			'hierarchical'      => true,
			'show_admin_column' => true,
			'show_in_rest'      => true,
			'rewrite'           => array( 'slug' => 'material', 'with_front' => false ),
		)
	);

	register_taxonomy(
		'scrap_region',
		array( 'scrap_listing' ),
		array(
			'labels'            => array(
				'name'          => 'Regions',
				'singular_name' => 'Region',
				'add_new_item'  => 'Add Region',
				'all_items'     => 'All Regions',
			),
			'public'            => true,
			'hierarchical'      => true,
			'show_admin_column' => true,
			'show_in_rest'      => true,
			'rewrite'           => array( 'slug' => 'region', 'with_front' => false ),
		)
	);

	register_taxonomy(
		'scrap_kind',
		array( 'scrap_listing' ),
		array(
			'labels'            => array(
				'name'          => 'Offer type',
				'singular_name' => 'Offer type',
			),
			'public'            => true,
			'hierarchical'      => false,
			'show_admin_column' => true,
			'show_in_rest'      => true,
			'rewrite'           => array( 'slug' => 'listing', 'with_front' => false ),
		)
	);
}
add_action( 'init', 'sm_register_taxonomies', 6 );

/**
 * Seed the offer types, materials and regions once, so the market and the posting form
 * are usable before anything has been filed. The two offer types are the whole point of
 * the page, so their names are also corrected on an existing install.
 */
function sm_seed_terms() {
	if ( ! taxonomy_exists( 'scrap_kind' ) ) {
		return;
	}

	if ( get_option( 'sm_seeded_terms_v2' ) ) {
		return;
	}

	$kinds = array(
		'sell' => 'For Sale',
		'buy'  => 'Need to Buy',
	);

	foreach ( $kinds as $slug => $name ) {
		$existing = get_term_by( 'slug', $slug, 'scrap_kind' );
		if ( $existing instanceof WP_Term ) {
			if ( $existing->name !== $name ) {
				wp_update_term( $existing->term_id, 'scrap_kind', array( 'name' => $name ) );
			}
			continue;
		}
		wp_insert_term( $name, 'scrap_kind', array( 'slug' => $slug ) );
	}

	$materials = array(
		'HDPE'    => 'hdpe',
		'LDPE'    => 'ldpe',
		'PP'      => 'pp',
		'PET'     => 'pet',
		'PVC'     => 'pvc',
		'ABS / PS' => 'abs-ps',
		'Mixed'   => 'mixed',
	);

	foreach ( $materials as $name => $slug ) {
		if ( ! term_exists( $slug, 'scrap_material' ) ) {
			wp_insert_term( $name, 'scrap_material', array( 'slug' => $slug ) );
		}
	}

	$regions = array(
		'Pakistan'      => 'pakistan',
		'UAE'           => 'uae',
		'Saudi Arabia'  => 'saudi-arabia',
		'Far East'      => 'far-east',
		'Europe'        => 'europe',
	);

	foreach ( $regions as $name => $slug ) {
		if ( ! term_exists( $slug, 'scrap_region' ) ) {
			wp_insert_term( $name, 'scrap_region', array( 'slug' => $slug ) );
		}
	}

	update_option( 'sm_seeded_terms_v2', 1 );
}
add_action( 'admin_init', 'sm_seed_terms' );
add_action( 'init', 'sm_seed_terms', 20 );

/**
 * Use the plugin templates, but let a child theme override them.
 *
 * @param string $template Resolved template path.
 * @return string
 */
function sm_template_include( $template ) {
	$is_single  = is_singular( 'scrap_listing' );
	$is_archive = is_post_type_archive( 'scrap_listing' ) || is_tax( array( 'scrap_material', 'scrap_region', 'scrap_kind' ) );

	if ( ! $is_single && ! $is_archive ) {
		return $template;
	}

	$name     = $is_single ? 'single-scrap_listing.php' : 'archive-scrap_listing.php';
	$override = locate_template( array( $name, 'scrap-market/' . $name ) );
	if ( $override ) {
		return $override;
	}

	$ours = SM_DIR . 'templates/' . $name;

	return file_exists( $ours ) ? $ours : $template;
}
add_filter( 'template_include', 'sm_template_include', 20 );

/**
 * Add photo / price / status columns to the admin list.
 *
 * @param array<string,string> $columns Existing columns.
 * @return array<string,string>
 */
function sm_admin_columns( $columns ) {
	$out = array();
	foreach ( $columns as $key => $label ) {
		$out[ $key ] = $label;
		if ( 'title' === $key ) {
			$out['sm_photo']  = 'Photo';
			$out['sm_price']  = 'Price';
			$out['sm_status'] = 'Status';
		}
	}

	return $out;
}
add_filter( 'manage_scrap_listing_posts_columns', 'sm_admin_columns' );

/**
 * @param string $column  Column key.
 * @param int    $post_id Post ID.
 */
function sm_admin_column_content( $column, $post_id ) {
	switch ( $column ) {
		case 'sm_photo':
			if ( has_post_thumbnail( $post_id ) ) {
				echo get_the_post_thumbnail( $post_id, array( 60, 60 ), array( 'style' => 'border-radius:6px;display:block' ) );
			} else {
				echo '&mdash;';
			}
			break;
		case 'sm_price':
			echo esc_html( sm_price_label( $post_id ) );
			break;
		case 'sm_status':
			echo esc_html( ucfirst( sm_get( $post_id, 'status', 'available' ) ) );
			break;
	}
}
add_action( 'manage_scrap_listing_posts_custom_column', 'sm_admin_column_content', 10, 2 );

/**
 * Archive: 24 per page, open listings before sold ones.
 *
 * @param WP_Query $q Query object.
 */
function sm_archive_order( $q ) {
	if ( is_admin() || ! $q->is_main_query() ) {
		return;
	}
	$is_ours = $q->is_post_type_archive( 'scrap_listing' )
		|| $q->is_tax( array( 'scrap_material', 'scrap_region', 'scrap_kind' ) );

	if ( ! $is_ours ) {
		return;
	}

	$q->set( 'posts_per_page', 24 );
}
add_action( 'pre_get_posts', 'sm_archive_order' );
