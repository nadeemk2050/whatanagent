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
							<div class="sm-card__actions">
								<a class="sm-card__cta" href="<?php the_permalink(); ?>">
									<span class="sm-card__cta-label">
										<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:3px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
										<span>View Details &amp; Contact</span>
									</span>
									<span class="sm-card__cta-arrow" aria-hidden="true">&rarr;</span>
								</a>
								<div class="sm-share-pop">
									<button type="button" class="sm-share-btn" data-share-trigger aria-label="Share listing" title="Share listing">
										<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
									</button>
									<div class="sm-share-menu" hidden>
										<?php
										$card_wa_msg = sprintf(
											'Good day, I have got details about your products from Al Qaryan Scrap Market (www.alqaryangroup.com/scrap-market). I am interested in this material: %s (%s, %s). Is this offer still available? %s',
											get_the_title(),
											sm_quantity_label( $post_id ),
											sm_price_label( $post_id ),
											get_permalink()
										);
										$card_em_subj = 'Enquiry about ' . get_the_title() . ' — Al Qaryan Scrap Market';
										$card_em_body = sprintf(
											"Good day,\n\nI have got details about your products from Al Qaryan Scrap Market (www.alqaryangroup.com/scrap-market).\n\nI am interested in this material: %s (%s, %s).\nIs this offer still available?\n\nListing link: %s",
											get_the_title(),
											sm_quantity_label( $post_id ),
											sm_price_label( $post_id ),
											get_permalink()
										);
										?>
										<a class="sm-share-item sm-share-item--wa" target="_blank" rel="noopener"
											href="https://wa.me/?text=<?php echo rawurlencode( $card_wa_msg ); ?>">
											<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="color:#25d366;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
											<span>Share by WhatsApp</span>
										</a>
										<a class="sm-share-item sm-share-item--gmail"
											href="mailto:?subject=<?php echo rawurlencode( $card_em_subj ); ?>&body=<?php echo rawurlencode( $card_em_body ); ?>">
											<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="color:#ea4335;"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
											<span>Share by Gmail / Email</span>
										</a>
										<button type="button" class="sm-share-item sm-share-item--copy" data-copy="<?php echo esc_url( get_permalink() ); ?>">
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
											<span>Copy Link</span>
										</button>
										<a class="sm-share-item sm-share-item--fb" target="_blank" rel="noopener"
											href="https://www.facebook.com/sharer/sharer.php?u=<?php echo rawurlencode( get_permalink() ); ?>">
											<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="color:#1877f2;"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
											<span>Share on Facebook</span>
										</a>
										<?php
										$card_fb_id = get_post_meta( $post_id, '_sm_fb_post_id', true );
										if ( ! empty( $card_fb_id ) ) :
											?>
											<div class="sm-share-item sm-share-item--done" style="color:#15803d;cursor:default;">
												<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="color:#15803d;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
												<span>On FB Page</span>
											</div>
										<?php else : ?>
											<button type="button" class="sm-share-item sm-share-item--fb-send"
												data-sm-send-fb="<?php echo esc_attr( $post_id ); ?>"
												data-nonce="<?php echo esc_attr( wp_create_nonce( 'sm_send_fb_' . $post_id ) ); ?>">
												<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="color:#1877f2;"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
												<span>Send to FB Page</span>
											</button>
										<?php endif; ?>
									</div>
								</div>
							</div>
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
