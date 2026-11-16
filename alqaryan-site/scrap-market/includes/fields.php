<?php
/**
 * Listing details: one meta box, one save handler, one definition table.
 *
 * Adding a field later means adding one line to sm_fields() — the box, the
 * sanitising and the schema all read from the same definition.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @return array<string,array<string,mixed>>
 */
function sm_fields() {
	return array(
		'grade'      => array(
			'label'   => 'Grade / spec',
			'type'    => 'text',
			'hint'    => 'e.g. Natural, mixed colour, MFI 3-5, washed',
			'group'   => 'Material',
		),
		'form'       => array(
			'label'   => 'Form',
			'type'    => 'select',
			'options' => array(
				'bales'    => 'Bales',
				'regrind'  => 'Regrind',
				'flakes'   => 'Flakes',
				'granules' => 'Granules / pellets',
				'lumps'    => 'Lumps',
				'pipes'    => 'Pipes / profiles',
				'mixed'    => 'Mixed',
				'other'    => 'Other',
			),
			'group'   => 'Material',
		),
		'quantity'   => array(
			'label' => 'Quantity',
			'type'  => 'text',
			'hint'  => 'Numbers only, e.g. 24',
			'group' => 'Quantity & price',
		),
		'unit'       => array(
			'label'   => 'Unit',
			'type'    => 'select',
			'options' => array(
				'MT'         => 'Metric tonnes',
				'kg'         => 'Kilograms',
				'containers' => 'Containers',
			),
			'group'   => 'Quantity & price',
		),
		'price'      => array(
			'label' => 'Price',
			'type'  => 'text',
			'hint'  => 'Numbers only, e.g. 1850',
			'group' => 'Quantity & price',
		),
		'currency'   => array(
			'label'   => 'Currency',
			'type'    => 'select',
			'options' => array(
				'AED' => 'AED',
				'PKR' => 'PKR',
				'USD' => 'USD',
			),
			'group'   => 'Quantity & price',
		),
		'per'        => array(
			'label'   => 'Price per',
			'type'    => 'select',
			'options' => array(
				'MT'        => 'per tonne',
				'kg'        => 'per kg',
				'container' => 'per container',
			),
			'group'   => 'Quantity & price',
		),
		'basis'      => array(
			'label'   => 'Delivery basis',
			'type'    => 'select',
			'options' => array(
				'EXW' => 'EXW — ex works',
				'FOB' => 'FOB — free on board',
				'CIF' => 'CIF — cost, insurance, freight',
				'CPT' => 'CPT — carriage paid to',
				'DAP' => 'DAP — delivered at place',
			),
			'group'   => 'Quantity & price',
		),
		'location'   => array(
			'label' => 'Location',
			'type'  => 'text',
			'hint'  => 'e.g. Jebel Ali, Dubai',
			'group' => 'Logistics',
		),
		'available'  => array(
			'label' => 'Available from',
			'type'  => 'date',
			'group' => 'Logistics',
		),
		'expires'    => array(
			'label' => 'Listing expires',
			'type'  => 'date',
			'hint'  => 'After this date the page stays live but is noindexed.',
			'group' => 'Logistics',
		),
		'status'     => array(
			'label'   => 'Status',
			'type'    => 'select',
			'options' => array(
				'available' => 'Available',
				'reserved'  => 'Reserved',
				'sold'      => 'Sold',
			),
			'group'   => 'Logistics',
		),
		'seller'     => array(
			'label' => 'Seller name',
			'type'  => 'text',
			'group' => 'Contact',
		),
		'company'    => array(
			'label' => 'Seller company',
			'type'  => 'text',
			'group' => 'Contact',
		),
		'whatsapp'   => array(
			'label' => 'WhatsApp / phone',
			'type'  => 'text',
			'hint'  => 'Digits with country code, e.g. 971501234567',
			'group' => 'Contact',
		),
		'email'      => array(
			'label' => 'Email',
			'type'  => 'email',
			'group' => 'Contact',
		),
	);
}

/**
 * Read one listing field.
 *
 * @param int    $post_id Post ID.
 * @param string $key     Field key without the _sm_ prefix.
 * @param string $default Returned when the field has never been saved.
 * @return string
 */
function sm_get( $post_id, $key, $default = '' ) {
	$value = get_post_meta( (int) $post_id, '_sm_' . $key, true );

	return ( '' === $value || null === $value ) ? $default : (string) $value;
}

/**
 * Human price string, e.g. "AED 1,850 / tonne · FOB".
 *
 * @param int $post_id Post ID.
 * @return string
 */
function sm_price_label( $post_id ) {
	$price = sm_get( $post_id, 'price' );
	if ( '' === $price || ! is_numeric( $price ) ) {
		return '—';
	}

	$currency = sm_get( $post_id, 'currency', 'AED' );
	$per      = sm_get( $post_id, 'per', 'MT' );
	$basis    = sm_get( $post_id, 'basis', '' );

	$per_label = array(
		'MT'        => '/ tonne',
		'kg'        => '/ kg',
		'container' => '/ container',
	);

	$out = $currency . ' ' . number_format_i18n( (float) $price, 0 );
	if ( isset( $per_label[ $per ] ) ) {
		$out .= ' ' . $per_label[ $per ];
	}
	if ( '' !== $basis ) {
		$out .= ' · ' . $basis;
	}

	return $out;
}

/**
 * Quantity string, e.g. "24 MT".
 *
 * @param int $post_id Post ID.
 * @return string
 */
function sm_quantity_label( $post_id ) {
	$qty = sm_get( $post_id, 'quantity' );
	if ( '' === $qty ) {
		return '—';
	}

	$unit = sm_get( $post_id, 'unit', 'MT' );
	$unit = 'containers' === $unit ? 'container(s)' : $unit;

	return $qty . ' ' . $unit;
}

/**
 * Register the meta box.
 */
add_action( 'add_meta_boxes', function () {
	add_meta_box(
		'sm_details',
		'Listing details',
		'sm_render_meta_box',
		'scrap_listing',
		'normal',
		'high'
	);
} );

/**
 * @param WP_Post $post Current post.
 */
function sm_render_meta_box( $post ) {
	wp_nonce_field( 'sm_save_details', 'sm_details_nonce' );

	$fields = sm_fields();
	$group  = '';
	$s      = sm_settings();

	echo '<style>.sm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 22px}.sm-grid label{display:block;font-weight:600;margin-bottom:4px}.sm-grid input,.sm-grid select{width:100%}.sm-group{margin:18px 0 8px;padding-top:12px;border-top:1px solid #e3ebe6;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:#6b7c85}</style>';
	echo '<div class="sm-grid">';

	foreach ( $fields as $key => $def ) {
		if ( $def['group'] !== $group ) {
			$group = $def['group'];
			echo '</div><div class="sm-group">' . esc_html( $group ) . '</div><div class="sm-grid">';
		}

		$id    = 'sm_' . $key;
		$value = sm_get( $post->ID, $key );

		if ( '' === $value ) {
			if ( 'seller' === $key ) {
				$value = $s['seller_name'];
			} elseif ( 'whatsapp' === $key ) {
				$value = $s['seller_phone'];
			}
		}

		echo '<div><label for="' . esc_attr( $id ) . '">' . esc_html( $def['label'] ) . '</label>';

		if ( 'select' === $def['type'] ) {
			echo '<select id="' . esc_attr( $id ) . '" name="' . esc_attr( $id ) . '">';
			foreach ( $def['options'] as $opt_value => $opt_label ) {
				printf(
					'<option value="%s"%s>%s</option>',
					esc_attr( $opt_value ),
					selected( $value, $opt_value, false ),
					esc_html( $opt_label )
				);
			}
			echo '</select>';
		} else {
			printf(
				'<input type="%s" id="%s" name="%s" value="%s">',
				esc_attr( $def['type'] ),
				esc_attr( $id ),
				esc_attr( $id ),
				esc_attr( $value )
			);
		}

		if ( ! empty( $def['hint'] ) ) {
			echo '<p class="description" style="margin:4px 0 0">' . esc_html( $def['hint'] ) . '</p>';
		}

		echo '</div>';
	}

	echo '</div>';
}

/**
 * Save the box. Nonce, autosave and capability are all checked.
 *
 * @param int $post_id Post ID.
 */
function sm_save_details( $post_id ) {
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	if ( ! isset( $_POST['sm_details_nonce'] ) ) {
		return;
	}
	if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['sm_details_nonce'] ) ), 'sm_save_details' ) ) {
		return;
	}
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}

	foreach ( sm_fields() as $key => $def ) {
		$name = 'sm_' . $key;
		if ( ! isset( $_POST[ $name ] ) ) {
			continue;
		}

		$raw = wp_unslash( $_POST[ $name ] );

		switch ( $def['type'] ) {
			case 'email':
				$value = sanitize_email( $raw );
				break;
			case 'date':
				$value = preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $raw ) ? (string) $raw : '';
				break;
			case 'select':
				$value = array_key_exists( $raw, $def['options'] ) ? (string) $raw : '';
				break;
			default:
				$value = sanitize_text_field( $raw );
		}

		if ( '' === $value ) {
			delete_post_meta( $post_id, '_sm_' . $key );
		} else {
			update_post_meta( $post_id, '_sm_' . $key, $value );
		}
	}

	// Price and quantity must be numeric to reach the schema.
	foreach ( array( 'price', 'quantity' ) as $numeric ) {
		$value = get_post_meta( $post_id, '_sm_' . $numeric, true );
		if ( '' !== $value && ! is_numeric( $value ) ) {
			delete_post_meta( $post_id, '_sm_' . $numeric );
		}
	}
}
add_action( 'save_post_scrap_listing', 'sm_save_details' );

/**
 * Expose the listing fields to the REST API.
 *
 * Without this a listing created over REST (the workshop, an AI agent, a script) saves its
 * title and body but silently loses the price, the quantity and the contact details,
 * because underscore-prefixed meta is protected by default.
 */
add_action( 'init', function () {
	$auth = function () {
		return current_user_can( 'edit_posts' );
	};

	foreach ( sm_fields() as $key => $def ) {
		register_post_meta(
			'scrap_listing',
			'_sm_' . $key,
			array(
				'show_in_rest'  => true,
				'single'        => true,
				'type'          => 'string',
				'auth_callback' => $auth,
			)
		);
	}

	register_post_meta(
		'scrap_listing',
		'_sm_gallery',
		array(
			'show_in_rest'  => true,
			'single'        => true,
			'type'          => 'string',
			'auth_callback' => $auth,
		)
	);

	register_post_meta(
		'scrap_listing',
		'_sm_price_sort',
		array(
			'show_in_rest'  => false,
			'single'        => true,
			'type'          => 'number',
			'auth_callback' => $auth,
		)
	);
}, 20 );
