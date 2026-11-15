<?php
/**
 * One listing: /scrap-market/{slug}/
 *
 * @package AlQaryanScrapMarket
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();

while ( have_posts() ) :
	the_post();

	$post_id  = get_the_ID();
	$status   = sm_get( $post_id, 'status', 'available' );
	$expired  = sm_listing_is_expired( $post_id );
	$price    = sm_price_label( $post_id );
	$phone    = preg_replace( '/[^0-9]/', '', sm_get( $post_id, 'whatsapp', sm_settings()['seller_phone'] ) );
	$seller   = sm_get( $post_id, 'seller', sm_settings()['seller_name'] );
	$company  = sm_get( $post_id, 'company' );
	$email    = sm_get( $post_id, 'email' );
	$archive  = get_post_type_archive_link( 'scrap_listing' );
	$mterms   = wp_get_post_terms( $post_id, 'scrap_material' );
	$rterms   = wp_get_post_terms( $post_id, 'scrap_region' );
	$material = ( ! is_wp_error( $mterms ) && ! empty( $mterms[0] ) ) ? $mterms[0] : null;

	$wa_text = sprintf(
		'Hello, I am interested in your Scrap Market listing: %s (%s). %s',
		get_the_title(),
		get_permalink(),
		'' !== $price && '—' !== $price ? 'Price shown: ' . $price . '.' : ''
	);

	$facts = array(
		'Material'  => $material ? $material->name : '',
		'Grade'     => sm_get( $post_id, 'grade' ),
		'Form'      => sm_get( $post_id, 'form' ),
		'Quantity'  => ( '—' !== sm_quantity_label( $post_id ) ) ? sm_quantity_label( $post_id ) : '',
		'Available' => sm_get( $post_id, 'available' ),
		'Location'  => sm_get( $post_id, 'location' ),
		'Basis'     => sm_get( $post_id, 'basis' ),
		'Seller'    => trim( $seller . ( $company ? ' · ' . $company : '' ) ),
	);
	?>
	<div class="sm-wrap sm-single">

		<nav class="sm-crumbs" aria-label="Breadcrumb">
			<a href="<?php echo esc_url( home_url( '/' ) ); ?>">Home</a>
			<span aria-hidden="true">/</span>
			<a href="<?php echo esc_url( $archive ); ?>">Scrap Market</a>
			<?php if ( $material ) : ?>
				<?php $link = get_term_link( $material ); ?>
				<span aria-hidden="true">/</span>
				<a href="<?php echo esc_url( is_wp_error( $link ) ? $archive : $link ); ?>"><?php echo esc_html( $material->name ); ?></a>
			<?php endif; ?>
		</nav>

		<header class="sm-hero sm-hero--listing">
			<?php if ( $material ) : ?>
				<p class="sm-kicker"><?php echo esc_html( $material->name ); ?></p>
			<?php endif; ?>
			<h1><?php the_title(); ?></h1>

			<div class="sm-pricebar">
				<div>
					<span class="sm-pricebar__label">Price</span>
					<strong class="sm-pricebar__value"><?php echo esc_html( $price ); ?></strong>
				</div>
				<div>
					<span class="sm-pricebar__label">Quantity</span>
					<strong class="sm-pricebar__value"><?php echo esc_html( sm_quantity_label( $post_id ) ); ?></strong>
				</div>
				<div>
					<span class="sm-pricebar__label">Status</span>
					<strong class="sm-pricebar__value">
						<?php echo esc_html( $expired ? 'Expired' : ucfirst( $status ) ); ?>
					</strong>
				</div>
			</div>
		</header>

		<div class="sm-single__grid">

			<div class="sm-single__main">

				<?php if ( has_post_thumbnail() ) : ?>
					<figure class="sm-photo">
						<?php
						the_post_thumbnail(
							'large',
							array(
								'loading' => 'eager',
								'alt'     => get_the_title(),
							)
						);
						?>
					</figure>
				<?php endif; ?>

				<div class="sm-prose">
					<?php the_content(); ?>
				</div>

				<?php if ( comments_open() || get_comments_number() ) : ?>
					<section class="sm-comments">
						<?php comments_template(); ?>
					</section>
				<?php endif; ?>

			</div>

			<aside class="sm-single__side">

				<div class="sm-panel">
					<h2 class="sm-panel__title">Listing details</h2>
					<dl class="sm-facts">
						<?php foreach ( $facts as $label => $value ) : ?>
							<?php if ( '' === $value ) : ?>
								<?php continue; ?>
							<?php endif; ?>
							<div>
								<dt><?php echo esc_html( $label ); ?></dt>
								<dd><?php echo esc_html( $value ); ?></dd>
							</div>
						<?php endforeach; ?>
					</dl>
				</div>

				<div class="sm-panel sm-panel--cta">
					<h2 class="sm-panel__title">Enquire about this lot</h2>
					<p class="sm-muted">Quote the listing name and we will confirm availability, grade and loading.</p>

					<?php if ( $phone ) : ?>
						<a class="sm-btn sm-btn--wa" href="<?php echo esc_url( 'https://wa.me/' . $phone . '?text=' . rawurlencode( $wa_text ) ); ?>" rel="nofollow noopener" target="_blank">
							WhatsApp <?php echo esc_html( $seller ); ?>
						</a>
						<a class="sm-btn sm-btn--ghost" href="<?php echo esc_url( 'tel:+' . $phone ); ?>">Call +<?php echo esc_html( $phone ); ?></a>
					<?php endif; ?>

					<?php if ( $email ) : ?>
						<a class="sm-btn sm-btn--ghost" href="<?php echo esc_url( 'mailto:' . $email ); ?>">Email</a>
					<?php endif; ?>
				</div>

				<?php if ( ! is_wp_error( $rterms ) && $rterms ) : ?>
					<div class="sm-panel">
						<h2 class="sm-panel__title">Region</h2>
						<p class="sm-chips">
							<?php foreach ( $rterms as $term ) : ?>
								<?php $link = get_term_link( $term ); ?>
								<a class="sm-chip" href="<?php echo esc_url( is_wp_error( $link ) ? $archive : $link ); ?>"><?php echo esc_html( $term->name ); ?></a>
							<?php endforeach; ?>
						</p>
					</div>
				<?php endif; ?>

			</aside>
		</div>

		<?php if ( $material ) : ?>
			<?php
			$related = get_posts(
				array(
					'post_type'      => 'scrap_listing',
					'posts_per_page' => 3,
					'post__not_in'   => array( $post_id ),
					'tax_query'      => array(
						array(
							'taxonomy' => 'scrap_material',
							'field'    => 'term_id',
							'terms'    => $material->term_id,
						),
					),
				)
			);
			?>
			<?php if ( $related ) : ?>
				<section class="sm-related">
					<h2>More <?php echo esc_html( $material->name ); ?> listings</h2>
					<div class="sm-grid">
						<?php foreach ( $related as $item ) : ?>
							<article class="sm-card">
								<a class="sm-card__media" href="<?php echo esc_url( get_permalink( $item ) ); ?>">
									<?php if ( has_post_thumbnail( $item ) ) : ?>
										<?php echo get_the_post_thumbnail( $item, 'sm-card', array( 'loading' => 'lazy' ) ); ?>
									<?php else : ?>
										<span class="sm-card__placeholder" aria-hidden="true">No photo</span>
									<?php endif; ?>
								</a>
								<div class="sm-card__body">
									<h3 class="sm-card__title">
										<a href="<?php echo esc_url( get_permalink( $item ) ); ?>"><?php echo esc_html( get_the_title( $item ) ); ?></a>
									</h3>
									<p class="sm-card__price"><?php echo esc_html( sm_price_label( $item->ID ) ); ?></p>
								</div>
							</article>
						<?php endforeach; ?>
					</div>
				</section>
			<?php endif; ?>
		<?php endif; ?>

	</div>
	<?php
endwhile;

get_footer();
