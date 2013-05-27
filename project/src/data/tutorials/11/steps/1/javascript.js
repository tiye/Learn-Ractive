var viewBoxes = {
	normal: { x: 0, y: 0, width: 819.18, height: 596.441 },
	neuron: { x: 0, y: 100, width: 560, height: 407.451 },
	axon: { x: 289, y: 195, width: 530, height: 385.623 },
	synapse: { x: 190, y: 0, width: 525, height: 381.985 }
};

var detail = {
	dendrites: '<strong>Dendrites</strong> conduct electrochemical stimulation from other neurons via synapses',
	
};

var ractive = new Ractive({
  el: output,
  template: template,
  data: {
    viewBox: viewBoxes.normal,
    hotspotsVisible: false,
    info: null,
    closeup: null,
    detail: detail.dendrites
  }
});

// after the view renders, fade in hotspots
setTimeout( function () {
	ractive.set( 'hotspotsVisible', true );
}, 1000 );



// add label backgrounds
var labelTexts = output.querySelectorAll( '.label text' );
var i = labelTexts.length;
while ( i-- ) {
  var labelText = labelTexts[i];
  var rect = document.createElementNS( 'http://www.w3.org/2000/svg', 'rect' );
  rect.setAttribute( 'transform', labelText.getAttribute( 'transform' ) );
  rect.setAttribute( 'x', -2 );
  rect.setAttribute( 'y', -2 );
  rect.setAttribute( 'width', labelText.clientWidth + 4 );
  rect.setAttribute( 'height', labelText.clientHeight + 4 );
  rect.setAttribute( 'class', 'label-bg' );

  labelText.parentNode.insertBefore( rect, labelText.parentNode.childNodes[0] );
}


var info, closeup;

ractive.on({
  reset: function () {
    this.set({
      info: null,
      closeup: null
    });
  },

  moreInfo: function ( event, el ) {
    var hotspotId = el.getAttribute( 'data-hotspot' );

    this.set( 'info', hotspotId );
    this.nodes[ hotspotId + '-label' ].style.opacity = 1;
  },

  showCloseUp: function ( event, el ) {
    this.set( 'closeup', el.getAttribute( 'data-closeup' ) );
  }
});

ractive.observe({
  info: function ( newInfo, oldInfo ) {
    if ( oldInfo ) {
      this.nodes[ oldInfo + '-label' ].style.opacity = 0;
    }

    if ( newInfo ) {
      this.nodes[ newInfo + '-label' ].style.opacity = 1;
      this.set( 'hotspotsVisible', false );
    } else {
      this.set( 'hotspotsVisible', true );
    }
  },

  closeup: function ( newCloseup, oldCloseup ) {
    var viewBox;

    // previous
    if ( oldCloseup ) {
      this.set( oldCloseup + 'Visible', false );
      this.set( 'hotspotsVisible', false );
    }

    // new
    viewBox = ( newCloseup ? viewBoxes[ newCloseup ] : viewBoxes.normal );

    this.animate( 'viewBox', viewBox, {
      duration: 300,
      easing: 'easeInOut',
      complete: function () {
        if ( newCloseup ) {
          ractive.set( newCloseup + 'Visible', true );
          ractive.set( 'hotspotsVisible', false );
        } else {
          ractive.set( 'hotspotsVisible', true );
        }
      }
    });
  }
});