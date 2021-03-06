var assert = function(value, message) {
	if (!value) {
		throw new Error('Assertion failed: ' + (message || JSON.stringify(value)));
	}
},
assertEqual = function(a, b, message) {
	assert(a === b, (message || '') + '; ' + (JSON.stringify(a) + ' === ' + JSON.stringify(b)));
},
assertNotEmpty = function(el, message) {
	assert(el.length > 0, (message || '') + '; ' + (JSON.stringify(el) + ' is not empty'));
},
assertEmpty = function(el, message) {
	assert(el.length <= 0, (message || '') + '; ' + (JSON.stringify(el) + ' is empty'));
},
assertThrows = function(fn, message) {
	var threw = false;
	try  {
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
assertElementExists = function(el, message) {
	assert(document.querySelector(el), message || 'Element ' + el + ' does not exist.');
}

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
	var ev = mouseEvent('click', el.offsetLeft, el.offsetTop, el.clientLeft, el.clientTop);
	dispatchEvent(el, ev);
}

describe('zino', function () {
	describe('simple element', function() {
		Zino.import('base/test/components/btn.html');
		var btn = document.createElement('btn');
		btn.setAttribute('page', '#12')
		document.body.appendChild(btn);

		it('can load a custom element', function(done) {
			setTimeout(function() {
				assertNotEmpty(document.querySelectorAll('.-shadow-root'), 'element is rendered');
				assertNotEmpty(document.querySelectorAll('btn[__ready]'), 'element is ready');
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
		Zino.import('base/test/components/comment.html');
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
			comment.body = 'This is my wonderful test comment!';

			setTimeout(function() {
				assertElementHasContent('comment h2', '"Tester"');
				assertElementHasContent('comment p', comment.body);
				done();
			}, 100);
		});
	});
	describe('multi-component element', function () {
		Zino.import('base/test/components/second-tag.html');
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
	describe('component preloading', function() {
		Zino.fetch('base/test/components/virtual-component.html', null, true, '<virtual-component>I render text: <quote>{{body}}</quote> -- yeah!</virtual-component>');
		Zino.import('base/test/components/virtual-component.html');
		var vc = document.createElement('virtual-component');
		vc.innerHTML = 'Lorem ipsum dolor sit amet';
		document.body.appendChild(vc);

		it('renders the component', function(done) {
			setTimeout(function() {
				assertNotEmpty(document.querySelectorAll('virtual-component .-shadow-root'), 'component rendered');
				assertElementHasContent('virtual-component quote', 'Lorem ipsum dolor sit amet', 'attribute has been applied correctly');
				done();
			}, 100);
		});

		var component = document.createElement('my-component');
		document.body.appendChild(component);

		function MyComponent(Tag) {
			return {
				tagName: 'my-component',
				render: function(data) {
					return new Tag('div', {id: 'my-id'}, ['Hello,', data.props.name, new Tag('p', {}, 'Paragraph')]);
				},
				styles: [':host { color: red; }', '#my-id { font-weight: bold; }'],
				functions: {
					props: {
						name: 'World!'
					}
				}
			};
		}

		it('can import JS', function(done) {
			Zino.import(MyComponent);

			setTimeout(function() {
				assertElementHasContent('my-component .-shadow-root #my-id', 'Hello,World!<p>Paragraph</p>');
				done();
			}, 32)
		});
	});

	describe('re-renders tag dynamically', function() {
		var ab = document.createElement('ab');
		ab.innerHTML = '12 34';
		document.body.appendChild(ab);
		Zino.fetch('base/test/components/ab.html', null, true, '<ab>{{props.x}}{{{body}}}{{^x}}Y{{/x}}{{#x}}{{.}}{{/x}}<script>{props:{x:"X"}}</script></ab>');
		Zino.import('base/test/components/ab.html');

		it('renders the body correctly', function(done) {
			setTimeout(function() {
				assertElementHasContent('ab .-shadow-root', 'X12 34Y', 'body contains expected value');
				done();
			}, 32);
		});

		it('re-renders after body change', function(done) {
			document.querySelector('ab').body = '34 56';
			setTimeout(function() {
				assertElementHasContent('ab .-shadow-root', 'X34 56Y', 're-rendered after body change');
				done();
			}, 32);
		});

		it('re-renders after setProps', function(done) {
			document.querySelector('ab').setProps('x', 'Y');
			setTimeout(function() {
				assertElementHasContent('ab .-shadow-root', 'Y34 56Y', 're-rendered after setProps');
				done();
			}, 32);
		});

		it('re-renders after setAttribute', function(done) {
			document.querySelector('ab').setAttribute('x', 'Z');
			setTimeout(function() {
				assertElementHasContent('ab .-shadow-root', 'Y34 56Z', 're-rendered after setAttribute');
				done();
			}, 32);
		});
	});
	
	describe('Escaping', function() {
		var cb = document.createElement('cb');
		cb.innerHTML = '<div class="me">123</div>'
		document.body.appendChild(cb);
		it('works for dynamic HTML content', function(done) {
			Zino.import(function(Tag) {
				return {
					tagName: 'cb',
					render: function(data) {
						return new Tag('div', {'class': 'test'}, data.body);
					}
				}
			});
			setTimeout(function() {
				assertElementHasContent('cb .-shadow-root .test .me', '123', 'renders HTML values correctly');
				done();
			}, 32);
		});
		it('updated the component correctly', function(done) {
			cb.body = '<div class="me">test<span>huhu</span>123</div>';
			setTimeout(function() {
				if (document.querySelectorAll('cb .-shadow-root .test .me span').length <= 0) {
					throw new Error('Assertion failed: dynamic HTML in a component correctly' + cb.outerHTML);
				}
				done();
			}, 32);
		});
	});
});
