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
}() );
