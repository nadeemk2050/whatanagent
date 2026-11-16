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

	$built_in_msg = sprintf(
		'Good day, I have got details about your products from Al Qaryan Scrap Market (www.alqaryangroup.com/scrap-market). I am interested in this material: %s%s%s. Is this offer still available? %s',
		get_the_title(),
		( '—' !== $quantity ) ? ' (' . $quantity . ')' : '',
		( '—' !== $price ) ? ' at ' . $price : '',
		$permalink
	);
	$wa_text = $built_in_msg;

	$wa_share_text = sprintf(
		'Good day, I have got details about your products from Al Qaryan Scrap Market (www.alqaryangroup.com/scrap-market). I am interested in this material: %s. Is this offer still available? %s',
		get_the_title(),
		$permalink
	);

	$email_subject = 'Enquiry about ' . get_the_title() . ' — Al Qaryan Scrap Market';
	$email_body    = sprintf(
		"Good day,\n\nI have got details about your products from Al Qaryan Scrap Market (www.alqaryangroup.com/scrap-market).\n\nI am interested in this material: %s%s%s.\nIs this offer still available?\n\nListing details: %s",
		get_the_title(),
		( '—' !== $quantity ) ? ' (' . $quantity . ')' : '',
		( '—' !== $price ) ? ' at ' . $price : '',
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
							target="_blank" rel="noopener">
							<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
							<span>WhatsApp the seller</span>
						</a>
						<a class="sm-btn sm-btn--ghost sm-btn--gmail" href="#enquiry">
							<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
							<span>Send a message</span>
						</a>
						<?php
						$fb_post_id = get_post_meta( $post_id, '_sm_fb_post_id', true );
						if ( ! empty( $fb_post_id ) ) :
							?>
							<span class="sm-btn sm-btn--fb-done" title="Already posted to Facebook Page (ID: <?php echo esc_attr( $fb_post_id ); ?>)">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
								<span>On Facebook Page</span>
							</span>
						<?php else : ?>
							<button type="button" class="sm-btn sm-btn--fb-send"
								data-sm-send-fb="<?php echo esc_attr( $post_id ); ?>"
								data-nonce="<?php echo esc_attr( wp_create_nonce( 'sm_send_fb_' . $post_id ) ); ?>"
								title="Post directly to Al Qaryan Facebook Page (one-time only, prevents duplicates)">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
								<span>Send to Facebook Page</span>
							</button>
						<?php endif; ?>
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
					<a class="sm-share__btn sm-share__btn--wa" target="_blank" rel="noopener"
						href="https://wa.me/?text=<?php echo rawurlencode( $wa_share_text ); ?>" title="Share on WhatsApp">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
						<span>WhatsApp</span>
					</a>
					<a class="sm-share__btn sm-share__btn--gmail" href="mailto:?subject=<?php echo rawurlencode( $email_subject ); ?>&body=<?php echo rawurlencode( $email_body ); ?>" title="Share via Gmail / Email">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
						<span>Gmail</span>
					</a>
					<a class="sm-share__btn sm-share__btn--fb" target="_blank" rel="noopener"
						href="https://www.facebook.com/sharer/sharer.php?u=<?php echo rawurlencode( $permalink ); ?>" title="Share on Facebook">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
						<span>Facebook</span>
					</a>
					<button type="button" class="sm-share__btn sm-share__btn--copy" data-copy="<?php echo esc_url( $permalink ); ?>" title="Copy listing link">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
						<span>Copy link</span>
					</button>
					<?php if ( ! empty( $fb_post_id ) ) : ?>
						<span class="sm-share__btn sm-share__btn--fb-done" title="Already published on Facebook Page (duplicate prevention active)">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
							<span>On FB Page</span>
						</span>
					<?php else : ?>
						<button type="button" class="sm-share__btn sm-share__btn--fb-direct"
							data-sm-send-fb="<?php echo esc_attr( $post_id ); ?>"
							data-nonce="<?php echo esc_attr( wp_create_nonce( 'sm_send_fb_' . $post_id ) ); ?>"
							title="Directly send this post to Al Qaryan Facebook Page (one-time only, prevents duplicates)">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
							<span>Send to FB Page</span>
						</button>
					<?php endif; ?>
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
						<p><a class="sm-btn sm-btn--wa" href="https://wa.me/<?php echo esc_attr( $phone ); ?>?text=<?php echo rawurlencode( $wa_text ); ?>" target="_blank" rel="noopener">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
							<span>WhatsApp</span>
						</a></p>
						<p><a class="sm-link sm-link--phone" href="tel:+<?php echo esc_attr( ltrim( $phone, '+' ) ); ?>">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
							<span>Call +<?php echo esc_html( ltrim( $phone, '+' ) ); ?></span>
						</a></p>
					<?php endif; ?>
					<?php if ( $email ) : ?>
						<p><a class="sm-link sm-link--mail" href="mailto:<?php echo esc_attr( $email ); ?>?subject=<?php echo rawurlencode( $email_subject ); ?>&body=<?php echo rawurlencode( $email_body ); ?>">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="margin-right:4px;"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
							<span><?php echo esc_html( $email ); ?></span>
						</a></p>
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
						<label class="sm-field"><span>Message</span><textarea name="message" rows="3">Good day, I have got details about your products from Al Qaryan Scrap Market (www.alqaryangroup.com/scrap-market). I am interested in this material, is this offer still available?</textarea></label>
						<input type="hidden" name="material" value="<?php echo esc_attr( ( $material ? $material->name : '' ) . ' — ' . get_the_title() ); ?>">
						<input type="hidden" name="quantity" value="<?php echo esc_attr( '—' !== $quantity ? $quantity : '' ); ?>">
						<input type="hidden" name="_hp" value="">
						<button class="sm-btn sm-btn--primary" type="submit">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:5px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
							<span>Send enquiry</span>
						</button>
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
