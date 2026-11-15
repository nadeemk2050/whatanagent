<?php
/**
 * Scrap Market archive: /scrap-market/ and every taxonomy view.
 *
 * @package AlQaryanScrapMarket
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();

$current   = get_queried_object();
$is_term   = $current instanceof WP_Term;
$materials = get_terms(
	array(
		'taxonomy'   => 'scrap_material',
		'hide_empty' => true,
	)
);
$regions   = get_terms(
	array(
		'taxonomy'   => 'scrap_region',
		'hide_empty' => true,
	)
);
$archive   = get_post_type_archive_link( 'scrap_listing' );

$heading = 'Scrap Market';
$intro   = 'Live buy and sell offers for recycled plastics and off-grade material. Every listing shows the quantity, the price and the delivery basis, so you can judge it without a phone call.';

if ( $is_term ) {
	$heading = $current->name;
	$intro   = trim( wp_strip_all_tags( $current->description ) );
	if ( '' === $intro ) {
		$intro = sprintf( 'Live offers filed under %s.', $current->name );
	}
}
?>
<div class="sm-wrap">

	<header class="sm-hero">
		<p class="sm-kicker">Scrap Market</p>
		<h1><?php echo esc_html( $heading ); ?></h1>
		<p class="sm-lead"><?php echo esc_html( $intro ); ?></p>
	</header>

	<?php if ( ! is_wp_error( $materials ) && $materials ) : ?>
		<nav class="sm-chips" aria-label="Filter by material">
			<a class="sm-chip<?php echo $is_term ? '' : ' is-active'; ?>" href="<?php echo esc_url( $archive ); ?>">All materials</a>
			<?php foreach ( $materials as $term ) : ?>
				<?php
				$link   = get_term_link( $term );
				$active = ( $is_term && (int) $current->term_id === (int) $term->term_id && 'scrap_material' === $current->taxonomy );
				?>
				<a class="sm-chip<?php echo $active ? ' is-active' : ''; ?>" href="<?php echo esc_url( is_wp_error( $link ) ? $archive : $link ); ?>">
					<?php echo esc_html( $term->name ); ?>
					<span class="sm-chip__count"><?php echo esc_html( (string) $term->count ); ?></span>
				</a>
			<?php endforeach; ?>
		</nav>
	<?php endif; ?>

	<?php if ( ! is_wp_error( $regions ) && $regions ) : ?>
		<nav class="sm-chips sm-chips--quiet" aria-label="Filter by region">
			<?php foreach ( $regions as $term ) : ?>
				<?php
				$link   = get_term_link( $term );
				$active = ( $is_term && (int) $current->term_id === (int) $term->term_id && 'scrap_region' === $current->taxonomy );
				?>
				<a class="sm-chip<?php echo $active ? ' is-active' : ''; ?>" href="<?php echo esc_url( is_wp_error( $link ) ? $archive : $link ); ?>">
					<?php echo esc_html( $term->name ); ?>
				</a>
			<?php endforeach; ?>
		</nav>
	<?php endif; ?>

	<?php if ( have_posts() ) : ?>

		<div class="sm-grid">
			<?php
			while ( have_posts() ) :
				the_post();
				$post_id  = get_the_ID();
				$status   = sm_get( $post_id, 'status', 'available' );
				$terms    = wp_get_post_terms( $post_id, 'scrap_material' );
				$material = ( ! is_wp_error( $terms ) && ! empty( $terms[0] ) ) ? $terms[0]->name : '';
				?>
				<article class="sm-card">
					<a class="sm-card__media" href="<?php the_permalink(); ?>">
						<?php if ( has_post_thumbnail() ) : ?>
							<?php the_post_thumbnail( 'sm-card', array( 'loading' => 'lazy', 'alt' => get_the_title() ) ); ?>
						<?php else : ?>
							<span class="sm-card__placeholder" aria-hidden="true">No photo</span>
						<?php endif; ?>
						<?php if ( 'available' !== $status ) : ?>
							<span class="sm-badge sm-badge--<?php echo esc_attr( $status ); ?>"><?php echo esc_html( ucfirst( $status ) ); ?></span>
						<?php endif; ?>
					</a>
					<div class="sm-card__body">
						<?php if ( '' !== $material ) : ?>
							<p class="sm-card__material"><?php echo esc_html( $material ); ?></p>
						<?php endif; ?>
						<h2 class="sm-card__title">
							<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
						</h2>
						<dl class="sm-card__facts">
							<div><dt>Price</dt><dd><?php echo esc_html( sm_price_label( $post_id ) ); ?></dd></div>
							<div><dt>Quantity</dt><dd><?php echo esc_html( sm_quantity_label( $post_id ) ); ?></dd></div>
							<?php if ( sm_get( $post_id, 'location' ) ) : ?>
								<div><dt>Location</dt><dd><?php echo esc_html( sm_get( $post_id, 'location' ) ); ?></dd></div>
							<?php endif; ?>
						</dl>
					</div>
				</article>
			<?php endwhile; ?>
		</div>

		<div class="sm-pagination">
			<?php
			echo wp_kses_post(
				paginate_links(
					array(
						'prev_text' => '&larr; Newer',
						'next_text' => 'Older &rarr;',
					)
				)
			);
			?>
		</div>

	<?php else : ?>

		<div class="sm-empty">
			<h2>No listings here yet</h2>
			<p>
				Send us the material, the quantity and the location, and we will put a listing together for you.
			</p>
			<p>
				<a class="sm-btn sm-btn--primary" href="<?php echo esc_url( home_url( '/contact/' ) ); ?>">Talk to us</a>
			</p>
		</div>

	<?php endif; ?>

</div>
<?php
get_footer();
