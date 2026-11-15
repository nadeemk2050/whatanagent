<?php
/**
 * The 300 KB image pipeline.
 *
 * Every photo a seller uploads is re-encoded before WordPress ever stores it:
 *   - auto-oriented from EXIF, then EXIF stripped (phone photos carry GPS)
 *   - longest edge capped at 1600 px, never upscaled
 *   - WebP, with a BINARY SEARCH on quality to find the highest quality that
 *     still lands under 300 KB, instead of guessing one fixed number
 *   - if even quality 40 is too big, the image is downscaled and searched again
 *
 * The result is the best-looking file that fits, not the smallest file possible.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Which engine can this host use? Cached per request, refreshable by the settings screen.
 *
 * @param bool $refresh Force a fresh probe.
 * @return array{engine:string,webp:bool}
 */
function sm_optimiser_probe( $refresh = false ) {
	static $cache = null;

	if ( null !== $cache && ! $refresh ) {
		return $cache;
	}

	$engine = 'none';
	$webp   = false;

	if ( extension_loaded( 'imagick' ) && class_exists( 'Imagick' ) ) {
		$engine = 'imagick';
		try {
			$formats = \Imagick::queryFormats( 'WEBP' );
			$webp    = ! empty( $formats );
		} catch ( Exception $e ) {
			$webp = false;
		}
	} elseif ( extension_loaded( 'gd' ) && function_exists( 'imagewebp' ) ) {
		$engine = 'gd';
		$webp   = true;
		if ( function_exists( 'gd_info' ) ) {
			$info = gd_info();
			$webp = ! empty( $info['WebP Support'] );
		}
	}

	$cache = array(
		'engine' => $engine,
		'webp'   => $webp,
	);

	return $cache;
}

/**
 * Highest quality whose output still fits in $max_bytes.
 *
 * @param callable $encode  Receives a quality int, returns string bytes or null.
 * @param int      $max_bytes Ceiling in bytes.
 * @return array{data:?string,quality:?int}
 */
function sm_binary_search( $encode, $max_bytes ) {
	$lo   = 35;
	$hi   = 95;
	$best = null;
	$best_quality = null;

	while ( $lo <= $hi ) {
		$quality = intdiv( $lo + $hi, 2 );
		$data    = call_user_func( $encode, $quality );

		if ( null === $data || '' === $data ) {
			break;
		}

		if ( strlen( $data ) <= $max_bytes ) {
			$best         = $data;
			$best_quality = $quality;
			$lo           = $quality + 1;
		} else {
			$hi = $quality - 1;
		}
	}

	return array(
		'data'    => $best,
		'quality' => $best_quality,
	);
}

/**
 * Scale an Imagick image so its longest edge is at most $edge.
 *
 * @param \Imagick $im   Image.
 * @param int      $edge Longest edge.
 */
function sm_imagick_fit( $im, $edge ) {
	$w = $im->getImageWidth();
	$h = $im->getImageHeight();
	$longest = max( $w, $h );

	if ( $longest <= $edge ) {
		return;
	}

	$ratio = $edge / $longest;
	$im->resizeImage( (int) round( $w * $ratio ), (int) round( $h * $ratio ), \Imagick::FILTER_LANCZOS, 1, true );
}

/**
 * @param string $path      Source file.
 * @param int    $max_bytes Byte ceiling.
 * @param int    $max_edge  Longest edge.
 * @param string $format    'webp' or 'jpeg'.
 * @return array<string,mixed>|WP_Error
 */
function sm_shrink_imagick( $path, $max_bytes, $max_edge, $format ) {
	$scales = array( 1.0, 0.85, 0.72, 0.6, 0.5, 0.4 );
	$blob   = null;
	$quality = null;
	$edge_used = $max_edge;

	foreach ( $scales as $scale ) {
		try {
			$im = new \Imagick( $path );
		} catch ( Exception $e ) {
			return new WP_Error( 'sm_imagick_open', $e->getMessage() );
		}

		try {
			if ( method_exists( $im, 'autoOrient' ) ) {
				$im->autoOrient();
			}
			$im->stripImage();

			$edge_used = max( 480, (int) round( $max_edge * $scale ) );
			sm_imagick_fit( $im, $edge_used );

			$im->setImageFormat( $format );
			if ( 'webp' === $format ) {
				$im->setOption( 'webp:method', '6' );
			}

			$found = sm_binary_search(
				function ( $q ) use ( $im ) {
					$im->setImageCompressionQuality( $q );
					try {
						return $im->getImageBlob();
					} catch ( Exception $e ) {
						return null;
					}
				},
				$max_bytes
			);

			if ( ! empty( $found['data'] ) ) {
				$blob    = $found['data'];
				$quality = $found['quality'];
				$im->clear();
				break;
			}

			$im->clear();
		} catch ( Exception $e ) {
			$im->clear();
			return new WP_Error( 'sm_imagick_process', $e->getMessage() );
		}
	}

	if ( null === $blob ) {
		return new WP_Error( 'sm_imagick_ceiling', 'Could not reach the byte ceiling even at the smallest scale.' );
	}

	return sm_write_shrunk( $path, $blob, $format, $quality, 'imagick' );
}

/**
 * Read EXIF orientation and turn the GD resource upright.
 *
 * @param resource|\GdImage $im   Image.
 * @param string            $path Source file.
 * @return resource|\GdImage
 */
function sm_gd_orient( $im, $path ) {
	if ( ! function_exists( 'exif_read_data' ) ) {
		return $im;
	}

	$exif = @exif_read_data( $path );
	if ( empty( $exif['Orientation'] ) ) {
		return $im;
	}

	$orientation = (int) $exif['Orientation'];
	$angle       = 0;

	if ( 3 === $orientation ) {
		$angle = 180;
	} elseif ( 6 === $orientation ) {
		$angle = -90;
	} elseif ( 8 === $orientation ) {
		$angle = 90;
	}

	if ( 0 !== $angle && function_exists( 'imagerotate' ) ) {
		$rotated = imagerotate( $im, $angle, 0 );
		if ( $rotated ) {
			imagedestroy( $im );
			$im = $rotated;
		}
	}

	if ( in_array( $orientation, array( 2, 5, 7 ), true ) && function_exists( 'imageflip' ) ) {
		imageflip( $im, IMG_FLIP_HORIZONTAL );
	}

	return $im;
}

/**
 * @param string $path      Source file.
 * @param int    $max_bytes Byte ceiling.
 * @param int    $max_edge  Longest edge.
 * @param string $format    'webp' or 'jpeg'.
 * @return array<string,mixed>|WP_Error
 */
function sm_shrink_gd( $path, $max_bytes, $max_edge, $format ) {
	$raw = @file_get_contents( $path );
	if ( false === $raw ) {
		return new WP_Error( 'sm_gd_read', 'Could not read the uploaded file.' );
	}

	$source = @imagecreatefromstring( $raw );
	if ( ! $source ) {
		return new WP_Error( 'sm_gd_decode', 'Could not decode the image.' );
	}

	$source = sm_gd_orient( $source, $path );
	unset( $raw );

	$src_w = imagesx( $source );
	$src_h = imagesy( $source );

	$scales    = array( 1.0, 0.85, 0.72, 0.6, 0.5, 0.4 );
	$blob      = null;
	$quality   = null;

	foreach ( $scales as $scale ) {
		$edge    = max( 480, (int) round( $max_edge * $scale ) );
		$longest = max( $src_w, $src_h );
		$target_edge = min( $longest, $edge );
		$ratio   = $target_edge / $longest;

		$canvas_w = max( 1, (int) round( $src_w * $ratio ) );
		$canvas_h = max( 1, (int) round( $src_h * $ratio ) );

		$canvas = ( $canvas_w === $src_w && $canvas_h === $src_h )
			? $source
			: imagescale( $source, $canvas_w, $canvas_h, IMG_BICUBIC );

		if ( ! $canvas ) {
			continue;
		}

		$found = sm_binary_search(
			function ( $q ) use ( $canvas, $format ) {
				ob_start();
				if ( 'webp' === $format ) {
					imagewebp( $canvas, null, $q );
				} else {
					imagejpeg( $canvas, null, $q );
				}
				$data = ob_get_clean();

				return ( is_string( $data ) && '' !== $data ) ? $data : null;
			},
			$max_bytes
		);

		if ( $canvas !== $source ) {
			imagedestroy( $canvas );
		}

		if ( ! empty( $found['data'] ) ) {
			$blob    = $found['data'];
			$quality = $found['quality'];
			break;
		}
	}

	imagedestroy( $source );

	if ( null === $blob ) {
		return new WP_Error( 'sm_gd_ceiling', 'Could not reach the byte ceiling even at the smallest scale.' );
	}

	return sm_write_shrunk( $path, $blob, $format, $quality, 'gd' );
}

/**
 * Write the new bytes next to the original, retire the original, report what happened.
 *
 * @param string   $path    Original path.
 * @param string   $blob    Encoded bytes.
 * @param string   $format  'webp' or 'jpeg'.
 * @param int|null $quality Chosen quality.
 * @param string   $engine  Engine name.
 * @return array<string,mixed>|WP_Error
 */
function sm_write_shrunk( $path, $blob, $format, $quality, $engine ) {
	$dir  = dirname( $path );
	$base = pathinfo( $path, PATHINFO_FILENAME );
	$ext  = ( 'webp' === $format ) ? 'webp' : 'jpg';
	$new  = trailingslashit( $dir ) . $base . '.' . $ext;

	$bytes_before = is_file( $path ) ? (int) filesize( $path ) : 0;

	if ( false === file_put_contents( $new, $blob ) ) {
		return new WP_Error( 'sm_write', 'Could not write the optimised file.' );
	}

	if ( $new !== $path && is_file( $path ) ) {
		@unlink( $path );
	}

	$bytes_after = (int) filesize( $new );

	update_option(
		'sm_last_compress',
		array(
			'file'         => basename( $new ),
			'bytes_before' => $bytes_before,
			'bytes_after'  => $bytes_after,
			'quality'      => $quality,
			'engine'       => $engine,
			'at'           => time(),
		),
		false
	);

	return array(
		'file'    => $new,
		'bytes'   => $bytes_after,
		'quality' => $quality,
		'engine'  => $engine,
		'changed' => true,
	);
}

/**
 * Public entry point.
 *
 * @param string $path      Source file.
 * @param int    $max_bytes Byte ceiling.
 * @param int    $max_edge  Longest edge.
 * @return array<string,mixed>|WP_Error
 */
function sm_shrink_image( $path, $max_bytes = SM_MAX_BYTES, $max_edge = SM_MAX_EDGE ) {
	if ( ! is_readable( $path ) ) {
		return new WP_Error( 'sm_unreadable', 'File is not readable.' );
	}

	$probe = sm_optimiser_probe();
	if ( 'none' === $probe['engine'] ) {
		return new WP_Error( 'sm_no_engine', 'Neither Imagick nor GD is available on this host.' );
	}

	$info = @getimagesize( $path );
	if ( ! $info || empty( $info['mime'] ) ) {
		return new WP_Error( 'sm_not_image', 'Not a readable image.' );
	}

	$mime = (string) $info['mime'];
	$size = (int) filesize( $path );

	// Never flatten an animation.
	if ( 'image/gif' === $mime ) {
		return new WP_Error( 'sm_gif', 'GIF left untouched.' );
	}

	// Already small and already WebP: do not throw quality away for nothing.
	if ( $size <= $max_bytes && 'image/webp' === $mime ) {
		return array(
			'file'    => $path,
			'bytes'   => $size,
			'quality' => null,
			'engine'  => 'none',
			'changed' => false,
		);
	}

	$format = $probe['webp'] ? 'webp' : 'jpeg';

	if ( 'imagick' === $probe['engine'] ) {
		return sm_shrink_imagick( $path, $max_bytes, $max_edge, $format );
	}

	return sm_shrink_gd( $path, $max_bytes, $max_edge, $format );
}

/**
 * Compress on the way in, before the attachment row exists.
 *
 * @param array<string,string> $upload  Upload array with file/url/type.
 * @param string               $context Upload context.
 * @return array<string,string>
 */
function sm_handle_upload( $upload, $context = 'upload' ) {
	if ( empty( $upload['file'] ) || empty( $upload['type'] ) ) {
		return $upload;
	}

	$allowed = array( 'image/jpeg', 'image/png', 'image/webp' );
	if ( ! in_array( $upload['type'], $allowed, true ) ) {
		return $upload;
	}

	$result = sm_shrink_image( $upload['file'] );
	if ( is_wp_error( $result ) || empty( $result['changed'] ) ) {
		return $upload;
	}

	$ext = strtolower( (string) pathinfo( $result['file'], PATHINFO_EXTENSION ) );

	$upload['file'] = $result['file'];
	$upload['type'] = ( 'webp' === $ext ) ? 'image/webp' : 'image/jpeg';
	$upload['url']  = preg_replace( '/\.[a-z0-9]{2,5}$/i', '', (string) $upload['url'] ) . '.' . $ext;

	return $upload;
}
add_filter( 'wp_handle_upload', 'sm_handle_upload', 10, 2 );

/**
 * Stop WordPress building a 2560 px copy nobody will ever download.
 *
 * @return int
 */
function sm_big_image_threshold() {
	return SM_MAX_EDGE;
}
add_filter( 'big_image_size_threshold', 'sm_big_image_threshold' );

/**
 * Make WordPress' own resized versions WebP too, when the host can encode it.
 *
 * @param array<string,string> $formats Mime => format map.
 * @return array<string,string>
 */
function sm_image_editor_output_format( $formats ) {
	$probe = sm_optimiser_probe();
	if ( $probe['webp'] ) {
		$formats['image/jpeg'] = 'image/webp';
		$formats['image/png']  = 'image/webp';
	}

	return $formats;
}
add_filter( 'image_editor_output_format', 'sm_image_editor_output_format' );

/**
 * A 640x480 card crop for archive tiles.
 */
add_action( 'after_setup_theme', function () {
	add_image_size( 'sm-card', 640, 480, true );
} );

/**
 * Show the stored size of the main photo on the listing screen, so the 300 KB
 * promise is visible rather than assumed.
 */
add_action( 'add_meta_boxes', function () {
	add_meta_box( 'sm_media_info', 'Photo check', 'sm_render_media_info', 'scrap_listing', 'side', 'default' );
} );

/**
 * @param WP_Post $post Current post.
 */
function sm_render_media_info( $post ) {
	$thumb_id = get_post_thumbnail_id( $post->ID );

	if ( ! $thumb_id ) {
		echo '<p>No main photo yet. Set one under <strong>Main photo</strong>.</p>';
		return;
	}

	$path = get_attached_file( $thumb_id );

	if ( ! $path || ! is_file( $path ) ) {
		echo '<p>Photo file is missing from disk.</p>';
		return;
	}

	$bytes = (int) filesize( $path );
	$mime  = (string) get_post_mime_type( $thumb_id );
	$over  = $bytes > SM_MAX_BYTES;

	printf(
		'<p><strong>%s</strong> &middot; %s</p><p>%s</p>',
		esc_html( size_format( $bytes ) ),
		esc_html( $mime ),
		$over
			? '<span style="color:#b32d2e">Over the 300 KB ceiling — re-upload this photo.</span>'
			: '<span style="color:#0b6e4f">Within the 300 KB ceiling.</span>'
	);
}
