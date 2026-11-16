<?php
/**
 * One listing: /scrap-market/{slug}/
 *
 * The WhatsApp button carries the listing title, the price and the URL into the first
 * message, so the seller knows which lot is being asked about without a round trip. The
 * enquiry form posts to the same lead endpoint the contact page uses, so a market enquiry
 * lands in the same place as every other one.
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
	$kind     = sm_listing_kind( $post_id );
	$kinds    = sm_kinds();
	$settings  = sm_settings();
	$raw_phone = sm_get( $post_id, 'whatsapp', $settings['seller_phone'] );
	$digits    = preg_replace( '/[^0-9]/', '', (string) $raw_phone );
	$phone     = preg_replace( '/^00/', '', (string) $digits );
	if ( preg_match( '/^0(5[0-9]{8})$/', $phone, $m ) ) {
		$phone = '971' . $m[1];
	}
	$seller   = sm_get( $post_id, 'seller', $settings['seller_name'] );
	$company  = sm_get( $post_id, 'company' );
	$email    = sm_get( $post_id, 'email' );
	$archive  = sm_archive_url();
	$mterms   = wp_get_post_terms( $post_id, 'scrap_material' );
	$material = ( ! is_wp_error( $mterms ) && ! empty( $mterms[0] ) ) ? $mterms[0] : null;

	$permalink = get_permalink();
	$quantity  = sm_quantity_label( $post_id );

	$wa_text = sprintf(
		'Hello, I am interested in your Scrap Market listing: %s — %s%s. %s',
		get_the_title(),
		( '—' !== $quantity ) ? $quantity : 'lot',
		( '—' !== $price ) ? ', ' . $price : '',
		$permalink
	);

	$gallery = array();
	$stored  = sm_get( $post_id, 'gallery' );
	if ( '' !== $stored ) {
		$gallery = array_filter( array_map( 'absint', explode( ',', $stored ) ) );
	}
	if ( ! $gallery && has_post_thumbnail() ) {
		$gallery = array( (int) get_post_thumbnail_id( $post_id ) );
	}

	$facts = array(
		'Material'  => $material ? $material->name : '',
		'Grade'     => sm_get( $post_id, 'grade' ),
		'Form'      => sm_get( $post_id, 'form' ),
		'Quantity'  => ( '—' !== $quantity ) ? $quantity : '',
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

		<?php if ( isset( $_GET['sm_msg'] ) && 'reported' === sanitize_key( wp_unslash( $_GET['sm_msg'] ) ) ) : ?>
			<div class="sm-alert sm-alert--ok">Thank you — this listing has been flagged for review.</div>
		<?php endif; ?>

		<div class="sm-single__grid">

			<div class="sm-single__main">

				<p class="sm-single__kind sm-single__kind--<?php echo esc_attr( $kind ); ?>">
					<?php echo esc_html( $kinds[ $kind ]['label'] ); ?>
					<?php if ( 'available' !== $status ) : ?>
						<span class="sm-badge sm-badge--<?php echo esc_attr( $status ); ?>"><?php echo esc_html( ucfirst( $status ) ); ?></span>
					<?php endif; ?>
					<?php if ( $expired ) : ?>
						<span class="sm-badge sm-badge--expired">Expired</span>
					<?php endif; ?>
				</p>

				<h1><?php the_title(); ?></h1>

				<?php if ( $gallery ) : ?>
					<div class="sm-gallery" data-gallery>
						<div class="sm-gallery__stage">
							<?php
							echo wp_get_attachment_image(
								$gallery[0],
								'large',
								false,
								array(
									'class' => 'sm-gallery__main',
									'data-gallery-main' => '1',
									'alt'   => get_the_title(),
								)
							);
							?>
						</div>
						<?php if ( count( $gallery ) > 1 ) : ?>
							<div class="sm-gallery__thumbs">
								<?php foreach ( $gallery as $index => $attachment_id ) : ?>
									<button type="button" class="sm-gallery__thumb<?php echo 0 === $index ? ' is-active' : ''; ?>"
										data-gallery-thumb="<?php echo esc_url( (string) wp_get_attachment_image_url( $attachment_id, 'large' ) ); ?>"
										aria-label="<?php echo esc_attr( sprintf( 'Photo %d', $index + 1 ) ); ?>">
										<?php echo wp_get_attachment_image( $attachment_id, 'thumbnail', false, array( 'alt' => '' ) ); ?>
									</button>
								<?php endforeach; ?>
							</div>
						<?php endif; ?>
					</div>
				<?php endif; ?>

				<div class="sm-pricebar">
					<div>
						<span class="sm-pricebar__label"><?php echo 'buy' === $kind ? 'Budget' : 'Price'; ?></span>
						<span class="sm-pricebar__value"><?php echo esc_html( '—' === $price ? 'On request' : $price ); ?></span>
					</div>
					<div class="sm-pricebar__cta">
						<a class="sm-btn sm-btn--wa" href="https://wa.me/<?php echo esc_attr( $phone ); ?>?text=<?php echo rawurlencode( $wa_text ); ?>"
							target="_blank" rel="noopener">💬 WhatsApp the seller</a>
						<a class="sm-btn sm-btn--ghost" href="#enquiry">Send a message</a>
					</div>
				</div>

				<div class="sm-prose">
					<?php the_content(); ?>
				</div>

				<?php
				$rows = array_filter( $facts, function ( $value ) {
					return '' !== (string) $value;
				} );
				?>
				<?php if ( $rows ) : ?>
					<h2 class="sm-h2">Lot details</h2>
					<table class="sm-facts">
						<tbody>
							<?php foreach ( $rows as $label => $value ) : ?>
								<tr><th scope="row"><?php echo esc_html( $label ); ?></th><td><?php echo esc_html( (string) $value ); ?></td></tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>

				<div class="sm-share">
					<span class="sm-muted">Share this lot:</span>
					<a class="sm-share__btn" target="_blank" rel="noopener"
						href="https://wa.me/?text=<?php echo rawurlencode( get_the_title() . ' — ' . $permalink ); ?>">WhatsApp</a>
					<button type="button" class="sm-share__btn" data-copy="<?php echo esc_url( $permalink ); ?>">Copy link</button>
					<a class="sm-share__btn" href="mailto:?subject=<?php echo rawurlencode( get_the_title() ); ?>&body=<?php echo rawurlencode( $permalink ); ?>">Email</a>
				</div>

				<div class="sm-safety">
					<h2 class="sm-h2">Before you transfer money</h2>
					<ul>
						<li>Ask for a photo or video of the actual lot, with something in frame for scale.</li>
						<li>Agree the grade, the moisture and the contamination limits in writing before loading.</li>
						<li>Inspect or use a third-party survey on the first deal with a new counterparty.</li>
						<li>Lots on this market are posted by the trade. Al Qaryan Industries does not broker, guarantee or take a commission on them.</li>
					</ul>
					<p class="sm-muted">
						Something wrong with this listing?
						<a href="<?php echo esc_url( sm_report_link( $post_id ) ); ?>">Report it</a> and it goes to the review queue.
					</p>
				</div>

				<?php sm_render_manage( $post_id ); ?>

			</div>

			<aside class="sm-single__side">

				<div class="sm-panel">
					<h2 class="sm-panel__title"><?php echo 'buy' === $kind ? 'Posted by a buyer' : 'Posted by the seller'; ?></h2>
					<p class="sm-panel__seller"><?php echo esc_html( $seller ); ?></p>
					<?php if ( $company ) : ?>
						<p class="sm-muted"><?php echo esc_html( $company ); ?></p>
					<?php endif; ?>
					<?php if ( $phone ) : ?>
						<p><a class="sm-btn sm-btn--wa" href="https://wa.me/<?php echo esc_attr( $phone ); ?>?text=<?php echo rawurlencode( $wa_text ); ?>" target="_blank" rel="noopener">💬 WhatsApp</a></p>
						<p><a class="sm-link" href="tel:+<?php echo esc_attr( ltrim( $phone, '+' ) ); ?>">Call +<?php echo esc_html( ltrim( $phone, '+' ) ); ?></a></p>
					<?php endif; ?>
					<?php if ( $email ) : ?>
						<p><a class="sm-link" href="mailto:<?php echo esc_attr( $email ); ?>"><?php echo esc_html( $email ); ?></a></p>
					<?php endif; ?>
					<p class="sm-muted">Posted <?php echo esc_html( human_time_diff( (int) get_post_time( 'U', true, $post_id ) ) ); ?> ago</p>
				</div>

				<div class="sm-panel" id="enquiry">
					<h2 class="sm-panel__title">Send a message</h2>
					<p class="sm-muted">Goes to Al Qaryan Industries, who pass it to the seller.</p>
					<form class="sm-form sm-form--compact" id="sm-enquiry" novalidate>
						<label class="sm-field"><span>Your name</span><input type="text" name="name" required></label>
						<label class="sm-field"><span>Phone / WhatsApp</span><input type="text" name="phone" inputmode="tel"></label>
						<label class="sm-field"><span>Email</span><input type="email" name="email"></label>
						<label class="sm-field"><span>Message</span><textarea name="message" rows="3">Is this lot still available? Please confirm the quantity and the price.</textarea></label>
						<input type="hidden" name="material" value="<?php echo esc_attr( ( $material ? $material->name : '' ) . ' — ' . get_the_title() ); ?>">
						<input type="hidden" name="quantity" value="<?php echo esc_attr( '—' !== $quantity ? $quantity : '' ); ?>">
						<input type="hidden" name="_hp" value="">
						<button class="sm-btn sm-btn--primary" type="submit">Send enquiry</button>
						<p class="sm-form__msg" id="sm-enquiry-msg" role="status"></p>
					</form>
				</div>

			</aside>
		</div>

		<?php
		$related = new WP_Query(
			array(
				'post_type'      => 'scrap_listing',
				'post_status'    => 'publish',
				'posts_per_page' => 3,
				'post__not_in'   => array( $post_id ),
				'no_found_rows'  => true,
				'tax_query'      => $material ? array(
					array(
						'taxonomy' => 'scrap_material',
						'field'    => 'term_id',
						'terms'    => $material->term_id,
					),
				) : array(),
			)
		);
		?>
		<?php if ( $related->have_posts() ) : ?>
			<section class="sm-related">
				<h2 class="sm-h2">More <?php echo esc_html( $material ? $material->name : 'lots' ); ?></h2>
				<div class="sm-grid">
					<?php
					while ( $related->have_posts() ) :
						$related->the_post();
						$rid    = get_the_ID();
						$rkind  = sm_listing_kind( $rid );
						?>
						<article class="sm-card sm-card--<?php echo esc_attr( $rkind ); ?>">
							<a class="sm-card__media" href="<?php the_permalink(); ?>">
								<?php if ( has_post_thumbnail() ) : ?>
									<?php the_post_thumbnail( 'sm-card', array( 'loading' => 'lazy', 'alt' => get_the_title() ) ); ?>
								<?php else : ?>
									<span class="sm-card__placeholder" aria-hidden="true">No photo yet</span>
								<?php endif; ?>
								<span class="sm-badge sm-badge--kind sm-badge--<?php echo esc_attr( $rkind ); ?>"><?php echo esc_html( $kinds[ $rkind ]['label'] ); ?></span>
							</a>
							<div class="sm-card__body">
								<h3 class="sm-card__title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
								<p class="sm-card__price"><?php echo esc_html( sm_price_label( $rid ) ); ?></p>
							</div>
						</article>
					<?php endwhile; ?>
				</div>
			</section>
			<?php wp_reset_postdata(); ?>
		<?php endif; ?>

	</div>

	<script>
	( function () {
		var form = document.getElementById( 'sm-enquiry' );
		if ( form ) {
			var msg = document.getElementById( 'sm-enquiry-msg' );
			form.addEventListener( 'submit', function ( event ) {
				event.preventDefault();
				var data = {};
				new FormData( form ).forEach( function ( value, key ) { data[ key ] = value; } );
				if ( ! data.name || ( ! data.phone && ! data.email ) ) {
					msg.className = 'sm-form__msg is-error';
					msg.textContent = 'Please add your name and a phone number or email.';
					return;
				}
				data.source = 'scrap-market';
				data.page = <?php echo wp_json_encode( $permalink ); ?>;
				msg.className = 'sm-form__msg';
				msg.textContent = 'Sending…';
				fetch( 'https://whatanagent.duckdns.org/api/lead', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify( data )
				} ).then( function ( response ) {
					return response.json().then( function ( json ) { return { ok: response.ok && json.ok, json: json }; } );
				} ).then( function ( result ) {
					if ( result.ok ) {
						form.reset();
						msg.className = 'sm-form__msg is-ok';
						msg.textContent = 'Thank you — we reply within one working day.';
					} else {
						msg.className = 'sm-form__msg is-error';
						msg.textContent = ( result.json && result.json.error ) || 'Could not send. Please use WhatsApp.';
					}
				} ).catch( function () {
					msg.className = 'sm-form__msg is-error';
					msg.textContent = 'Network error. Please use WhatsApp.';
				} );
			} );
		}
	}() );
	</script>

<?php
endwhile;
get_footer();
