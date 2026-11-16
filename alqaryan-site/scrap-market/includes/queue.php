<?php
/**
 * Review queue: everything waiting for approval, plus everything a visitor reported.
 *
 * Because the market is open, this is the screen that keeps it clean. Approve publishes a
 * pending listing; Dismiss just clears the report counter and leaves the listing live;
 * Trash removes it. All three are nonce-checked capability-checked admin actions.
 *
 * @package AlQaryanScrapMarket
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'admin_menu', function () {
	$count = sm_queue_count();

	add_submenu_page(
		'edit.php?post_type=scrap_listing',
		'Review queue',
		'Review queue' . ( $count ? ' <span class="update-plugins count-' . (int) $count . '"><span class="plugin-count">' . (int) $count . '</span></span>' : '' ),
		'edit_posts',
		'sm-queue',
		'sm_render_queue'
	);
} );

/**
 * How many items are waiting.
 *
 * @return int
 */
function sm_queue_count() {
	$pending = get_posts(
		array(
			'post_type'      => 'scrap_listing',
			'post_status'    => 'pending',
			'fields'         => 'ids',
			'posts_per_page' => 200,
		)
	);

	$reported = get_posts(
		array(
			'post_type'      => 'scrap_listing',
			'post_status'    => 'publish',
			'fields'         => 'ids',
			'posts_per_page' => 200,
			'meta_query'     => array(
				array(
					'key'     => '_sm_reports',
					'value'   => 0,
					'compare' => '>',
					'type'    => 'NUMERIC',
				),
			),
		)
	);

	return count( $pending ) + count( $reported );
}

/**
 * Handling for the three row actions.
 */
add_action( 'admin_init', function () {
	if ( ! isset( $_GET['page'] ) || 'sm-queue' !== $_GET['page'] || ! isset( $_GET['sm_action'], $_GET['listing'] ) ) {
		return;
	}
	if ( ! current_user_can( 'edit_posts' ) ) {
		return;
	}

	$listing = (int) $_GET['listing'];
	$nonce   = isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';
	if ( ! wp_verify_nonce( $nonce, 'sm_queue_' . $listing ) ) {
		return;
	}

	$action = sanitize_key( wp_unslash( $_GET['sm_action'] ) );

	if ( 'approve' === $action ) {
		wp_update_post(
			array(
				'ID'          => $listing,
				'post_status' => 'publish',
			)
		);
	} elseif ( 'dismiss' === $action ) {
		delete_post_meta( $listing, '_sm_reports' );
		delete_post_meta( $listing, '_sm_reported_at' );
	} elseif ( 'trash' === $action ) {
		wp_trash_post( $listing );
	}

	wp_safe_redirect( admin_url( 'edit.php?post_type=scrap_listing&page=sm-queue&done=1' ) );
	exit;
} );

/**
 * The screen.
 */
function sm_render_queue() {
	if ( ! current_user_can( 'edit_posts' ) ) {
		return;
	}

	$items = get_posts(
		array(
			'post_type'      => 'scrap_listing',
			'post_status'    => array( 'pending', 'publish', 'draft' ),
			'posts_per_page' => 100,
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);

	$pending  = array();
	$reported = array();
	foreach ( $items as $item ) {
		if ( 'pending' === $item->post_status ) {
			$pending[] = $item;
			continue;
		}
		if ( (int) get_post_meta( $item->ID, '_sm_reports', true ) > 0 ) {
			$reported[] = $item;
		}
	}
	?>
	<div class="wrap">
		<h1>Review queue</h1>
		<?php if ( isset( $_GET['done'] ) ) : ?>
			<div class="notice notice-success is-dismissible"><p>Done.</p></div>
		<?php endif; ?>

		<h2>Waiting for approval <span class="count">(<?php echo count( $pending ); ?>)</span></h2>
		<?php if ( ! $pending ) : ?>
			<p>Nothing waiting.</p>
		<?php else : ?>
			<table class="widefat striped">
				<thead><tr><th>Listing</th><th>Kind</th><th>Posted</th><th style="width:320px">Actions</th></tr></thead>
				<tbody>
					<?php foreach ( $pending as $item ) : ?>
						<tr>
							<td><strong><a href="<?php echo esc_url( get_edit_post_link( $item->ID ) ); ?>"><?php echo esc_html( get_the_title( $item ) ); ?></a></strong></td>
							<td><?php echo esc_html( sm_kinds()[ sm_listing_kind( $item->ID ) ]['label'] ); ?></td>
							<td><?php echo esc_html( get_the_date( 'j M Y H:i', $item ) ); ?></td>
							<td><?php echo sm_queue_actions( $item->ID, true ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>

		<h2 style="margin-top:2rem">Reported by visitors <span class="count">(<?php echo count( $reported ); ?>)</span></h2>
		<?php if ( ! $reported ) : ?>
			<p>Nothing reported.</p>
		<?php else : ?>
			<table class="widefat striped">
				<thead><tr><th>Listing</th><th>Kind</th><th>Reports</th><th>Last report</th><th style="width:320px">Actions</th></tr></thead>
				<tbody>
					<?php foreach ( $reported as $item ) : ?>
						<tr>
							<td><strong><a href="<?php echo esc_url( get_permalink( $item->ID ) ); ?>"><?php echo esc_html( get_the_title( $item ) ); ?></a></strong></td>
							<td><?php echo esc_html( sm_kinds()[ sm_listing_kind( $item->ID ) ]['label'] ); ?></td>
							<td><?php echo esc_html( (string) (int) get_post_meta( $item->ID, '_sm_reports', true ) ); ?></td>
							<td><?php echo esc_html( human_time_diff( (int) get_post_meta( $item->ID, '_sm_reported_at', true ) ) ); ?> ago</td>
							<td><?php echo sm_queue_actions( $item->ID, false ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
	</div>
	<?php
}

/**
 * Approve / dismiss / trash links for one row.
 *
 * @param int  $post_id Listings ID.
 * @param bool $approve Whether to offer the approve action.
 * @return string
 */
function sm_queue_actions( $post_id, $approve ) {
	$base = admin_url( 'edit.php?post_type=scrap_listing&page=sm-queue' );
	$link = function ( $action, $label, $class = '' ) use ( $base, $post_id ) {
		$url = wp_nonce_url(
			add_query_arg(
				array(
					'sm_action' => $action,
					'listing'   => $post_id,
				),
				$base
			),
			'sm_queue_' . $post_id
		);

		return '<a class="button ' . esc_attr( $class ) . '" href="' . esc_url( $url ) . '">' . esc_html( $label ) . '</a> ';
	};

	$out = '';
	if ( $approve ) {
		$out .= $link( 'approve', 'Approve', 'button-primary' );
	}
	$out .= $link( 'dismiss', 'Dismiss report' );
	$out .= $link( 'trash', 'Trash' );

	if ( $approve ) {
		$out .= ' <a class="button" href="' . esc_url( get_edit_post_link( $post_id ) ) . '">Edit</a>';
	}

	return $out;
}
