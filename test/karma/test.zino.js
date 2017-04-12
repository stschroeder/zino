var assert = function(value, message) {
		if (!value) {
			throw new Error('Assertion failed: ' + (message || JSON.stringify(value)));
		}
	},
	assertEqual = function(a, b, message) {
		assert(a === b, message || (JSON.stringify(a) + ' === ' + JSON.stringify(b)));
	},
	assertNotEmpty = function(el, message) {
		assert(el.length > 0, message || (JSON.stringify(el) + ' is not empty'));
	},
	assertEmpty = function(el, message) {
		assert(el.length <= 0, message || (JSON.stringify(el) + ' is empty'));
	},
	assertThrows = function(fn, message) {
		var threw = false;
		try	{
			fn();
		} catch(e) {
			threw = true;
		}
		assert(threw, message || ((fn.name || 'function') + ' throws exception'));
	},
	assertElementHasContent = function(el, expected, message) {
		var content = document.querySelector(el).innerHTML.trim();
		assertEqual(content, expected, message || ('Element ' + el + ' has content ' + content));
	},
	assertElementIsEmpty = function(el, message) {
		var content = document.querySelector(el).innerHTML.trim();
		assertEmpty(content, message || ('Element ' + el + ' is empty'));
	};

function mouseEvent(type, sx, sy, cx, cy) {
  var evt;
  var e = {
    bubbles: true,
    cancelable: (type != "mousemove"),
    view: window,
    detail: 0,
    screenX: sx, 
    screenY: sy,
    clientX: cx, 
    clientY: cy,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    button: 0,
    relatedTarget: undefined
  };
  if (typeof( document.createEvent ) == "function") {
    evt = document.createEvent("MouseEvents");
    evt.initMouseEvent(type, 
      e.bubbles, e.cancelable, e.view, e.detail,
      e.screenX, e.screenY, e.clientX, e.clientY,
      e.ctrlKey, e.altKey, e.shiftKey, e.metaKey,
      e.button, document.body.parentNode);
  } else if (document.createEventObject) {
    evt = document.createEventObject();
    for (prop in e) {
    evt[prop] = e[prop];
  }
    evt.button = { 0:1, 1:4, 2:2 }[evt.button] || evt.button;
  }
  return evt;
}
function dispatchEvent (el, evt) {
  if (el.dispatchEvent) {
    el.dispatchEvent(evt);
  } else if (el.fireEvent) {
    el.fireEvent('on' + type, evt);
  }
  return evt;
}
function click(el) {
	var ev = mouseEvent('click', el.offsetLet, el.offsetTop, el.clientLeft, el.clientTop);
	dispatchEvent(el, ev);
}

describe('zino', function () {
	describe('simple element', function() {
		Zino.import('base/examples/dist/btn.html');
		var btn = document.createElement('btn');
		btn.setAttribute('page', '#12')
		document.body.appendChild(btn);

		it('can load a custom element', function(done) {
			setTimeout(function() {
				assertNotEmpty(document.querySelectorAll('.-shadow-root'), 'element is rendered');
				done();
			}, 750);
		});
		it('binds an event to it', function(done) {
			setTimeout(function() {
				click(document.querySelector('button'));
				assertEqual(location.hash, '#12', 'event did trigger');
				done();
			}, 10);			
		});
	});	
	describe('complex element', function () {
		Zino.import('base/examples/dist/comment.html');
		var comment = document.createElement('comment');
		document.body.appendChild(comment);

		it('renders empty', function (done) {
			setTimeout(function() {
				assertElementHasContent('comment h2', '""', 'headline empty');
				assertElementIsEmpty('comment p', 'paragraph is empty');
				done();
			}, 750)
		});
		it('reacts to attribute change', function(done) {
			comment.setAttribute('author', 'Tester');
			comment.innerHTML = 'This is my wonderful test comment!';

			setTimeout(function() {
				assertElementHasContent('comment h2', '"Tester"');
				assertElementHasContent('comment p', comment.innerHTML);
				done();
			}, 100);
		});
	});
	describe('multi-component element', function () {
		Zino.import('base/examples/dist/second-tag.html');
		var secondTag = document.createElement('second-tag');
		secondTag.setAttribute('me', 'test');
		document.body.appendChild(secondTag);

		it('render the sub component', function (done) {
			setTimeout(function() {
				assertNotEmpty(document.querySelectorAll('todo-list .-shadow-root'), 'sub component rendered');
				done();				
			}, 1000);
		});
		it('should react to props change', function (done) {
			secondTag.setProps('name', 'Minkelhutz');
			setTimeout(function() {
				assertElementHasContent('second-tag div a[name]', 'Minkelhutz', 'Props change did trigger re-render');
				done();
			}, 100);
		});
		it('should transfer props to sub component', function (done) {
			secondTag.setProps('list', [{
				me: 'XXX'
			}]);
			setTimeout(function() {
				assertEqual(secondTag.querySelector('todo-list li input').value, 'XXX', 'props were transferred');
				done();
			}, 100);
		});
	});
});