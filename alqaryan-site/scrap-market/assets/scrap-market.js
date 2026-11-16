/**
 * Scrap Market — small progressive enhancements. No framework, no build step.
 *
 * Everything here is optional: the market, the filters and the forms all work with
 * JavaScript switched off. This file only adds the gallery switcher, the copy-link
 * button and the favourites list (kept in localStorage, so no accounts are needed).
 */
( function () {
	'use strict';

	/* ------------------------------------------------------------- gallery */
	document.querySelectorAll( '[data-gallery]' ).forEach( function ( gallery ) {
		var main = gallery.querySelector( '[data-gallery-main]' );
		gallery.querySelectorAll( '[data-gallery-thumb]' ).forEach( function ( thumb ) {
			thumb.addEventListener( 'click', function () {
				if ( ! main ) {
					return;
				}
				gallery.querySelectorAll( '[data-gallery-thumb]' ).forEach( function ( other ) {
					other.classList.remove( 'is-active' );
				} );
				thumb.classList.add( 'is-active' );
				main.src = thumb.getAttribute( 'data-gallery-thumb' );
				main.removeAttribute( 'srcset' );
			} );
		} );
	} );

	/* ----------------------------------------------------------- copy link */
	document.querySelectorAll( '[data-copy]' ).forEach( function ( button ) {
		button.addEventListener( 'click', function () {
			var value = button.getAttribute( 'data-copy' );
			var done = function () {
				var label = button.textContent;
				button.textContent = 'Copied';
				window.setTimeout( function () { button.textContent = label; }, 1600 );
			};
			if ( navigator.clipboard && navigator.clipboard.writeText ) {
				navigator.clipboard.writeText( value ).then( done, function () {} );
			}
		} );
	} );

	document.querySelectorAll( '[data-rail]' ).forEach( function ( rail ) {
		var head = rail.parentNode.querySelector( '.sm-rail-head' );
		var prev = head ? head.querySelector( '[data-rail-prev]' ) : null;
		var next = head ? head.querySelector( '[data-rail-next]' ) : null;

		function step() {
			var card = rail.querySelector( '.sm-card' );
			return card ? card.getBoundingClientRect().width + 13 : rail.clientWidth * 0.8;
		}
		if ( prev ) {
			prev.addEventListener( 'click', function () { rail.scrollBy( { left: -step(), behavior: 'smooth' } ); } );
		}
		if ( next ) {
			next.addEventListener( 'click', function () { rail.scrollBy( { left: step(), behavior: 'smooth' } ); } );
		}
		rail.addEventListener( 'keydown', function ( event ) {
			if ( event.key === 'ArrowRight' ) { rail.scrollBy( { left: step(), behavior: 'smooth' } ); event.preventDefault(); }
			if ( event.key === 'ArrowLeft' ) { rail.scrollBy( { left: -step(), behavior: 'smooth' } ); event.preventDefault(); }
		} );
	} );

	/* filters start open on a wide screen, folded on a phone */
	document.querySelectorAll( '[data-filters]' ).forEach( function ( details ) {
		if ( window.matchMedia( '(min-width: 861px)' ).matches && ! details.hasAttribute( 'data-touched' ) ) {
			details.open = true;
		}
		details.addEventListener( 'toggle', function () { details.setAttribute( 'data-touched', '1' ); } );
	} );

	/* --------------------------------------------------------- favourites */
	var KEY = 'sm-favourites';

	function read() {
		try {
			var raw = window.localStorage.getItem( KEY );
			return raw ? JSON.parse( raw ) : [];
		} catch ( error ) {
			return [];
		}
	}

	function write( list ) {
		try {
			window.localStorage.setItem( KEY, JSON.stringify( list.slice( 0, 100 ) ) );
		} catch ( error ) {
			/* storage disabled — the button simply does nothing */
		}
	}

	function paint( button ) {
		var url = button.getAttribute( 'data-favourite' );
		var saved = read().indexOf( url ) > -1;
		button.classList.toggle( 'is-saved', saved );
		button.setAttribute( 'aria-pressed', saved ? 'true' : 'false' );
		button.textContent = saved ? '★ Saved' : '☆ Save';
	}

	document.querySelectorAll( '[data-favourite]' ).forEach( function ( button ) {
		paint( button );
		button.addEventListener( 'click', function () {
			var url = button.getAttribute( 'data-favourite' );
			var list = read();
			var at = list.indexOf( url );
			if ( at > -1 ) {
				list.splice( at, 1 );
			} else {
				list.push( url );
			}
			write( list );
			paint( button );
		} );
	} );

	/* ------------------------------------------------- confirm destructive */
	document.querySelectorAll( 'form[data-confirm]' ).forEach( function ( form ) {
		form.addEventListener( 'submit', function ( event ) {
			if ( ! window.confirm( form.getAttribute( 'data-confirm' ) ) ) {
				event.preventDefault();
			}
		} );
	} );

	/* ------------------------------------------- post a form without a reload
	 * A rejected submission used to come back as an empty page. Sending it with
	 * fetch keeps every field exactly as it was typed.
	 */
	document.querySelectorAll( '[data-sm-form]' ).forEach( function ( form ) {
		var out = form.querySelector( '[data-form-msg]' );
		var submit = form.querySelector( 'button[type=submit]' );
		var idle = submit ? submit.textContent : '';

		function say( text, kind ) {
			if ( ! out ) {
				return;
			}
			out.className = 'sm-form__msg' + ( kind ? ' is-' + kind : '' );
			out.textContent = text || '';
		}

		function busy( on ) {
			if ( ! submit ) {
				return;
			}
			submit.disabled = on;
			submit.textContent = on ? 'Sending…' : idle;
		}

		form.addEventListener( 'submit', function ( event ) {
			if ( ! window.fetch || ! window.FormData || ! window.DataTransfer ) {
				return; /* no support — let the browser post it */
			}

			var phone = form.querySelector( '[name=sm_whatsapp]' );
			var email = form.querySelector( '[name=sm_email]' );

			if ( phone && email && ! phone.value.trim() && ! email.value.trim() ) {
				event.preventDefault();
				say( 'Add a WhatsApp number or an email so buyers can reach you.', 'error' );
				phone.focus();
				return;
			}

			event.preventDefault();

			var data = new FormData( form );
			data.set( 'sm_ajax', '1' );
			busy( true );
			say( 'Sending…' );

			window.fetch( form.getAttribute( 'action' ), {
				method: 'POST',
				body: data,
				credentials: 'same-origin'
			} ).then( function ( response ) {
				return response.json();
			} ).then( function ( json ) {
				if ( json && json.ok && json.redirect ) {
					window.location.href = json.redirect;
					return;
				}
				say( ( json && json.message ) || 'That did not go through. Please try again.', 'error' );
				busy( false );
			} ).catch( function () {
				say( 'Network error. Please try again.', 'error' );
				busy( false );
			} );
		} );
	} );

	/* ------------------------------------------------------------ cropper */
	function openCropper( file, done ) {
		if ( ! /^image\//.test( file.type ) ) {
			done( null );
			return;
		}

		var url = URL.createObjectURL( file );
		var layer = document.createElement( 'div' );
		layer.className = 'sm-crop';
		layer.innerHTML =
			'<div class="sm-crop__dialog" role="dialog" aria-modal="true" aria-label="Crop photo">' +
				'<div class="sm-crop__head"><b>Crop this photo</b>' +
					'<button type="button" class="sm-crop__x" data-crop-cancel aria-label="Close">×</button></div>' +
				'<div class="sm-crop__stage" data-crop-stage>' +
					'<img data-crop-img alt=""><span class="sm-crop__sel" data-crop-sel></span></div>' +
				'<div class="sm-crop__ratios">' +
					'<button type="button" data-crop-ratio="0" class="is-active">Free</button>' +
					'<button type="button" data-crop-ratio="1">1:1</button>' +
					'<button type="button" data-crop-ratio="1.3333">4:3</button>' +
					'<button type="button" data-crop-ratio="1.7778">16:9</button>' +
				'</div>' +
				'<div class="sm-crop__actions">' +
					'<button type="button" class="sm-btn sm-btn--ghost" data-crop-skip>Add as it is</button>' +
					'<button type="button" class="sm-btn sm-btn--primary" data-crop-apply>Crop and add</button>' +
				'</div>' +
			'</div>';

		document.body.appendChild( layer );
		document.documentElement.classList.add( 'sm-crop-open' );

		var img = layer.querySelector( '[data-crop-img]' );
		var sel = layer.querySelector( '[data-crop-sel]' );
		var ratio = 0;
		var box = { x: 0, y: 0, w: 0, h: 0 };
		var dragging = null;

		[ 'nw', 'ne', 'sw', 'se' ].forEach( function ( corner ) {
			var dot = document.createElement( 'span' );
			dot.className = 'sm-crop__handle sm-crop__handle--' + corner;
			dot.setAttribute( 'data-handle', corner );
			dot.addEventListener( 'pointerdown', function ( event ) {
				event.stopPropagation();
				start( event, corner );
			} );
			sel.appendChild( dot );
		} );

		function clamp() {
			var maxW = img.clientWidth;
			var maxH = img.clientHeight;

			box.w = Math.max( 40, Math.min( box.w, maxW ) );
			box.h = Math.max( 40, Math.min( box.h, maxH ) );

			if ( ratio ) {
				box.h = box.w / ratio;
				if ( box.h > maxH ) {
					box.h = maxH;
					box.w = box.h * ratio;
				}
			}

			box.x = Math.max( 0, Math.min( box.x, maxW - box.w ) );
			box.y = Math.max( 0, Math.min( box.y, maxH - box.h ) );

			sel.style.left = box.x + 'px';
			sel.style.top = box.y + 'px';
			sel.style.width = box.w + 'px';
			sel.style.height = box.h + 'px';
		}

		function start( event, mode ) {
			event.preventDefault();
			dragging = {
				mode: mode,
				sx: event.clientX,
				sy: event.clientY,
				from: { x: box.x, y: box.y, w: box.w, h: box.h }
			};
		}

		function move( event ) {
			if ( ! dragging ) {
				return;
			}

			var dx = event.clientX - dragging.sx;
			var dy = event.clientY - dragging.sy;

			if ( 'move' === dragging.mode ) {
				box.x = dragging.from.x + dx;
				box.y = dragging.from.y + dy;
			} else {
				if ( dragging.mode.indexOf( 'e' ) > -1 ) {
					box.w = dragging.from.w + dx;
				}
				if ( dragging.mode.indexOf( 's' ) > -1 ) {
					box.h = dragging.from.h + dy;
				}
				if ( dragging.mode.indexOf( 'w' ) > -1 ) {
					box.w = dragging.from.w - dx;
					box.x = dragging.from.x + dx;
				}
				if ( dragging.mode.indexOf( 'n' ) > -1 ) {
					box.h = dragging.from.h - dy;
					box.y = dragging.from.y + dy;
				}
			}

			clamp();
		}

		function stop() {
			dragging = null;
		}

		function close( result ) {
			document.removeEventListener( 'pointermove', move );
			document.removeEventListener( 'pointerup', stop );
			document.documentElement.classList.remove( 'sm-crop-open' );
			URL.revokeObjectURL( url );
			layer.remove();
			done( result );
		}

		document.addEventListener( 'pointermove', move );
		document.addEventListener( 'pointerup', stop );
		sel.addEventListener( 'pointerdown', function ( event ) {
			start( event, 'move' );
		} );

		img.addEventListener( 'load', function () {
			var w = img.clientWidth;
			var h = img.clientHeight;
			box = { x: w * 0.05, y: h * 0.05, w: w * 0.9, h: h * 0.9 };
			clamp();
		} );
		img.src = url;

		layer.querySelectorAll( '[data-crop-ratio]' ).forEach( function ( button ) {
			button.addEventListener( 'click', function () {
				layer.querySelectorAll( '[data-crop-ratio]' ).forEach( function ( other ) {
					other.classList.remove( 'is-active' );
				} );
				button.classList.add( 'is-active' );
				ratio = parseFloat( button.getAttribute( 'data-crop-ratio' ) ) || 0;
				if ( ratio ) {
					box.h = box.w / ratio;
				}
				clamp();
			} );
		} );

		layer.querySelector( '[data-crop-skip]' ).addEventListener( 'click', function () {
			close( file );
		} );
		layer.querySelector( '[data-crop-cancel]' ).addEventListener( 'click', function () {
			close( null );
		} );
		layer.querySelector( '[data-crop-apply]' ).addEventListener( 'click', function () {
			var scale = img.naturalWidth / img.clientWidth;
			var sw = Math.round( box.w * scale );
			var sh = Math.round( box.h * scale );
			var edge = Math.min( 1600, Math.max( sw, sh ) );
			var factor = edge / Math.max( sw, sh );
			var canvas = document.createElement( 'canvas' );

			canvas.width = Math.round( sw * factor );
			canvas.height = Math.round( sh * factor );
			canvas.getContext( '2d' ).drawImage(
				img,
				box.x * scale, box.y * scale, sw, sh,
				0, 0, canvas.width, canvas.height
			);

			canvas.toBlob( function ( blob ) {
				if ( ! blob ) {
					close( file );
					return;
				}
				var name = ( file.name || 'photo' ).replace( /\.[^.]+$/, '' ) + '.jpg';
				close( new File( [ blob ], name, { type: 'image/jpeg' } ) );
			}, 'image/jpeg', 0.86 );
		} );
	}

	/* ------------------------------------------------------- photo picker */
	document.querySelectorAll( '[data-photos]' ).forEach( function ( root ) {
		var pick = root.querySelector( '[data-photos-pick]' );
		var snap = root.querySelector( '[data-photos-snap]' );
		var input = root.querySelector( '[data-photos-add]' );
		var snapInput = root.querySelector( '[data-photos-snap-input]' );
		var grid = root.querySelector( '[data-photos-grid]' );
		var counter = root.querySelector( '[data-photos-count]' );
		var clearer = root.querySelector( '[data-photos-clear]' );
		var max = parseInt( root.getAttribute( 'data-max' ) || '5', 10 );
		var files = [];
		var urls = [];

		function kept() {
			var total = 0;
			root.querySelectorAll( '.sm-photos__existing li' ).forEach( function ( item ) {
				var box = item.querySelector( 'input[type=checkbox]' );
				if ( ! box || ! box.checked ) {
					total++;
				}
			} );
			return total;
		}

		function room() {
			return Math.max( 0, max - kept() - files.length );
		}

		function sync() {
			if ( ! window.DataTransfer ) {
				return;
			}
			var dt = new DataTransfer();
			files.forEach( function ( file ) {
				dt.items.add( file );
			} );
			input.files = dt.files;
		}

		function paint() {
			if ( counter ) {
				counter.textContent = ( kept() + files.length ) + ' / ' + max;
			}
			if ( clearer ) {
				clearer.hidden = files.length === 0;
			}

			urls.forEach( function ( url ) {
				URL.revokeObjectURL( url );
			} );
			urls = [];

			if ( ! grid ) {
				return;
			}

			grid.innerHTML = '';

			files.forEach( function ( file, index ) {
				var url = URL.createObjectURL( file );
				urls.push( url );

				var item = document.createElement( 'li' );
				var thumb = document.createElement( 'img' );
				var drop = document.createElement( 'button' );

				thumb.src = url;
				thumb.alt = '';
				drop.type = 'button';
				drop.className = 'sm-photos__drop';
				drop.setAttribute( 'aria-label', 'Remove this photo' );
				drop.textContent = '×';
				drop.addEventListener( 'click', function () {
					files.splice( index, 1 );
					sync();
					paint();
				} );

				item.appendChild( thumb );
				item.appendChild( drop );
				grid.appendChild( item );
			} );
		}

		function queue( list ) {
			var pending = Array.prototype.slice.call( list, 0, room() );
			var index = 0;

			function next() {
				if ( index >= pending.length ) {
					sync();
					paint();
					return;
				}
				openCropper( pending[ index++ ], function ( result ) {
					if ( result ) {
						files.push( result );
					}
					next();
				} );
			}

			next();
		}

		if ( pick && input ) {
			pick.addEventListener( 'click', function () {
				input.click();
			} );
		}
		if ( snap && snapInput ) {
			snap.addEventListener( 'click', function () {
				snapInput.click();
			} );
		}

		[ input, snapInput ].forEach( function ( element ) {
			if ( ! element ) {
				return;
			}
			element.addEventListener( 'change', function () {
				var chosen = Array.prototype.slice.call( element.files || [] );
				element.value = '';
				queue( chosen );
			} );
		} );

		if ( clearer ) {
			clearer.addEventListener( 'click', function () {
				files = [];
				sync();
				paint();
			} );
		}

		root.querySelectorAll( '.sm-photos__existing input[type=checkbox]' ).forEach( function ( box ) {
			box.addEventListener( 'change', paint );
		} );

		paint();
	} );
}() );
