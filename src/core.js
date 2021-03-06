import * as vdom from './vdom';
import {emptyFunc, isFn, isObj, uuid, merge} from './utils';
import {trigger, on, attachEvent} from './events';

export let renderOptions = {
	resolveData(key, value, oldID) {
		let id = uuid();
		if (oldID) {
			// unregister old entry
			delete dataRegistry[oldID];
		}
		dataRegistry[id] = value;
		return id;
	}
};

let tagRegistry = {},
	dataRegistry = {},
	defaultFunctions = {
		'props': {},
		'mount': emptyFunc,
		'unmount': emptyFunc,
		'render': emptyFunc,

		getHost() { return this; },
		setProps(name, value) {
			let tag = this.getHost();
			if (isObj(name)) {
				merge(tag.props, name);
			} else {
				tag.props[name] = value;
				let attrName = 'data-' + name.replace(/[A-Z]/g, g => `-${g.toLowerCase()}`);
				if (tag.attributes[attrName]) {
					defineAttribute(tag, attrName, `--${renderOptions.resolveData(name, value, tag.attributes[attrName].value)}--`);
				}
			}
			!tag.mounting && trigger('--zino-rerender-tag', tag);
		}
	};

export function registerTag(fn, document, Zino) {
	let firstElement = fn(vdom.Tag, Zino),
		tagName = firstElement.tagName;

	if (tagRegistry[tagName]) {
		// tag is already registered
		return;
	}

	handleStyles(firstElement);
	firstElement.functions = merge({}, defaultFunctions, firstElement.functions);
	tagRegistry[tagName] = firstElement;

	// initialize all occurences in provided context
	document && [].slice.call(vdom.getElementsByTagName(tagName, document)).forEach(tag => initializeTag(tag, tagRegistry[tagName]));
}

export function mount(tag, ignoreRender) {
	if (!tag.tagName) return;
	let entry = tagRegistry[tag.tagName.toLowerCase()];
	if (!entry || tag.getAttribute('__ready')) return;
	if (ignoreRender) entry.functions.render = emptyFunc;
	return initializeTag.call(ignoreRender ? {noEvents: true} : this, tag, entry);
}

export function render(tag) {
	let subEvents = renderTag(tag);
	attachSubEvents(subEvents, tag);
}

export function flushRegisteredTags() {
	tagRegistry = {};
}

function initializeTag(tag, registryEntry) {
	// check if the tag has been initialized already
	if (tag.__vdom || !registryEntry) return;
	let functions = registryEntry.functions;

	// if it has been pre-rendered
	if (tag.children.length > 0 && tag.children[0].attributes && tag.children[0].attributes['class'] && tag.children[0].attributes['class'].value === '-shadow-root') {
		let sibling = tag.children[1];
		// remove original HTML content
		if (sibling && sibling.className === '-original-root') {
			tag.__i = sibling.innerHTML;
			setElementAttr(sibling, tag);
			sibling.parentNode.removeChild(sibling);
		}
		tag.isRendered = true;
	} else {
		tag.__i = tag.ownerDocument ? tag.innerHTML : vdom.getInnerHTML(tag);
		setElementAttr(tag);
		tag.innerHTML = '<div class="-shadow-root"></div>';
		tag.isRendered = false;
	}
	trigger('--zino-initialize-node', {tag, node: functions});
	tag.__vdom = {};

	// render the tag's content
	let subEvents = !tag.isRendered && renderTag.call(this, tag) || {events:[]};
	
	// attach events
	let hostEvents = [],
		events = functions.events || [],
		childEvents = Object.keys(events).filter(all => {
			let isNotSelf = all !== ':host' && all !== tag.tagName;
			if (!isNotSelf) hostEvents.push({handlers: events[all], selector: all});
			return isNotSelf;
		}).map(e => ({selector: e, handlers: events[e]}));

	subEvents.events = subEvents.events.concat({childEvents, hostEvents, tag: this && this.noEvents ? tag.tagName : tag})

	if (!tag.attributes.__ready) {
		defineAttribute(tag, '__ready', true);
	}
	if (!this || this.noEvents !== true) {
		// attach sub events
		attachSubEvents(subEvents, tag);
	} else {
		return subEvents;
	}
}

function defineAttribute(tag, name, value) { 
	// if __s is already defined (which means the component has been mounted already) 
	if (isFn(tag.__s)) { 
		// if it's the same as setAttribute 
		if (tag.__s === tag.setAttribute) { 
			// we might have a double override => use the original HTMLElement's setAttribute instead to avoid endless recursion 
			HTMLElement.prototype.setAttribute.call(tag, name, value); 
		} else { 
			// we now know it's the original setAttribute (also works for vdom nodes) 
			tag.__s(name, value); 
		} 
	} else { 
		// if the element is not a mounted component 
		// but it is a regular HTML element 
		if (tag.ownerDocument) { 
			// use the HTMLElement's setAttribute to define the attribute 
			HTMLElement.prototype.setAttribute.call(tag, name, value); 
		} else { 
			// we now know it can only be a vdom node, so set attribute vdom-style 
			tag.attributes[name] = {name, value}; 
		} 
	} 
} 

function initializeNode({tag, node: functions = defaultFunctions}) {
	// copy all defined functions/attributes
	for (let all in functions) {
		let entry = functions[all];
		if (['mount', 'unmount', 'events', 'render'].indexOf(all) < 0) {
			if (isFn(entry)) {
				tag[all] = entry.bind(tag);
			} else {
				tag[all] = isObj(tag[all]) ? merge({}, entry, tag[all]) : entry;
			}
		}
	}
	// define basic properties
	let desc = Object.getOwnPropertyDescriptor(tag, 'body');
	if (!desc || typeof desc.get === 'undefined') {
		Object.defineProperty(tag, 'body', {
			set(val) {
				tag.__i = val;
				setElementAttr(tag);
				trigger('--zino-rerender-tag', tag.getHost());
			},
			get() { return tag.__i; }
		});
	}
	tag.__s = tag.setAttribute;
	tag.setAttribute = function(attr, val) {
		defineAttribute(this, attr, val);
		trigger('--zino-rerender-tag', this);
	};

	// call mount callback
	tag.props = merge({}, functions.props, getAttributes(tag, true));
	tag.attrs = getAttributes(tag);

	try {
		tag.mounting = true;
		functions.mount.call(tag);
		delete tag.mounting;
	} catch (e) {
		throw new Error('Unable to call mount function for ' + tag.tagName + ': ' + (e.message || e));
	}
}

function renderTag(tag, registryEntry = tagRegistry[tag.tagName.toLowerCase()]) {
	let events = [],
		renderCallbacks = [],
		renderedSubElements = [],
		renderedDOM;

	// do the actual rendering of the component
	vdom.setDataResolver(renderOptions.resolveData);
	vdom.clearTagsCreated();
	let data = getAttributes(tag);
	if (isFn(registryEntry.render)) {
		// tell the vdom which tags to remember to look for
		vdom.setFilter(Object.keys(tagRegistry));
		renderedDOM = vdom.Tag('div', {'class': '-shadow-root'}, registryEntry.render.call(tag, data));
	} else {
		throw new Error('No render function provided in component ' + tag.tagName);
	}

	// unmount previously rendered sub components
	tag.__subs && tag.__subs.forEach(unmountTag);

	// render all contained sub components
	// retrieve the tags that the vdom was made aware of (all our registered components)
	renderedSubElements = vdom.getTagsCreated();
	for (let idx = 0, len = renderedSubElements.length; idx < len; idx += 1) {
		let subEl = renderedSubElements[idx];

		// initialize them all
		let subElEvents = initializeTag.call({
			noRenderCallback: true,
			noEvents: true
		}, subEl, tagRegistry[subEl.tagName]);
		if (subElEvents) {
			renderedSubElements.splice.apply(renderedSubElements, [idx + 1, 0].concat(subElEvents.subElements));
			idx += subElEvents.subElements.length;
			len += subElEvents.subElements.length;
			events = events.concat(subElEvents.events);
			renderCallbacks = renderCallbacks.concat(subElEvents.renderCallbacks);
		}
	}

	if (tag.attributes.__ready && (Math.abs(renderedDOM.__complexity - (tag.__complexity || 0)) < 50) && tag.ownerDocument) {
		// has been rendered before, so just apply diff
		vdom.applyDOM(tag.children[0], renderedDOM, tag.ownerDocument);
	} else {
		// simply render everything inside
		if (tag.ownerDocument) {
			tag.children[0].innerHTML = vdom.getInnerHTML(renderedDOM);
		} else {
			tag.children[0] = renderedDOM;
		}
	}
	tag.__subs = renderedSubElements;
	tag.__vdom = renderedDOM;
	tag.__complexity = renderedDOM.__complexity;

	// if we have rendered any sub components, retrieve their actual DOM node
	renderedSubElements.length > 0 && (tag.querySelectorAll && [].slice.call(tag.querySelectorAll('[__ready]')) || []).forEach((subEl, index) => {
		// apply all additional functionality to them (custom functions, attributes, etc...)
		merge(subEl, renderedSubElements[index]);
		// update getHost to return the DOM node instead of the vdom node
		subEl.getHost = renderedSubElements[index].getHost = defaultFunctions.getHost.bind(subEl);
	});
	tag.isRendered = true;

	// if this is not a sub component's rendering run
	if (!this || !this.noRenderCallback) {
		// call all of our sub component's render functions
		renderCallbacks.forEach(callback => callback.fn.call(callback.tag.getHost()));
		// call our own rendering function
		registryEntry.functions.render.call(tag);
	} else {
		// just add this sub component's rendering function to the list
		renderCallbacks.push({fn: registryEntry.functions.render, tag});
	}
	return {events, renderCallbacks, data, subElements: renderedSubElements};
}

function attachSubEvents(subEvents, tag) {
	var count = {};
	subEvents.events.forEach(event => {
		let el = event.tag;
		if (!isObj(el)) {
			count[el] = (count[el] || 0) + 1;
			el = tag.querySelectorAll(el)[count[el] - 1];
		}
		if (!el.children[0].__eventsAttached) {
			attachEvent(el.children[0], event.childEvents, el);
			attachEvent(el, event.hostEvents, el);
			el.children[0].__eventsAttached = true;
		}
		isFn(el.onready) && el.onready.call(el);
	});
}

function unmountTag(tag) {
	let name = (tag.tagName || '').toLowerCase(),
		entry = tagRegistry[name];
	if (entry) {
		[].forEach.call(tag.nodeType === 1 && tag.attributes || Object.keys(tag.attributes).map(attr => tag.attributes[attr]), attr => {
			// cleanup saved data
			if (attr.name.indexOf('data-') >= 0) {
				delete dataRegistry[attr.value];
			}
		});
		try {
			entry.functions.unmount.call(tag);
		} catch (e) {
			throw new Error('Unable to unmount tag ' + name + ': ' + (e.message || e));
		}
	}
}

function getAttributes(tag, propsOnly) {
	let attrs = {props: tag.props, element: tag.element, styles: tag.styles, body: tag.__i},
		props = attrs.props;

	[].forEach.call(tag.nodeType === 1 && tag.attributes || Object.keys(tag.attributes).map(attr => tag.attributes[attr]), attribute => {
		let isComplex = attribute.name.indexOf('data-') >= 0 && typeof attribute.value === 'string' && attribute.value.substr(0, 2) === '--';
		let value = attribute.value;
		attrs[attribute.name] || (attrs[attribute.name] = isComplex && typeof value === 'string' && dataRegistry[value.replace(/^--|--$/g, '')] || value);
		if (attribute.name.indexOf('data-') === 0) {
			props[attribute.name.replace(/^data-/g, '').replace(/(\w)-(\w)/g, (g, m1, m2) => m1 + m2.toUpperCase())] = attrs[attribute.name];
		}
	});

	if (propsOnly) return props;
	return attrs;
}

function setElementAttr(source, target = source) {
	let baseAttrs = {};
	[].forEach.call(source.children, el => {
		if (!el.tagName) return;
		let name = el.tagName.toLowerCase();
		if (baseAttrs[name]) {
			if (!baseAttrs[name].isArray) {
				baseAttrs[name] = [baseAttrs[name]];
				baseAttrs[name].isArray = true;
			}
			baseAttrs[name].push(el);
		} else {
			baseAttrs[name] = el;
		}
	});
	target.element = baseAttrs;
}

function handleStyles(element) {
	let tagName = element.tagName;
	let styles = (element.styles || []).map(style => {
			let code = style;
			return code.replace(/[\r\n]*([^%\{;\}]+?)\{/gm, (global, match) => {
				if (match.trim().match(/^@/)) {
					return match + '{';
				}
				var selectors = match.split(',').map(selector => {
					selector = selector.trim();
					if (selector.match(/:host\b/) ||
						selector.match(new RegExp(`^\\s*${tagName}\\b`)) ||
						selector.match(/^\s*(?:(?:\d+%)|(?:from)|(?:to)|(?:@\w+)|\})\s*$/)) {
						return selector;
					}
					return tagName + ' ' + selector;
				});
				return global.replace(match, selectors.join(','));
			}).replace(/:host\b/gm, tagName) + '\n';
		}).join('\n');
	trigger('publish-style', {styles, tagName});
}

on('--zino-initialize-node', initializeNode);
on('--zino-unmount-tag', unmountTag);
on('--zino-mount-tag', mount);
