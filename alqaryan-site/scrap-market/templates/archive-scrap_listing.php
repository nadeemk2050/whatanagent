<?php
/**
 * Recycle Scrap Market — the public market page.
 *
 * Full-bleed, full-width marketplace with unified compact topbar:
 * Heading, segmented tabs (All, For Sale, Need to Buy), and collapsible
 * Search & Filter drawer toggled by search button.
 *
 * @package AlQaryanScrapMarket
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();

$current   = get_queried_object();
$is_term   = $current instanceof WP_Term;
$archive   = sm_archive_url();
$kinds     = sm_kinds();
$counts    = sm_kind_counts();
$kind_now  = sm_requested_kind();
$search    = sm_filter( 'q' );
$sort      = sm_filter( 'sort' );
$material  = sm_filter( 'material' );
$region    = sm_filter( 'region' );
$qty       = sm_filter( 'qty' );

$materials = get_terms( array( 'taxonomy' => 'scrap_material', 'hide_empty' => true ) );
$regions   = get_terms( array( 'taxonomy' => 'scrap_region', 'hide_empty' => true ) );

$heading = 'Recycle Scrap Market';
$intro   = 'Every lot below is posted with the grade, the quantity, the price and the delivery basis, so you can judge it without a phone call. Selling is free — post your own listing in two minutes, no account needed.';

if ( $is_term ) {
	$heading = $current->name;
	$intro   = trim( wp_strip_all_tags( $current->description ) );
	if ( '' === $intro ) {
		$intro = sprintf( 'Live lots filed under %s.', $current->name );
	}
}

$has_filters = '' !== $search || '' !== $material || '' !== $region || '' !== $qty;
?>
<div class="sm-wrap sm-market sm-market--fullbleed">

	<div class="sm-topbar">
		<div class="sm-topbar__main">
			<h1 class="sm-topbar__title"><?php echo esc_html( $heading ); ?></h1>
			<nav class="sm-topbar__tabs" aria-label="Listing type">
				<a class="sm-tab<?php echo '' === $kind_now ? ' is-active' : ''; ?>"
					href="<?php echo esc_url( sm_market_url( array( 'kind' => '' ) ) ); ?>">
					<span>All</span>
					<span class="sm-tab__count"><?php echo esc_html( (string) $counts['all'] ); ?></span>
				</a>
				<?php foreach ( $kinds as $slug => $kind ) : ?>
					<a class="sm-tab sm-tab--<?php echo esc_attr( $slug ); ?><?php echo $kind_now === $slug ? ' is-active' : ''; ?>"
						href="<?php echo esc_url( sm_market_url( array( 'kind' => $slug ) ) ); ?>">
						<span><?php echo esc_html( $kind['label'] ); ?></span>
						<span class="sm-tab__count"><?php echo esc_html( (string) $counts[ $slug ] ); ?></span>
					</a>
				<?php endforeach; ?>
			</nav>
		</div>
		<div class="sm-topbar__actions">
			<button type="button" class="sm-btn-search<?php echo $has_filters ? ' has-filters' : ''; ?>" id="smSearchBtn" aria-expanded="<?php echo $has_filters ? 'true' : 'false'; ?>" aria-controls="smFilterDrawer" title="Search &amp; Filter">
				<svg class="sm-icon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
				<span class="sm-btn-search__text">Search &amp; Filter</span>
				<?php if ( $has_filters ) : ?>
					<span class="sm-filter-badge">Active</span>
				<?php endif; ?>
			</button>
			<a class="sm-btn-post" href="<?php echo esc_url( sm_post_page_url() ); ?>" title="Post a free listing">＋ Post Lot</a>
		</div>
	</div>

	<div class="sm-filter-drawer<?php echo $has_filters ? ' is-open' : ''; ?>" id="smFilterDrawer"<?php echo $has_filters ? '' : ' hidden'; ?>>
		<form class="sm-filters" method="get" action="<?php echo esc_url( $archive ); ?>" role="search">
			<?php if ( '' !== $kind_now ) : ?>
				<input type="hidden" name="kind" value="<?php echo esc_attr( $kind_now ); ?>">
			<?php endif; ?>

			<label class="sm-filters__search">
				<span class="screen-reader-text">Search listings</span>
				<input type="search" name="q" value="<?php echo esc_attr( $search ); ?>"
					placeholder="Search HDPE, regrind, PVC pipe scrap, Jebel Ali…">
			</label>

			<label>
				<span class="screen-reader-text">Material</span>
				<select name="material">
					<option value="">All materials</option>
					<?php foreach ( $materials as $term ) : ?>
						<?php if ( $term instanceof WP_Term ) : ?>
							<option value="<?php echo esc_attr( $term->slug ); ?>" <?php selected( $material, $term->slug ); ?>>
								<?php echo esc_html( $term->name ); ?> (<?php echo esc_html( (string) $term->count ); ?>)
							</option>
						<?php endif; ?>
					<?php endforeach; ?>
				</select>
			</label>

			<label>
				<span class="screen-reader-text">Region</span>
				<select name="region">
					<option value="">Any region</option>
					<?php foreach ( $regions as $term ) : ?>
						<?php if ( $term instanceof WP_Term ) : ?>
							<option value="<?php echo esc_attr( $term->slug ); ?>" <?php selected( $region, $term->slug ); ?>>
								<?php echo esc_html( $term->name ); ?> (<?php echo esc_html( (string) $term->count ); ?>)
							</option>
						<?php endif; ?>
					<?php endforeach; ?>
				</select>
			</label>

			<label class="sm-filters__qty">
				<span class="screen-reader-text">Minimum quantity in tonnes</span>
				<input type="number" name="qty" min="1" step="1" value="<?php echo esc_attr( $qty ); ?>" placeholder="Min tonnes">
			</label>

			<label>
				<span class="screen-reader-text">Sort</span>
				<select name="sort">
					<option value="" <?php selected( $sort, '' ); ?>>Newest first</option>
					<option value="oldest" <?php selected( $sort, 'oldest' ); ?>>Oldest first</option>
					<option value="price_asc" <?php selected( $sort, 'price_asc' ); ?>>Price: low to high</option>
					<option value="price_desc" <?php selected( $sort, 'price_desc' ); ?>>Price: high to low</option>
				</select>
			</label>

			<button class="sm-btn sm-btn--primary" type="submit">Filter</button>
			<?php if ( $has_filters ) : ?>
				<a class="sm-filters__clear" href="<?php echo esc_url( sm_market_url( array( 'q' => '', 'material' => '', 'region' => '', 'qty' => '' ) ) ); ?>">Clear</a>
			<?php endif; ?>
			<button type="button" class="sm-filter-close" id="smFilterClose" aria-label="Close filters">✕</button>
		</form>
	</div>

	<?php if ( have_posts() ) : ?>

		<section class="sm-rail-wrap" aria-label="Listings">
			<div class="sm-rail-head">
				<p class="sm-count">
					<?php
					global $wp_query;
					printf(
						/* translators: %s: number of listings on this slide. */
						esc_html( _n( '%s lot', '%s lots', (int) $wp_query->found_posts, 'alqaryan-scrap-market' ) ),
						esc_html( number_format_i18n( (int) $wp_query->found_posts ) )
					);
					?>
					<span class="sm-rail-hint">Swipe →</span>
				</p>
				<div class="sm-rail-nav">
					<button type="button" class="sm-rail-btn" data-rail-prev aria-label="Previous listings">←</button>
					<button type="button" class="sm-rail-btn" data-rail-next aria-label="Next listings">→</button>
				</div>
			</div>

			<div class="sm-rail" data-rail tabindex="0" role="group" aria-label="Lots, use arrow keys or swipe">
				<?php
				while ( have_posts() ) :
					the_post();
					$post_id  = get_the_ID();
					$status   = sm_get( $post_id, 'status', 'available' );
					$kind     = sm_listing_kind( $post_id );
					$terms    = wp_get_post_terms( $post_id, 'scrap_material' );
					$mat_name = ( ! is_wp_error( $terms ) && ! empty( $terms[0] ) ) ? $terms[0]->name : '';
					$is_new   = ( time() - (int) get_post_time( 'U', true, $post_id ) ) < WEEK_IN_SECONDS;
					?>
					<article class="sm-card sm-card--<?php echo esc_attr( $kind ); ?>">
						<a class="sm-card__media" href="<?php the_permalink(); ?>">
							<?php if ( has_post_thumbnail() ) : ?>
								<?php the_post_thumbnail( 'sm-card', array( 'loading' => 'lazy', 'alt' => get_the_title() ) ); ?>
							<?php else : ?>
								<span class="sm-card__placeholder" aria-hidden="true">No photo yet</span>
							<?php endif; ?>
							<span class="sm-badge sm-badge--kind sm-badge--<?php echo esc_attr( $kind ); ?>">
								<?php echo esc_html( $kinds[ $kind ]['label'] ); ?>
							</span>
							<?php if ( 'available' !== $status ) : ?>
								<span class="sm-badge sm-badge--<?php echo esc_attr( $status ); ?>"><?php echo esc_html( ucfirst( $status ) ); ?></span>
							<?php elseif ( $is_new ) : ?>
								<span class="sm-badge sm-badge--new">New</span>
							<?php endif; ?>
						</a>
						<div class="sm-card__body">
							<?php if ( '' !== $mat_name && 0 !== strcasecmp( $mat_name, get_the_title() ) ) : ?>
								<p class="sm-card__material"><?php echo esc_html( $mat_name ); ?></p>
							<?php endif; ?>
							<h2 class="sm-card__title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
							<p class="sm-card__price"><?php echo esc_html( sm_price_label( $post_id ) ); ?></p>
							<dl class="sm-card__facts">
								<div><dt>Qty</dt><dd><?php echo esc_html( sm_quantity_label( $post_id ) ); ?></dd></div>
								<?php if ( sm_get( $post_id, 'location' ) ) : ?>
									<div><dt>At</dt><dd><?php echo esc_html( sm_get( $post_id, 'location' ) ); ?></dd></div>
								<?php endif; ?>
							</dl>
							<a class="sm-card__cta" href="<?php the_permalink(); ?>">
								<span class="sm-card__cta-label">💬 View Details &amp; Contact</span>
								<span class="sm-card__cta-arrow" aria-hidden="true">&rarr;</span>
							</a>
						</div>
					</article>
				<?php endwhile; ?>
			</div>

			<div class="sm-pagination">
				<?php
				echo wp_kses_post(
					paginate_links(
						array(
							'prev_text' => '&larr; Previous 20',
							'next_text' => 'Next 20 &rarr;',
							'type'      => 'plain',
						)
					)
				);
				?>
			</div>
		</section>

	<?php else : ?>

		<div class="sm-empty">
			<h2>Nothing matches that yet</h2>
			<p>Either no lot is filed under these filters, or the market is still filling up. Posting is free and takes two minutes.</p>
			<p>
				<a class="sm-btn sm-btn--primary" href="<?php echo esc_url( sm_post_page_url() ); ?>">Post a listing</a>
				<a class="sm-btn sm-btn--ghost" href="<?php echo esc_url( $archive ); ?>">See everything</a>
			</p>
		</div>

	<?php endif; ?>

	<section class="sm-how">
		<h2>How this market works</h2>
		<div class="sm-how__list">
			<details class="sm-how__item">
				<summary class="sm-how__q">Post free</summary>
				<p>Grade, quantity, price, location and a photo. No account, no fee, live in minutes.</p>
			</details>
			<details class="sm-how__item">
				<summary class="sm-how__q">Buyers message you</summary>
				<p>The WhatsApp button opens a chat with the listing already written into the first message.</p>
			</details>
			<details class="sm-how__item">
				<summary class="sm-how__q">Close it when it is gone</summary>
				<p>Mark a lot sold and it stops competing in the rail instead of misleading the next buyer.</p>
			</details>
		</div>
		<p class="sm-how__cta">
			<a class="sm-btn sm-btn--primary" href="<?php echo esc_url( sm_post_page_url() ); ?>">＋ Post a listing — free</a>
			<a class="sm-btn sm-btn--ghost" href="<?php echo esc_url( home_url( '/we-buy/' ) ); ?>">We buy directly</a>
		</p>
	</section>

</div>
<?php
get_footer();
