(function () {
/**
 * almond 0.2.5 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());
define("almond", function(){});

/**
 * @license RequireJS domReady 2.0.1 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/domReady for details
 */
/*jslint */
/*global require: false, define: false, requirejs: false,
  window: false, clearInterval: false, document: false,
  self: false, setInterval: false */


define('domReady',[],function () {
    'use strict';

    var isTop, testDiv, scrollIntervalId,
        isBrowser = typeof window !== "undefined" && window.document,
        isPageLoaded = !isBrowser,
        doc = isBrowser ? document : null,
        readyCalls = [];

    function runCallbacks(callbacks) {
        var i;
        for (i = 0; i < callbacks.length; i += 1) {
            callbacks[i](doc);
        }
    }

    function callReady() {
        var callbacks = readyCalls;

        if (isPageLoaded) {
            //Call the DOM ready callbacks
            if (callbacks.length) {
                readyCalls = [];
                runCallbacks(callbacks);
            }
        }
    }

    /**
     * Sets the page as loaded.
     */
    function pageLoaded() {
        if (!isPageLoaded) {
            isPageLoaded = true;
            if (scrollIntervalId) {
                clearInterval(scrollIntervalId);
            }

            callReady();
        }
    }

    if (isBrowser) {
        if (document.addEventListener) {
            //Standards. Hooray! Assumption here that if standards based,
            //it knows about DOMContentLoaded.
            document.addEventListener("DOMContentLoaded", pageLoaded, false);
            window.addEventListener("load", pageLoaded, false);
        } else if (window.attachEvent) {
            window.attachEvent("onload", pageLoaded);

            testDiv = document.createElement('div');
            try {
                isTop = window.frameElement === null;
            } catch (e) {}

            //DOMContentLoaded approximation that uses a doScroll, as found by
            //Diego Perini: http://javascript.nwbox.com/IEContentLoaded/,
            //but modified by other contributors, including jdalton
            if (testDiv.doScroll && isTop && window.external) {
                scrollIntervalId = setInterval(function () {
                    try {
                        testDiv.doScroll();
                        pageLoaded();
                    } catch (e) {}
                }, 30);
            }
        }

        //Check if document already complete, and if so, just trigger page load
        //listeners. Latest webkit browsers also use "interactive", and
        //will fire the onDOMContentLoaded before "interactive" but not after
        //entering "interactive" or "complete". More details:
        //http://dev.w3.org/html5/spec/the-end.html#the-end
        //http://stackoverflow.com/questions/3665561/document-readystate-of-interactive-vs-ondomcontentloaded
        //Hmm, this is more complicated on further use, see "firing too early"
        //bug: https://github.com/requirejs/domReady/issues/1
        //so removing the || document.readyState === "interactive" test.
        //There is still a window.onload binding that should get fired if
        //DOMContentLoaded is missed.
        if (document.readyState === "complete") {
            pageLoaded();
        }
    }

    /** START OF PUBLIC API **/

    /**
     * Registers a callback for DOM ready. If DOM is already ready, the
     * callback is called immediately.
     * @param {Function} callback
     */
    function domReady(callback) {
        if (isPageLoaded) {
            callback(doc);
        } else {
            readyCalls.push(callback);
        }
        return domReady;
    }

    domReady.version = '2.0.1';

    /**
     * Loader Plugin API method
     */
    domReady.load = function (name, req, onLoad, config) {
        if (config.isBuild) {
            onLoad(null);
        } else {
            domReady(onLoad);
        }
    };

    /** END OF PUBLIC API **/

    return domReady;
});
/*! Statesman - v0.2.0 - 2013-07-04
* The JavaScript state management library

* 
* Copyright (c) 2013 Rich Harris; MIT Licensed */
/*jslint eqeq: true, plusplus: true */


;(function ( global ) {

'use strict';

var Statesman,
	Subset,

	statesmanProto = {},
	subsetProto = {},

	events,

	// static methods and properties,
	compile,
	utils,

	// helper functions
	isEqual,
	isNumeric,
	normalise,
	augment,

	set,
	get,
	
	clearCache,
	notifyObservers,
	notifyMultipleObservers,
	propagateChanges,
	propagateChange,
	registerDependant,
	unregisterDependant,

	defineProperty,
	defineProperties,

	// internal caches
	normalisedKeypathCache = {};



// we're creating a defineProperty function here - we don't want to add
// this to _legacy.js since it's not a polyfill. It won't allow us to set
// non-enumerable properties. That shouldn't be a problem, unless you're
// using for...in on a (modified) array, in which case you deserve what's
// coming anyway
try {
	Object.defineProperty({}, 'test', { value: 0 });
	Object.defineProperties({}, { test: { value: 0 } });

	defineProperty = Object.defineProperty;
	defineProperties = Object.defineProperties;
} catch ( err ) {
	// Object.defineProperty doesn't exist, or we're in IE8 where you can
	// only use it with DOM objects (what the fuck were you smoking, MSFT?)
	defineProperty = function ( obj, prop, desc ) {
		obj[ prop ] = desc.value;
	};

	defineProperties = function ( obj, props ) {
		var prop;

		for ( prop in props ) {
			if ( props.hasOwnProperty( prop ) ) {
				defineProperty( obj, prop, props[ prop ] );
			}
		}
	};
}
(function () {

	var varPattern = /\$\{\s*([a-zA-Z0-9_$\[\]\.]+)\s*\}/g;

	compile = function ( str, context, prefix ) {
		var compiled, triggers, expanded, fn, getter;

		prefix = prefix || '';
		triggers = [];

		expanded = str.replace( varPattern, function ( match, keypath ) {
			// make a note of which triggers are referenced, but de-dupe first
			if ( triggers.indexOf( keypath ) === -1 ) {
				triggers[ triggers.length ] = prefix + keypath;
			}

			return 'm.get("' + keypath + '")';
		});

		fn = new Function( 'utils', 'var m=this;try{return ' + expanded + '}catch(e){return undefined}' );

		if ( fn.bind ) {
			getter = fn.bind( context, Statesman.utils );
		} else {
			getter = function () {
				return fn.call( context, Statesman.utils );
			};
		}

		return {
			getter: getter,
			triggers: triggers
		};
	};

}());
Statesman = function ( data ) {
	defineProperties( this, {
		data: { value: data || {}, writable: true },

		// Events
		subs: { value: {}, writable: true },
		
		// Internal value cache
		cache: { value: {} },
		cacheMap: { value: {} },

		// Observers
		deps: { value: {} },
		depsMap: { value: {} },

		// Computed value references
		refs: { value: {} },
		refsMap: { value: {} },

		// Computed values
		computed: { value: {} },

		// Subsets
		subsets: { value: {} },
		
		// Deferred updates (i.e. computed values with more than one reference)
		deferred: { value: [] },

		// Place to store model changes prior to notifying consumers
		changes: { value: null, writable: true },
		upstreamChanges: { value: null, writable: true },
		changeHash: { value: null, writable: true }
	});
};
statesmanProto.add = function ( keypath, d ) {
	var value = this.get( keypath );

	if ( d === undefined ) {
		d = 1;
	}

	if ( isNumeric( value ) && isNumeric( d ) ) {
		this.set( keypath, +value + ( d === undefined ? 1 : +d ) );
	}
};
(function ( statesmanProto ) {

	var Computed, Reference, validate, emptyArray;

	statesmanProto.compute = function ( keypath, signature ) {
		var result, k, computed;

		if ( typeof keypath === 'object' ) {
			result = {};

			for ( k in keypath ) {
				if ( keypath.hasOwnProperty( k ) ) {
					computed = new Computed( this, k, keypath[k] );
					result[k] = computed.value;
				}
			}

			return result;
		}

		computed = new Computed( this, keypath, signature );
		return computed.value;
	};

	Computed = function ( statesman, keypath, signature ) {
		
		var i;

		// teardown any existing computed values on this keypath
		if ( statesman.computed[ keypath ] ) {
			statesman.computed[ keypath ].teardown();
		}

		this.statesman = statesman;
		this.keypath = keypath;

		statesman.computed[ keypath ] = this;

		// if we were given a string, we need to compile it
		if ( typeof signature === 'string' ) {
			signature = compile( signature, statesman );
		}

		else {
			// if we were given a function (handy, as it provides a closure), call it
			if ( typeof signature === 'function' ) {
				signature = signature();
			}

			validate( keypath, signature, statesman.debug );
		}
		

		this.signature = signature;
		this.cache = signature.cache;

		this.refs = [];

		i = signature.dependsOn.length;
		
		// if this is a cacheable computed, we update proactively
		if ( this.cache ) {
			
			// if we only have one dependency, we can update whenever it changes
			if ( i === 1 ) {
				this.selfUpdating = true;
			}

			while ( i-- ) {
				this.refs[i] = new Reference( this, signature.dependsOn[i] );
			}
		}

		this.setting = true;
		statesman.set( this.keypath, ( this.value = this.getter() ) );
		this.setting = false;
	};

	Computed.prototype = {
		bubble: function () {
			if ( this.selfUpdating ) {
				this.update();
			}

			else if ( !this.deferred ) {
				this.statesman.deferred.push( this );
				this.deferred = true;
			}
		},

		update: function () {
			var value;

			value = this.getter();

			if ( !isEqual( value, this.value ) ) {
				this.setting = true;
				set( this.statesman, this.keypath, value );
				this.setting = false;
				
				this.value = value;
			}

			return this;
		},

		getter: function () {
			var i, args, value;

			try {
				if ( this.signature.compiled ) {
					value = this.signature.compiled();
				}

				else {
					args = [];

					if ( this.cache ) {
						i = this.refs.length;
						
						while ( i-- ) {
							args[i] = this.refs[i].value;
						}

						value = this.signature.get.apply( this.context, args );
					}
					
					else {
						i = this.signature.dependsOn.length;
						
						while ( i-- ) {
							args[i] = this.statesman.get( this.signature.dependsOn[i] );
						}

						value = this.signature.get.apply( this.context, args );
					}
				}
			}

			catch ( err ) {
				if ( this.statesman.debug ) {
					throw err;
				}

				value = undefined;
			}

			this.override = false;
			return value;
		},

		setter: function ( value ) {
			if ( this.signature.set ) {
				try {
					this.signature.set.call( this.context, value );
				} catch ( err ) {
					if ( this.statesman.debug ) {
						throw err;
					}
				}
			}

			else if ( this.signature.readonly ) {
				if ( this.statesman.debug ) {
					throw new Error( 'You cannot overwrite a computed value ("' + this.keypath + '"), unless its readonly flag is set true' );
				}
			}

			else {
				this.override = true;
				this.setting = true;
				this.statesman.set( this.keypath, value );
				this.setting = false;
			}
		},

		teardown: function () {
			while ( this.refs.length ) {
				this.refs.pop().teardown();
				this.statesman.computed[ this.keypath ] = null;
			}
		}
	};

	Reference = function ( computed, keypath ) {
		this.computed = computed;
		this.statesman = computed.statesman;
		this.keypath = keypath;

		this.value = this.statesman.get( keypath );

		registerDependant( this, true );
	};

	Reference.prototype = {
		update: function () {
			var value;

			value = this.statesman.get( this.keypath );

			if ( !isEqual( value, this.value ) ) {
				this.value = value;
				this.computed.bubble();
			}
		},

		teardown: function () {
			unregisterDependant( this, true );
		}
	};


	emptyArray = []; // no need to create this more than once!

	validate = function ( keypath, signature, debug ) {

		if ( !signature.compiled ) {
			if ( !signature.get && !signature.set ) {
				throw new Error( 'Computed values must have either a get() or a set() method, or both' );
			}

			if ( !signature.set && ( signature.readonly !== false ) ) {
				signature.readonly = true;
			}

			if ( !signature.dependsOn ) {
				signature.dependsOn = emptyArray;
			} else if ( typeof signature.dependsOn === 'string' ) {
				signature.dependsOn = [ signature.dependsOn ];
			}

			if ( !signature.dependsOn.length ) {
				if ( signature.cache && debug ) {
					throw new Error( 'Computed values with no dependencies must be uncached' );
				}

				signature.cache = false;
			}

			if ( signature.cache !== false ) {
				signature.cache = true;
			}
		}
		
		if ( signature.dependsOn.indexOf( keypath ) !== -1 ) {
			throw new Error( 'A computed value ("' + keypath + '") cannot depend on itself' );
		}

		return signature;

	};

}( statesmanProto ));
statesmanProto.get = function ( keypath ) {
	return get( this, keypath && normalise( keypath ) );
};

var get = function ( statesman, keypath, keys, forceCache ) {
	var computed, lastKey, parentKeypath, parentValue, value;

	if ( !keypath ) {
		return statesman.data;
	}

	// if this is a non-cached computed value, compute it, unless we
	// specifically want the cached value
	if ( computed = statesman.computed[ keypath ] ) {
		if ( !forceCache && !computed.cache && !computed.override ) {
			statesman.cache[ keypath ] = computed.getter();
		}
	}

	// cache hit?
	if ( statesman.cache.hasOwnProperty( keypath ) ) {
		return statesman.cache[ keypath ];
	}

	keys = keys || keypath.split( '.' );
	lastKey = keys.pop();

	parentKeypath = keys.join( '.' );
	parentValue = get( statesman, parentKeypath, keys );

	if ( typeof parentValue === 'object' && parentValue.hasOwnProperty( lastKey ) ) {
		value = parentValue[ lastKey ];
		statesman.cache[ keypath ] = value;

		if ( !statesman.cacheMap[ parentKeypath ] ) {
			statesman.cacheMap[ parentKeypath ] = [];
		}
		statesman.cacheMap[ parentKeypath ].push( keypath );
	}

	return value;
};
(function ( statesmanProto ) {

	var Observer;

	statesmanProto.observe = function ( keypath, callback, options ) {
		
		var observer, observers, k, i, init;

		// by default, initialise observers
		init = ( !options || options.init !== false );

		// overload - allow observe to be called with no keypath (i.e. observe root)
		if ( typeof keypath === 'function' ) {
			options = callback;
			callback = keypath;

			keypath = '';
		}

		if ( typeof keypath === 'string' ) {
			observer = new Observer( this, keypath, callback, options );

			if ( init ) {
				observer.update();
			} else {
				observer.value = this.get( keypath );
			}

			return {
				cancel: function () {
					observer.teardown();
				}
			};
		}

		if ( typeof keypath !== 'object' ) {
			throw new Error( 'Bad arguments to Statesman.prototype.observe()' );
		}

		options = callback;

		observers = [];
		for ( k in keypath ) {
			if ( keypath.hasOwnProperty( k ) ) {
				observers[ observers.length ] = new Observer( this, k, keypath[k], options );
			}
		}

		i = observers.length;
		if ( init ) {
			while ( i-- ) {
				observers[i].update();
			}
		} else {
			while ( i-- ) {
				observers[i].value = this.get( observer.keypath );
			}
		}

		return {
			cancel: function () {
				i = observers.length;
				while ( i-- ) {
					observers[i].teardown();
				}
			}
		};
	};


	Observer = function ( statesman, keypath, callback, options ) {
		this.statesman = statesman;
		this.keypath = normalise( keypath );
		this.callback = callback;

		// default to root as context, but allow it to be overridden
		this.context = ( options && options.context ? options.context : statesman );

		registerDependant( this );


	};

	Observer.prototype = {
		update: function () {
			var value;

			value = get( this.statesman, this.keypath );

			if ( !isEqual( value, this.value ) ) {
				// wrap the callback in a try-catch block, and only throw error in
				// debug mode
				try {
					this.callback.call( this.context, value, this.value );
				} catch ( err ) {
					if ( this.statesman.debug ) {
						throw err;
					}
				}
				this.value = value;
			}
		},

		teardown: function () {
			unregisterDependant( this );
		}
	};
	
}( statesmanProto ));
statesmanProto.removeComputedValue = function ( keypath ) {
	if ( this.computed[ keypath ] ) {
		this.computed[ keypath ].teardown();
	}

	return this;
};
statesmanProto.reset = function ( data ) {
	this.data = {};
	
	// TODO to get proper change hash, should we just do a non-silent set?
	// what about e.g. Ractive adaptor?
	this.set( data, { silent: true });
	this.fire( 'reset' );

	notifyObservers( this, '' );

	return this;
};
(function ( statesmanProto ) {

	var integerPattern = /^\s*[0-9]+\s*$/, updateModel, mergeChanges;

	statesmanProto.set = function ( keypath, value, options ) {
		var allChanges, allUpstreamChanges, k, normalised;

		this.changes = [];
		this.upstreamChanges = [];

		this.changeHash = {};

		// setting multiple values in one go
		if ( typeof keypath === 'object' ) {
			options = value;

			for ( k in keypath ) {
				if ( keypath.hasOwnProperty( k ) ) {
					normalised = normalise( k );
					value = keypath[k];

					set( this, normalised, value );
				}
			}
		}

		// setting a single value
		else {
			normalised = normalise( keypath );
			set( this, normalised, value );
		}

		allChanges = [];
		allUpstreamChanges = [];

		// propagate changes via computed values
		while ( this.changes.length ) {
			mergeChanges( allChanges, this.changes );
			mergeChanges( allUpstreamChanges, this.upstreamChanges );
			propagateChanges( this );
		}

		// If this was a silent update, don't trigger any observers or events
		if ( options && options.silent ) {
			return this;
		}

		// Notify direct dependants of upstream keypaths...
		notifyMultipleObservers( this, allUpstreamChanges, true );

		// ...and dependants of this and downstream keypaths
		if ( allChanges.length ) {
			notifyMultipleObservers( this, allChanges );
		}

		

		// fire event
		if ( allChanges.length ) {
			this.fire( 'change', this.changeHash );
		}

		return this;
	};

	set = function ( statesman, keypath, value ) {
		var previous, keys, computed;

		// if this is a computed value, make sure it has a setter or can be
		// overridden. Unless it called set itself
		if ( ( computed = statesman.computed[ keypath ] ) && !computed.setting ) {
			computed.setter( value );
			return;
		}

		previous = get( statesman, keypath, null, true );
		
		// update the model, if necessary
		if ( previous !== value ) {
			updateModel( statesman.data, keypath, value );
		}

		else {
			// if value is a primitive, we don't need to do anything else -
			// we can be certain that no change has occurred
			if ( typeof value !== 'object' ) {
				return;
			}
		}

		// Clear cache
		clearCache( statesman, keypath );

		// add this keypath to the notification queue
		statesman.changes[ statesman.changes.length ] = keypath;
		statesman.changeHash[ keypath ] = value;

		// add upstream changes
		keys = keypath.split( '.' );
		while ( keys.length ) {
			keys.pop();
			keypath = keys.join( '.' );
			
			if ( statesman.upstreamChanges[ keypath ] ) {
				break; // all upstream keypaths will have already been added
			}

			statesman.upstreamChanges[ keypath ] = true;
			statesman.upstreamChanges.push( keypath );
		}
		
	};


	updateModel = function ( obj, keypath, value ) {
		var key, keys = keypath.split( '.' );

		while ( keys.length > 1 ) {
			key = keys.shift();

			// If this branch doesn't exist yet, create a new one - if the next
			// key matches /^\s*[0-9]+\s*$/, assume we want an array branch rather
			// than an object
			if ( !obj[ key ] ) {
				obj[ key ] = ( integerPattern.test( keys[0] ) ? [] : {} );
			}

			obj = obj[ key ];
		}

		obj[ keys[0] ] = value;
	};

	mergeChanges = function ( current, extra ) {
		var i = extra.length, keypath;

		while ( i-- ) {
			keypath = extra[i];

			if ( !current[ '_' + keypath ] ) {
				current[ '_' + keypath ] = true; // we don't want to accidentally overwrite 'length'!
				current[ current.length ] = keypath;
			}
		}
	};

}( statesmanProto ));
statesmanProto.subset = function ( path ) {
	if ( !path ) {
		throw 'No subset path specified';
	}

	if ( !this.subsets[ path ] ) {
		this.subsets[ path ] = new Subset( path, this );
	}

	return this.subsets[ path ];
};
statesmanProto.subtract = function ( keypath, d ) {
	var value = this.get( keypath );

	if ( d === undefined ) {
		d = 1;
	}

	if ( isNumeric( value ) && isNumeric( d ) ) {
		this.set( keypath, +value - ( d === undefined ? 1 : +d ) );
	}
};
statesmanProto.toggle = function ( keypath ) {
	this.set( keypath, !this.get( keypath ) );
};
clearCache = function ( statesman, keypath ) {
	var children = statesman.cacheMap[ keypath ];

	// TODO
	delete statesman.cache[ keypath ];

	if ( !children ) {
		return;
	}

	while ( children.length ) {
		clearCache( statesman, children.pop() );
	}
};
// http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
isNumeric = function ( n ) {
	return !isNaN( parseFloat( n ) ) && isFinite( n );
};
notifyObservers = function ( statesman, keypath, directOnly ) {

	var deps, i, map;

	deps = statesman.deps[ keypath ];

	if ( deps ) {
		i = deps.length;
		while ( i-- ) {
			deps[i].update();
		}
	}

	if ( directOnly ) {
		return;
	}

	map = statesman.depsMap[ keypath ];
	if ( map ) {
		i = map.length;
		while ( i-- ) {
			notifyObservers( statesman, map[i] );
		}
	}	
};

notifyMultipleObservers = function ( statesman, keypaths, directOnly ) {
	var i;

	i = keypaths.length;
	while ( i-- ) {
		notifyObservers( statesman, keypaths[i],directOnly );
	}
};
propagateChanges = function ( statesman ) {
	var i, changes, upstreamChanges, keypath, computed;

	changes = statesman.changes;
	upstreamChanges = statesman.upstreamChanges;

	statesman.changes = [];
	statesman.upstreamChanges = [];

	// upstream first
	i = upstreamChanges.length;
	while ( i-- ) {
		keypath = upstreamChanges[i];
		propagateChange( statesman, keypath, true );
	}

	i = changes.length;
	while ( i-- ) {
		keypath = changes[i];
		propagateChange( statesman, keypath );
	}

	while ( statesman.deferred.length ) {
		computed = statesman.deferred.pop();
		computed.update();
		computed.deferred = false;
	}
};


propagateChange = function ( statesman, keypath, directOnly ) {

	var refs, map, i;

	refs = statesman.refs[ keypath ];
	if ( refs ) {
		i = refs.length;
		while ( i-- ) {
			refs[i].update();
		}
	}

	// if we're propagating upstream changes, we only want to notify
	// direct dependants, not dependants of downstream keypaths
	if ( directOnly ) {
		return;
	}

	map = statesman.refsMap[ keypath ];
	if ( map ) {
		i = map.length;
		while ( i-- ) {
			propagateChange( statesman, map[i] );
		}
	}
};
registerDependant = function ( dependant, isReference ) {

	var statesman, keypath, deps, keys, parentKeypath, map, baseDeps, baseMap;

	statesman = dependant.statesman;
	keypath = dependant.keypath;

	if ( isReference ) {
		baseDeps = statesman.refs;
		baseMap = statesman.refsMap;
	} else {
		baseDeps = statesman.deps;
		baseMap = statesman.depsMap;
	}

	deps = baseDeps[ keypath ] || ( baseDeps[ keypath ] = [] );
	deps[ deps.length ] = dependant;

	// update dependants map
	keys = keypath.split( '.' );
	
	while ( keys.length ) {
		keys.pop();
		parentKeypath = keys.join( '.' );
	
		map = baseMap[ parentKeypath ] || ( baseMap[ parentKeypath ] = [] );

		if ( map[ keypath ] === undefined ) {
			map[ keypath ] = 0;
			map[ map.length ] = keypath;
		}

		map[ keypath ] += 1;

		keypath = parentKeypath;
	}
};
unregisterDependant = function ( dependant, isReference ) {

	var statesman, keypath, deps, keys, parentKeypath, map, baseDeps, baseMap;

	statesman = dependant.statesman;
	keypath = dependant.keypath;

	if ( isReference ) {
		baseDeps = statesman.refs;
		baseMap = statesman.refsMap;
	} else {
		baseDeps = statesman.deps;
		baseMap = statesman.depsMap;
	}

	deps = baseDeps[ keypath ];
	deps.splice( deps.indexOf( dependant ), 1 );

	// update dependants map
	keys = keypath.split( '.' );
	
	while ( keys.length ) {
		keys.pop();
		parentKeypath = keys.join( '.' );
	
		map = baseMap[ parentKeypath ];

		map[ keypath ] -= 1;

		if ( !map[ keypath ] ) {
			map.splice( map.indexOf( keypath ), 1 );
			map[ keypath ] = undefined;
		}

		keypath = parentKeypath;
	}
};
utils = {
	total: function ( arr ) {
		return arr.reduce( function ( prev, curr ) {
			return prev + curr;
		});
	}
};
Subset = function( path, state ) {
	var self = this, keypathPattern, pathDotLength;

	this.path = path;
	this.pathDot = path + '.';
	this.root = state;

	// events stuff
	this.subs = {};
	keypathPattern = new RegExp( '^' + this.pathDot.replace( '.', '\\.' ) );
	pathDotLength = this.pathDot.length;

	this.root.on( 'change', function ( changeHash ) {
		var localKeypath, keypath, unprefixed, changed;

		unprefixed = {};

		for ( keypath in changeHash ) {
			if ( changeHash.hasOwnProperty( keypath ) && keypathPattern.test( keypath ) ) {
				localKeypath = keypath.substring( pathDotLength );
				unprefixed[ localKeypath ] = changeHash[ keypath ];

				changed = true;
			}
		}

		if ( changed ) {
			self.fire( 'change', unprefixed );
		}
	});
};
subsetProto.add = function ( keypath, d ) {
	this.root.add( this.pathDot + keypath, d );
};
(function ( subsetProto ) {

	var compute;

	subsetProto.compute = function ( keypath, signature ) {

		var result, k;

		if ( typeof keypath === 'object' ) {
			result = {};

			for ( k in keypath ) {
				if ( keypath.hasOwnProperty( k ) ) {
					result[k] = compute( this, k, keypath );
				}
			}

			return result;
		}

		return compute( this, keypath, signature );

	};

	compute = function ( subset, keypath, signature ) {

		var path = subset.pathDot, i;

		if ( typeof signature === 'string' ) {
			signature = compile( signature, subset.root, path );
			return subset.root.compute( path + keypath, signature );
		}

		if ( typeof signature === 'function' ) {
			signature = signature();
		}

		// prefix dependencies
		if ( signature.dependsOn ) {
			if ( typeof signature.dependsOn === 'string' ) {
				signature.dependsOn = [ signature.dependsOn ];
			}

			i = signature.dependsOn.length;
			while ( i-- ) {
				signature.dependsOn = ( path + signature.dependsOn );
			}
		}

		if ( !signature.context ) {
			signature.context = subset;
		}

		return subset.root.compute( path + keypath, signature );
	};

}( subsetProto ));
subsetProto.get = function ( keypath ) {
	if ( !keypath ) {
		return this.root.get( this.path );
	}

	return this.root.get( this.pathDot + keypath );
};
subsetProto.observe = function ( keypath, callback, options ) {
	var k, map;

	// overload - observe multiple keypaths
	if ( typeof keypath === 'object' ) {
		options = callback;

		map = {};
		for ( k in keypath ) {
			if ( keypath.hasOwnProperty( k ) ) {
				map[ this.pathDot + k ] = keypath[ k ];
			}
		}

		if ( options ) {
			options.context = options.context || this;
		} else {
			options = { context: this };
		}

		return this.root.observe( map, options );
	}

	// overload - omit keypath to observe root
	if ( typeof keypath === 'function' ) {
		options = callback;
		callback = keypath;
		keypath = this.path;
	}

	else if ( keypath === '' ) {
		keypath = this.path;
	}

	else {
		keypath = ( this.pathDot + keypath );
	}

	if ( options ) {
		options.context = options.context || this;
	} else {
		options = { context: this };
	}

	return this.root.observe( keypath, callback, options );
};
subsetProto.removeComputedValue = function ( keypath ) {
	this.root.removeComputedValue( this.pathDot + keypath );
	return this;
};
subsetProto.reset = function ( data ) {
	this.root.set( this.path, data );
	return this;
};
subsetProto.set = function ( keypath, value, options ) {
	var k, map;

	if ( typeof keypath === 'object' ) {
		options = value;
		map = {};

		for ( k in keypath ) {
			if ( keypath.hasOwnProperty( k ) ) {
				map[ this.pathDot + k ] = keypath[ k ];
			}
		}
		
		this.root.set( map, options );
		return this;
	}

	this.root.set( this.pathDot + keypath, value, options );
	return this;
};
subsetProto.subset = function ( keypath ) {
	return this.root.subset( this.pathDot + keypath );
};
subsetProto.subtract = function ( keypath, d ) {
	this.root.subtract( this.pathDot + keypath, d );
};
subsetProto.toggle = function ( keypath ) {
	this.root.toggle( this.pathDot + keypath );
};
events = {};

events.on = function ( eventName, callback ) {
	var self = this, listeners, n, list;

	if ( typeof eventName === 'object' ) {
		list = [];
		for ( n in eventName ) {
			if ( eventName.hasOwnProperty( n ) ) {
				list[ list.length ] = this.on( n, eventName[n] );
			}
		}

		return {
			cancel: function () {
				while ( list.length ) {
					list.pop().cancel();
				}
			}
		};
	}

	if ( !this.subs[ eventName ] ) {
		this.subs[ eventName ] = [];
	}

	listeners = this.subs[ eventName ];
	listeners[ listeners.length ] = callback;

	return {
		cancel: function () {
			self.off( eventName, callback );
		}
	};
};

events.once = function ( eventName, callback ) {
	var self = this, listeners, n, list, suicidalCallback;

	if ( typeof eventName === 'object' ) {
		list = [];
		for ( n in eventName ) {
			if ( eventName.hasOwnProperty( n ) ) {
				list[ list.length ] = this.once( n, eventName[n] );
			}
		}

		return {
			cancel: function () {
				while ( list.length ) {
					list.pop().cancel();
				}
			}
		};
	}

	if ( !this.subs[ eventName ] ) {
		this.subs[ eventName ] = [];
	}

	listeners = this.subs[ eventName ];

	suicidalCallback = function () {
		callback.apply( self, arguments );
		self.off( eventName, suicidalCallback );
	};

	listeners[ listeners.length ] = suicidalCallback;

	return {
		cancel: function () {
			self.off( eventName, suicidalCallback );
		}
	};
};

events.off = function ( eventName, callback ) {
	var subscribers, index;

	if ( !eventName ) {
		this.subs = {};
		return this;
	}

	if ( !callback ) {
		delete this.subs[ eventName ];
		return this;
	}

	subscribers = this.subs[ eventName ];
	if ( subscribers ) {
		index = subscribers.indexOf( callback );

		if ( index !== -1 ) {
			subscribers.splice( index, 1 );
		}

		if ( !subscribers.length ) {
			delete this.subs[ eventName ];
		}
	}

	return this;
};

events.fire = function ( eventName ) {
	var subscribers, args, len, i;

	subscribers = this.subs[ eventName ];

	if ( !subscribers ) {
		return this;
	}

	len = subscribers.length;
	args = Array.prototype.slice.call( arguments, 1 );

	for ( i=0; i<len; i+=1 ) {
		subscribers[i].apply( this, args );
	}
};
(function () {

	var varPattern = /\$\{\s*([a-zA-Z0-9_$\[\]\.]+)\s*\}/g;

	compile = function ( str, statesman, prefix ) {
		var expanded, dependencies, fn, compiled;

		prefix = prefix || '';
		dependencies = [];

		expanded = str.replace( varPattern, function ( match, keypath ) {
			// make a note of which dependencies are referenced, but de-dupe first
			if ( dependencies.indexOf( keypath ) === -1 ) {
				dependencies[ dependencies.length ] = prefix + keypath;
			}

			return 'm.get("' + prefix + keypath + '")';
		});

		fn = new Function( 'utils', 'var m=this;return ' + expanded );

		if ( fn.bind ) {
			compiled = fn.bind( statesman, Statesman.utils );
		} else {
			compiled = function () {
				return fn.call( statesman, Statesman.utils );
			};
		}

		return {
			compiled: compiled,
			dependsOn: dependencies,
			cache: !!dependencies.length
		};
	};

}());
// Miscellaneous helper functions
isEqual = function ( a, b ) {
	// workaround for null, because typeof null = 'object'...
	if ( a === null && b === null ) {
		return true;
	}

	// If a or b is an object, return false. Otherwise `set( key, value )` will fail to notify
	// observers of `key` if `value` is the same object or array as it was before, even though
	// the contents of changed
	if ( typeof a === 'object' || typeof b === 'object' ) {
		return false;
	}

	// we're left with a primitive
	return a === b;
};

normalise = function ( keypath ) {
	return normalisedKeypathCache[ keypath ] || ( normalisedKeypathCache[ keypath ] = keypath.replace( /\[\s*([0-9]+)\s*\]/g, '.$1' ) );
};

augment = function ( target, source ) {
	var key;

	for ( key in source ) {
		if ( source.hasOwnProperty( key ) ) {
			target[ key ] = source[ key ];
		}
	}
};

augment( statesmanProto, events );
augment( subsetProto, events );

Statesman.prototype = statesmanProto;
Subset.prototype = subsetProto;

// attach static properties
Statesman.utils = utils;


// export as CommonJS
if ( typeof module !== "undefined" && module.exports ) {
	module.exports = Statesman;
}

// ...or as AMD
else if ( typeof define === "function" && define.amd ) {
	define('Statesman',[], function () {
		return Statesman;
	});
}

// ...or as browser global
else { 
	global.Statesman = Statesman;
}

}( this ));
define('data',[],function () {
return {"unused":[null,null,null,null,null,null,{"title":"Extending Ractive","steps":[{"template":"<table class='superheroes'>\n  <tr>\n    <th>#</th>\n    <th class='sortable' proxy-tap='sort' data-column='name'>Superhero name</th>\n    <th class='sortable' proxy-tap='sort' data-column='realname'>Real name</th>\n    <th class='sortable' proxy-tap='sort' data-column='power'>Superpower</th>\n  </tr>\n\n  {{#superheroes | sort : num}}\n    <tr>\n      <td>{{num | plus[1]}}</td>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/superheroes}}\n</table>","javascript":"// define our superheroes\nvar xmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation', info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',   info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',  info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nvar view = new Ractive({\n  el: output,\n  template: template,\n  data: { superheroes: xmen },\n  modifiers: {\n    plus: function ( a, b ) {\n      return a + b;\n    },\n    sort: function ( array ) {\n      array = array.slice(); // clone, so we don't modify the underlying data\n      \n      return array.sort( function ( a, b ) {\n        return a[ sortColumn ] < b[ sortColumn ] ? -1 : 1;\n      });\n    }\n  }\n});\n\nvar sort, sortColumn;\n\nsort = function () {\n  view.update( 'superheroes' );\n\n  $( 'th.sorted' ).removeClass( 'sorted' );\n  $( 'th[data-column=\"' + sortColumn + '\"]' ).addClass( 'sorted' ); \n};\n\n// sort by name initially\nsortColumn = 'name';\nsort();\n\nview.on( 'sort', function ( event, el ) {\n  sortColumn = el.getAttribute( 'data-column' );\n  sort();\n});","init":true,"fixed":{},"copy":"<h2>Stay classy</h2>\n\n<p>You may have been wondering how you would go about making the code in the last tutorial more general, so that you could easily build a sortable table out of any data.</p>\n\n<p>The answer is <code>Ractive.extend</code>. In this tutorial we will create a new <code>Table</code> <em>class</em>, which inherits from the base <code>Ractive</code> class and adds some new tricks.</p>\n\n<p>First, let's remove the hard-coded column headers from the template:</p>\n\n<pre class='prettyprint lang-html'>\n<tr>\n  <th>#</th>\n  {{#headers}}\n    <th class='sortable' proxy-tap='sort' data-column='{{id}}'>{{name}}</th>\n  {{/headers}}\n</tr>\n</pre>\n\n<p>Then, we need to \n\n\n\n<div class='hint'>\n\t<p>Of course, you could just use a library that creates sortable tables. There are some very good ones. But then you have to learn a new library, and potentially submit to that library's design philosophy.</p>\n\n\t<p><span class='logo'>Ractive.js</span> is all about flexibility. If you want to change the design or behaviour of a component (say, adding a class name to a particular element), the power to do so is in your hands &ndash; the template is easy to understand and tweak, and the view logic is straightforward.</p>\n\n\t<p>It's better to be able to build your own solution than to rely on developers maintaining high quality and up-to-date documentation.</p>\n</div>","console":""}]}],"tutorials":[{"title":"Hello world!","steps":[{"template":"<p>Hello world!</p>","javascript":"// Click in this box and hit Shift-Enter to execute this code\nvar ractive = new Ractive({\n  el: output,\n  template: template\n});","copy":"<h2>Welcome to Learn Ractive.js!</h2>\n\n<p>This is a set of interactive tutorials which you can take at your own pace. Each tutorial consists of a number of steps &ndash; you're currently on step 1 of the 'Hello world!' tutorial.</p>\n\n<p>At any time you can reset the current step by clicking the <strong>reset</strong> button above.</p>\n\n<h3>Let's get started</h3>\n\n<p>Try creating a new Ractive by executing the JavaScript on the right &ndash; click in the <strong>#javascript</strong> box, and hit <kbd>Shift-Enter</kbd> (or click the <strong>execute</strong> button).</p>\n\n<div class='hint'>\n\t<p>In later steps, if you can't get it to work (or if you're just lazy!) you can click the 'fix code' button below to insert working code as though you'd followed the instructions exactly. For now, it's disabled.</p>\n\n\t<p>Throughout the tutorials, boxes like this will contain technical notes and asides, for the particularly nerdy or curious.</p>\n</div>","console":"// ignore this block for now..."},{"template":"<p>Hello world!</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\n/* [hint] ---- //\nThroughout this tutorial, you can use the variables `output` and `template` to refer to the panel on the left, and the contents of the panel above, respectively\n// --- [/hint] */","fixed":{"template":"<p>{{greeting}} {{recipient}}!</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { greeting: 'Hello', recipient: 'world' }\n});\n\n/* [hint] ---- //\nThroughout this tutorial, you can use the variables `output` and `template` to refer to the panel on the left, and the contents of the panel above, respectively\n// --- [/hint] */"},"copy":"<h2>That's not very exciting</h2>\n\n<p>You're right, it's not. Let's make our template more templatey &ndash; replace the hard-coded text with some variables:</p>\n\n<pre class='prettyprint lang-html'>&lt;p&gt;{{greeting}} {{recipient}}!&lt;/p&gt;</pre>\n\n<p>Then, add some data to it, by adding a <code>data</code> option to our Ractive so that the code looks like this:</p>\n\n<pre class='prettyprint lang-js'>\nvar ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { greeting: 'Hello', recipient: 'world' }\n});\n</pre>\n\n<p>Execute the code (click in the <strong>#javascript</strong> box, hit <kbd>Shift-Enter</kbd>). It should look exactly as it did before.</p>","console":"// This block lets you interact with ractives you've already created. You'll get to use it in the next step."},{"template":"<p>{{greeting}} {{recipient}}!</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { greeting: 'Hello', recipient: 'world' }\n});","init":true,"copy":"<h2>Parlez-vous Français?</h2>\n\n<p>Here's where <span class='logo'>Ractive.js</span> separates from other templating libraries. Normally, if you wanted to change the data, you would have to re-render the entire view, which would have the effect of discarding the DOM nodes you'd already created. That's wasteful.</p>\n\n<p>Instead, we can manipulate views we've already created. Try running this in the console block (lower right):</p>\n\n<pre class='prettyprint lang-js'>\nractive.set( 'greeting', 'Bonjour' );\n</pre>\n\n<p>And now this:</p>\n\n<pre class='prettyprint lang-js'>\nractive.set( 'recipient', 'tout le monde' );\n</pre>\n\n<p>Ooh la la! Even better, we could set both properties in one go. Let's do it in Mandarin this time:</p>\n\n<pre class='prettyprint lang-js'>\nractive.set({\n  greeting: '你好',\n  recipient: '世界'\n});\n</pre>\n\n<div class='hint'>\n\t<p>What's happening here is that the contents of the <code>&lt;p&gt;</code> element are split into four text nodes &ndash; one for <code>{{greeting}}</code>, one for the space character, one for <code>{{recipient}}</code>, and one for the <code>!</code>. Ractive stores references to the nodes that correspond to the variables, and updates them when the data changes, leaving everything else untouched.</p>\n\n\t<p>Surgically updating text nodes is much faster than replacing elements, particularly when you only need to change part of your ractive.</p>\n</div>","console":""},{"template":"<p>{{greeting}} {{recipient}}!</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { greeting: 'Hello', recipient: 'world' }\n});","init":true,"fixed":{"template":"<p style='color: {{color}}; font-size: {{size}}em; font-family: {{font}};'>\n  {{greeting}} {{recipient}}!\n</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n  \tgreeting: 'Hello',\n  \trecipient: 'world',\n  \tcolor: 'purple',\n  \tsize: 2,\n  \tfont: 'Arial'\n  }\n});"},"copy":"<h2>Dynamic attributes</h2>\n\n<p>So far, we've only updated text content within a ractive. But we can use the same <a href='http://mustache.github.io/'>mustache syntax</a> to update element <em>attributes</em>.</p>\n\n<p>Let's add a style attribute to our <code>&lt;p&gt;</code> element:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;p style='color: {{color}}; font-size: {{size}}em; font-family: {{font}};'&gt;\n  {{greeting}} {{recipient}}!\n&lt;/p&gt;\n</pre>\n\n<p>Now we just need to add some data:</p>\n\n<pre class='prettyprint lang-js'>\nvar ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    greeting: 'Hello',\n    recipient: 'world',\n    color: 'purple',\n    size: 2,\n    font: 'Arial'\n  }\n});\n</pre>\n\n<p>Execute this code. You should see a large purple 'Hello world!' message written in Arial.</p>\n\n<p>And, of course, we can update this attribute. Try running this in the console:</p>\n\n<pre class='prettyprint lang-js'>\nractive.set({\n  color: 'red',\n  size: 3,\n  font: 'Comic Sans MS'\n});\n</pre>\n\n<div class='hint'>\n\t<p>Note that even though we're changing three properties, Ractive recognises that they all belong to the same attribute, and only touches the DOM once.</p>\n</div>","console":""},{"template":"<p style='color: {{color}}; font-size: {{size}}em; font-family: {{font}};'>\n  {{greeting}} {{recipient}}!\n</p>\n\n<!-- add the button here -->","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n  \tgreeting: 'Hello',\n  \trecipient: 'world',\n  \tcolor: 'purple',\n  \tsize: 2,\n  \tfont: 'Arial'\n  } // add a 'counter' property...\n});\n\n// add event handler here","init":true,"fixed":{"template":"<p style='color: {{color}}; font-size: {{size}}em; font-family: {{font}};'>\n  {{greeting}} {{recipient}}!\n</p>\n\n<button id='count'>Times this button has been clicked: {{counter}}</button>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n  \tgreeting: 'Hello',\n  \trecipient: 'world',\n  \tcolor: 'purple',\n  \tsize: 2,\n  \tfont: 'Arial',\n  \tcounter: 0\n  }\n});\n\ndocument.getElementById( 'count' ).addEventListener( 'click', function () {\n  ractive.set( 'counter', ractive.get( 'counter' ) + 1 );\n});"},"copy":"<h2>Get a load of this</h2>\n\n<p>As well as <em>setting</em> data, you can <em>get</em> it, which sometimes comes in handy. Let's add some interactivity to our demo &ndash; add the following to the template:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;button id='count'&gt;Times this button has been clicked: {{counter}}&lt;/button&gt;\n</pre>\n\n<p>Then, let's wire it up. In later tutorials, we'll learn a more convenient way to do this, but for now we'll use good old <code>addEventListener</code>. First, add a <code>counter</code> property to <code>data</code>, and initialise it to <code>0</code>. Then add the event handler:</p>\n\n<pre class='prettyprint lang-js'>\ndocument.getElementById( 'count' ).addEventListener( 'click', function () {\n  ractive.set( 'counter', ractive.get( 'counter' ) + 1 );\n});\n</pre>\n\n<p>Execute this code. Try clicking on the button a few times &ndash; the counter should increment with each click.</p>\n\n<div class='hint'>\n\t<p>With traditional templating libraries this would be much harder. You'd be removing and recreating the button each time, so you'd have to keep detaching and reattaching the event handler. Or you could use event delegation, but that's extra work too. Or you could abandon templating and manipulate the DOM manually &ndash; but that way madness lies.</p>\n</div>\n\n<p>Congratulations! You've completed the first tutorial. If you're ready to dive in and start using Ractive in your own projects, <a href='http://www.ractivejs.org/download/'>download the latest version</a> and <a href='https://github.com/rich-harris/Ractive/wiki'>read the docs</a>. Otherwise, let's move on to the next tutorial.</p>","console":""}]},{"title":"Nested properties","steps":[{"template":"<h2>Country profile</h2>\n\n<p>NAME_HERE is a TEMPERATURE_HERE country with RAINFALL_HERE rainfall and a population of POPULATION_HERE.</p>\n\n<p>The capital city is CAPITAL_NAME_HERE (<a href='https://maps.google.co.uk/maps?q=LATITUDE_HERE,LONGITUDE_HERE&z=11' target='_blank'>see map</a>).</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    country: {} // <-- replace the {} with country data\n  }\n});","init":true,"fixed":{"template":"<h2>Country profile</h2>\n\n<p>{{country.name}} is a {{country.climate.temperature}} country with {{country.climate.rainfall}} rainfall and a population of {{country.population}}.</p>\n\n<p>The capital city is {{country.capital.name}} (<a href='https://maps.google.co.uk/maps?q={{country.capital.lat}},{{country.capital.lon}}&z=11' target='_blank'>see map</a>).</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    country: {\n      name: 'The UK',\n      climate: { temperature: 'cold', rainfall: 'excessive' },\n      population: 62641000,\n      capital: { name: 'London', lat: 51.5171, lon: -0.1062 }\n    }\n  }\n});"},"copy":"<h2>Yo dawg, I heard you like properties</h2>\n\n<p>Ractive uses the <a href='http://mustache.github.io/'>mustache syntax</a>, which supports <em>nested properties</em> &ndash; in JavaScript-land, that means properties that are objects with their own properties (which might be objects with their own properties...).</p>\n\n<p>Let's say we were building an app that displayed information about different countries. An object representing a country could look like this:</p>\n\n<pre class='prettyprint lang-js'>\n{\n  name: 'The UK',\n  climate: { temperature: 'cold', rainfall: 'excessive' },\n  population: 62641000,\n  capital: { name: 'London', lat: 51.5171, lon: -0.1062 }\n}\n</pre>\n\n<p>Add that data to our JavaScript &ndash; there's a placeholder <code>country</code> property.</p>\n\n<p>We can refer to these nested properties in our template using dot notation. So to refer to the country's name, we use <code>{{country.name}}</code>.</p>\n\n<p>Go ahead and replace the placeholders in the template with mustaches. Don't forget the <code>href</code> on the 'see map' link. If you get stuck, click the <strong>fix code</strong> button below.</p>\n\n<p>Execute the code. You should see a description of the UK. For extra credit, update the ractive from the console.</p>","console":"// Once we've rendered our view, we can change the country info\nractive.set( 'country', {\n  name: 'Australia',\n  climate: { temperature: 'hot', rainfall: 'limited' },\n  population: 22620600,\n  capital: { name: 'Canberra', lat: -35.2828, lon: 149.1314 }\n});"},{"template":"<h2>Country profile</h2>\n\n<p>{{country.name}} is a {{country.climate.temperature}} country with {{country.climate.rainfall}} rainfall and a population of {{country.population}}.</p>\n\n<p>The capital city is {{country.capital.name}} (<a href='https://maps.google.co.uk/maps?q={{country.capital.lat}},{{country.capital.lon}}&z=11' target='_blank'>see map</a>).</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    country: {\n      name: 'The UK',\n      climate: { temperature: 'cold', rainfall: 'excessive' },\n      population: 62641000,\n      capital: { name: 'London', lat: 51.5171, lon: -0.1062 }\n    }\n  }\n});","init":true,"fixed":{"template":"<h2>Country profile</h2>\n\n{{#country}}\n  <p>{{name}} is a {{climate.temperature}} country with {{climate.rainfall}} rainfall and a population of {{population}}.</p>\n\n  {{#capital}}\n    <p>The capital city is {{name}} (<a href='https://maps.google.co.uk/maps?q={{lat}},{{lon}}&z=11' target='_blank'>see map</a>).</p>\n  {{/capital}}\n  \n{{/country}}"},"copy":"<h2>Context is everything</h2>\n\n<p>That's all well and good, but it's a little on the verbose side. You can imagine if we had lots more properties on the capital city object that we wanted to refer to &ndash; we don't want to keep writing <code>{{country.capital.xyz}}</code> if we don't have to.</p>\n\n<p>We don't have to. Instead, we can use a <em>section</em> to provide <em>context</em>:</p>\n\n<pre class='prettyprint lang-html'>\n{{#country}}\n&lt;p&gt;{{name}} is a {{climate.temperature}} country with {{climate.rainfall}} rainfall and a population of {{population}}.&lt;/p&gt;\n{{/country}}\n</pre>\n\n<p>Note the <code>#</code> character, indicating that we're dealing with a section, and also the closing mustache with a <code>/</code> character.</p>\n\n<div class='hint'>\n\t<p>If you're used to the Handlebars way of doing things, this is equivalent to Handlebars' <code>#with</code> block helper. In mustache, a <code class='prettyprint lang-html'>{{#section}}&lt;!-- stuff --&gt;{{/section}}</code> can in fact be a context section, a list section (<code>#each</code> in Handlebars), or conditional section (<code>#if</code>), depending on whether it is given an object, an array, or a primitive value.</p>\n\n\t<p>That might sound confusing, but in practice it isn't at all &ndash; it's just nice and concise. We'll learn about lists and conditionals in future tutorials.</p>\n</div>\n\n<p>Go ahead and update the template, creating a section for the capital as well. (You can either create a <code>{{#country.capital}}</code> section, or a <code>{{#capital}}</code> section <em>inside</em> the <code>{{#country}}</code> section. Use whichever structure is easier in a given situation.)</p>\n\n<div class='hint'>\n\t<p>Notice that if you create a <code>{{#capital}}</code> section, you could end up having two <code>{{name}}</code> variables &ndash; one for the country, one for the capital.<p>\n\n\t<p>We say that the capital <code>{{name}}</code> reference has a two-level <em>context stack</em> &ndash; if the innermost context (<code>country.capital</code>) has a <code>name</code> property, <code>{{name}}</code> resolves to the <code>country.capital.name</code> <em>keypath</em>.</p>\n\n\t<p>If not, Ractive moves <em>up the context stack</em> (in this case, to <code>country</code>, and then to the root <code>data</code> object) until it <em>does</em> find a context with a <code>name</code> property. Once a reference is resolved, its keypath is fixed. Unresolved references are re-evaluated with each call to <code>ractive.set()</code>.</p>\n</div>\n\n<p>If you get stuck, hit the <strong>fix code</strong> button.</p>\n\n<p>Execute the code.</p>","console":"// Once we've rendered our view, we can change the country info\nractive.set( 'country', {\n  name: 'Australia',\n  climate: { temperature: 'hot', rainfall: 'limited' },\n  population: 22620600,\n  capital: { name: 'Canberra', lat: -35.2828, lon: 149.1314 }\n});"},{"template":"<h2>Country profile</h2>\n\n{{#country}}\n  <p>{{name}} is a {{climate.temperature}} country with {{climate.rainfall}} rainfall and a population of {{population}}.</p>\n\n  {{#capital}}\n    <p>The capital city is {{name}} (<a href='https://maps.google.co.uk/maps?q={{lat}},{{lon}}&z=11' target='_blank'>see map</a>).</p>\n  {{/capital}}\n  \n{{/country}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    country: {\n      name: 'The UK',\n      climate: { temperature: 'cold', rainfall: 'excessive' },\n      population: 62641000,\n      capital: { name: 'London', lat: 51.5171, lon: -0.1062 }\n    }\n  }\n});","init":true,"fixed":{"console":"ractive.set( 'country.climate.rainfall', 'very high' );"},"copy":"<h2>Updating nested properties</h2>\n\n<p>Let's say we want to update a nested property. If we'd stored a reference to our <em>model object</em>, we could do it like this:</p>\n\n<pre class='prettyprint lang-js'>\n// we didn't store a reference, so let's do it now\nvar country = ractive.get( 'country' );\n\ncountry.climate.rainfall = 'very high';\nractive.set( 'country', country );\n</pre>\n\n<p><span class='logo'>Ractive</span> will recognise that only the <code>rainfall</code> property has changed, and leave everything else untouched.</p>\n\n<p>But there's an easier way to do it:</p>\n\n<pre class='prettyprint lang-js'>\nractive.set( 'country.climate.rainfall', 'very high' );\n</pre>\n\n<p>Try changing properties via the console. (If you're not from the UK, suitable values for <code>rainfall</code> include 'near-constant', 'unnecessarily high', or 'an unholy amount of'.)</p>"}]},{"title":"Expressions","steps":[{"template":"<p>The population of {{country}} is {{population}}.</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    country: 'the UK',\n    population: 62641000\n  }\n});","init":true,"fixed":{"template":"<p>The population of {{country}} is {{( format(population) )}}.</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    country: 'the UK',\n    population: 62641000,\n    format: function ( num ) {\n      if ( num > 1000000000 ) return ( num / 1000000000 ).toFixed( 1 ) + ' billion';\n      if ( num > 1000000 ) return ( num / 1000000 ).toFixed( 1 ) + ' million';\n      if ( num > 1000 ) return ( Math.floor( num / 1000 ) ) + ',' + ( num % 1000 );\n      return num;\n    }\n  }\n});"},"copy":"<h2>Using expressions</h2>\n\n<p>One problem with the last example &ndash; the population number. Printing out a number like 62641000 (<a href='https://www.google.co.uk/publicdata/explore?ds=d5bncppjof8f9_&ctype=l&strail=false&bcs=d&nselm=h&met_y=sp_pop_totl&scale_y=lin&ind_y=false&rdim=region&idim=country:GBR&ifdim=region&hl=en&dl=en&ind=false&q=uk+population'>the most recent figure for the UK's population</a>) just looks a bit daft.</p>\n\n<p>We <em>could</em> replace the number with a string, like '62.6 million'. But numbers are a hell of a lot easier to work with.</p>\n\n<p>Instead, we can use an <em>expression</em>. Expressions look like regular mustaches, except with parentheses inside the curly braces:</p>\n\n<pre class='prettyprint lang-html'>\n{{( format(population) )}}\n</pre>\n\n<p>Add a <code>format</code> property alongside the country data (it may seem weird adding a function as 'data', but it will make sense in due course!):</p>\n\n<pre class='prettyprint lang-js'>\nfunction ( num ) {\n  if ( num > 1000000000 ) return ( num / 1000000000 ).toFixed( 1 ) + ' billion';\n  if ( num > 1000000 ) return ( num / 1000000 ).toFixed( 1 ) + ' million';\n  if ( num > 1000 ) return ( Math.floor( num / 1000 ) ) + ',' + ( num % 1000 );\n  return num;\n}\n</pre>\n\n<p>Execute the code. Doesn't that look better? Try changing the values via the console.</p>\n\n<div class='hint'>\n\t<p>Note that expressions are not part of the mustache syntax &ndash; they are specific to <span class='logo'>Ractive.js</span>.</p>\n</div>","console":"ractive.set({\n  country: 'China',\n  population: 1344130000\n});"},{"template":"<table>\n\t<tr>\n\t\t<th>Price per {{item}}</th>\n\t\t<th>Quantity</th>\n\t\t<th>Total</th>\n\t</tr>\n\n\t<tr>\n\t\t<td>{{price}}</td>\n\t\t<td>{{quantity}}</td>\n\t\t<td></td> <!-- add the total here -->\n\t</tr>\n</table>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    item: 'pint of milk',\n    price: 0.49,\n    quantity: 5\n  }\n});","init":true,"fixed":{"template":"<table>\n\t<tr>\n\t\t<th>Price per {{item}}</th>\n\t\t<th>Quantity</th>\n\t\t<th>Total</th>\n\t</tr>\n\n\t<tr>\n\t\t<td>{{( format(price) )}}</td>\n\t\t<td>{{quantity}}</td>\n\t\t<td>{{( format( price * quantity ) )}}</td>\n\t</tr>\n</table>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    item: 'pint of milk',\n    price: 0.49,\n    quantity: 5,\n    format: function ( num ) {\n      if ( num < 1 ) return ( 100 * num ) + 'p';\n      return '£' + num.toFixed( 2 );\n    }\n  }\n});"},"copy":"<h2>By the numbers</h2>\n\n<p>You can also use mathematical expressions. Let's rummage around in the bag of contrived examples and see what comes out... yep... this one will do... it's a shopping basket.</p>\n\n<p>We have an <code>item</code> property, a <code>price</code>, and a <code>quantity</code>. Add an expression where the total should go:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;td&gt;{{( price * quantity )}}&lt;/td&gt;\n</pre>\n\n<p>Execute the code. The total should appear. Now we just need to add a currency formatter &ndash; here's one for the UK (if you're not from here, write one for your own currency for extra credit):</p>\n\n<pre class='prettyprint lang-js'>\nfunction ( num ) {\n  if ( num < 1 ) return ( 100 * num ) + 'p';\n  return '£' + num.toFixed( 2 );\n}\n</pre>\n\n<p>Add that, and use in the template it for both the price and the total. Try changing the price and the quantity via the console.</p>\n\n<div class='hint'>\n\t<p>You might reasonably ask how this works. What happens is this: when the template is parsed, any <em>references</em> inside expressions (such as <code>price</code>, <code>quantity</code> or <code>format</code> in the example above) are identified. At render time, as soon as those references can be <em>resolved</em>, the expression is registered as a dependency of each of the <em>keypaths</em> that the references resolve to, and a function is created to evaluate the expression. (Whenever possible, <span class='logo'>Ractive.js</span> will re-use functions &ndash; for example <code>{{( a+b )}}</code> and <code>{{( c+d )}}</code> would share the same function.)</p>\n\n\t<p>When the value of one or more of those dependencies change, the expression is re-evaluated. If the result changes, the DOM is updated.</p>\n</div>","console":"ractive.set({\n  item: 'banana',\n  price: 0.19,\n  qty: 7\n});"},{"template":"<table class='color-mixer'>\n  <tr>\n    <th>Colour</th>\n    <th>Amount</th>\n  </tr>\n\n  <tr>\n    <td>red:</td>\n    <td><div style='background-color: red;\n    \t            width: {{red}}%;'></div></td>\n  </tr>\n\n  <tr>\n    <td>green:</td>\n    <td><div style='background-color: green;\n    \t            width: {{green}}%;'></div></td>\n  </tr>\n\n  <tr>\n    <td>blue:</td>\n    <td><div style='background-color: blue;\n    \t            width: {{blue}}%;'></div></td>\n  </tr>\n\n  <tr>\n    <td><strong>result:</strong></td>\n    <td><div style='background-color: rgb({{red}},\n    \t                                  {{green}},\n    \t                                  {{blue}})'></div></td>\n  </tr>\n</table>","styles":".color-mixer {\n\theight: 100%;\n}\n\n.color-mixer tr:last-child div {\n\twidth: 100%;\n}\n\n.color-mixer th, .color-mixer td {\n\theight: 1em;\n}\n\n.color-mixer th:first-child, .color-mixer td:first-child {\n\ttext-align: right;\n}\n\n.color-mixer th:last-child, .color-mixer td:last-child {\n\twidth: 70%;\n}\n\n.color-mixer div {\n\twidth: 0;\n\tmax-width: 100%;\n\theight: 100%;\n}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    red: 0.45,\n    green: 0.61,\n    blue: 0.2\n  }\n});","init":true,"fixed":{"template":"<table class='color-mixer'>\n  <tr>\n    <th>Colour</th>\n    <th>Amount</th>\n  </tr>\n\n  <tr>\n    <td>red:</td>\n    <td><div style='background-color: red;\n    \t            width: {{( red * 100 )}}%;'></div></td>\n  </tr>\n\n  <tr>\n    <td>green:</td>\n    <td><div style='background-color: green;\n    \t            width: {{( green * 100 )}}%;'></div></td>\n  </tr>\n\n  <tr>\n    <td>blue:</td>\n    <td><div style='background-color: blue;\n    \t            width: {{( blue * 100 )}}%;'></div></td>\n  </tr>\n\n  <tr>\n    <td><strong>result:</strong></td>\n    <td><div style='background-color: rgb({{( Math.round( red   * 255 ) )}},\n    \t                                    {{( Math.round( green * 255 ) )}},\n    \t                                    {{( Math.round( blue  * 255 ) )}})'></div></td>\n  </tr>\n</table>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    red: 0.45,\n    green: 0.61,\n    blue: 0.2\n  }\n});"},"copy":"<h2>Expressions in attributes</h2>\n\n<p>In this next contrived example, we're going to make a colour mixer.</p>\n\n<p>First, we want to show how much we're using of each colour. We'll use <code>&lt;div&gt;</code> elements with a percentage width corresponding to the amount. All the colour values are between 0 and 1, so we need to multiply by 100:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;td&gt;&lt;div style='background-color: red;\n    \t        width: {{( red * 100 )}}%;'&gt;&lt;/div&gt;&lt;/td&gt;\n</pre>\n\n<p>Update the first three <code>&lt;div&gt;</code> elements in the template accordingly.</p>\n\n<p>To show the result, we can use an <code>rgb(r,g,b)</code> CSS colour value. But instead of percentages, these need to be between 0-255:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;div style='background-color: rgb({{( red   * 255 )}},\n    \t                          {{( green * 255 )}},\n    \t                          {{( blue  * 255 )}})'&gt;&lt;/div&gt;\n</pre>\n\n<p>Update the template and execute the code. Did it work?</p>\n\n<p>No, it didn't. That's because CSS insists that you use integers &ndash; no decimals allowed. So let's use <code>Math.round</code> to turn the numbers into integers:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;div style='background-color: rgb({{( Math.round( red   * 255 ) )}},\n    \t                          {{( Math.round( green * 255 ) )}},\n    \t                          {{( Math.round( blue  * 255 ) )}})'&gt;&lt;/div&gt;\n</pre>\n\n<p>Execute the code. Ta-da! Try changing the colours using the console.</p>\n\n<div class='hint'>\n\t<p>The <code>Math</code> object is one of several built-in JavaScript objects you have access to within expressions, alongside <code>Date</code>, <code>Array</code>, <code>encodeURI</code>, <code>parseInt</code>, <code>JSON</code> and various others. Consult the documentation for a full list.</p>\n\n\t<p>Expressions can be as simple or as complex as you like, as long as they only refer to properties of their <em>view model</em> (i.e. the properties on the <code>data</code> object), don't include assignment operators (including <code>++</code> and <code>--</code>), <code>new</code>, <code>delete</code>, <code>void</code>, or <code>this</code>, and don't use function literals.</p>\n</div>","console":"ractive.set( 'red', 1 );\n\n// PSST! Want a sneak preview of something neat? Try using ractive.animate() instead of ractive.set()"}]},{"title":"Event proxies","steps":[{"template":"<button>Activate!</button>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\n// Add the proxy event handler here","init":true,"fixed":{"template":"<button proxy-click='activate'>Activate!</button>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\nractive.on( 'activate', function ( event ) {\n  alert( 'Activating!' );\n});"},"copy":"<h2>Events, dear boy, events</h2>\n\n<p>DOM events are central to anything interactive on the web. You've probably written <code>element.addEventListener( 'click', handler )</code> or <code>$( '#button' ).on( 'click', handler )</code> style code a thousand times.</p>\n\n<p>With <span class='logo'>Ractive.js</span>, you can subscribe to <em>proxy events</em> instead. You declare a proxy event like this...</p>\n\n<pre class='prettyprint lang-html'>\n&lt;button proxy-click='activate'&gt;Activate!&lt;/button&gt;\n</pre>\n\n<p>...and subscribe to it like this:</p>\n\n<pre class='prettyprint lang-js'>\nractive.on( 'activate', function ( event ) {\n  // `this` is the ractive\n  // `event` contains information about the proxy event\n  alert( 'Activating!' );\n});\n</pre>\n\n<p>This is generally more convenient &ndash; you don't need to pepper the DOM with <code>id</code> and <code>class</code> attributes just so you've got a hook to identify elements with, and proxy event names carry meaning about the user's intended action in a way that <code>mouseover</code> and friends don't, making your templates and your code easier to reason about.</p>\n\n<p>Update the template and JavaScript, then execute.</p>\n\n<div class='hint'>\n\t<p>If you use your developer tools to inspect the button, you'll notice that it doesn't have a <code>proxy-click</code> attribute. When <span class='logo'>Ractive.js</span> parses the template, it knows to treat attributes beginning <code>proxy-</code> differently. You'll learn more about parsing in a later tutorial.</p>\n</div>"},{"template":"<button proxy-click='activate'>Activate!</button>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\nractive.on( 'activate', function ( event ) {\n  alert( 'Activating!' );\n});","init":true,"fixed":{"template":"<button proxy-click='activate'>Activate!</button>\n<button proxy-click='deactivate'>Deactivate!</button>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\nractive.on({\n  activate: function () {\n    alert( 'Activating!' );\n  },\n  deactivate: function () {\n    alert( 'Deactivating!' );\n  }\n});"},"copy":"<h2>Subscribing to multiple events</h2>\n\n<p>You can subscribe to multiple proxy events in one go:</p>\n\n<pre class='prettyprint lang-js'>\nractive.on({\n  activate: function () {\n    alert( 'Activating!' );\n  },\n  deactivate: function () {\n    alert( 'Deactivating!' );\n  }\n});\n</pre>\n\n<p>Add a 'deactivate' button and wire it up.</p>","console":"// You can attach multiple handlers to a single proxy event\nractive.on( 'activate', function () {\n  alert( 'I am also activating!' );\n});"},{"template":"<button proxy-click='activate'>Activate!</button>\n<button proxy-click='deactivate'>Deactivate!</button>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\nractive.on({\n  activate: function () {\n    alert( 'Activating!' );\n  },\n  deactivate: function () {\n    alert( 'Deactivating!' );\n  }\n});","init":true,"fixed":{"template":"<button proxy-click='activate'>Activate!</button>\n<button proxy-click='deactivate'>Deactivate!</button>\n<button proxy-click='silence'>Silence!</button>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\nlistener = ractive.on({\n  activate: function () {\n    alert( 'Activating!' );\n  },\n  deactivate: function () {\n    alert( 'Deactivating!' );\n  },\n  silence: function () {\n  \talert( 'No more alerts!' );\n  \tlistener.cancel();\n  }\n});"},"copy":"<h2>Unsubscribing from events</h2>\n\n<p>There are a couple of ways to unsubscribe from events. If you've used jQuery, you'll be used to this syntax:</p>\n\n<pre class='prettypring lang-js'>\nractive.on( 'select', selectHandler );\n\n// later...\nractive.off( 'select', selectHandler );\n</pre>\n\n<p>That's fine, as long as you stored a reference to <code>selectHandler</code> (i.e. you didn't just use an anonymous function). If you didn't, you can also do this:</p>\n\n<pre class='prettypring lang-js'>\nractive.off( 'select' ); // unsubscribes ALL 'select' handlers\nractive.off(); // unsubscribes all handlers of any type\n</pre>\n\n<p>Alternatively, you can do this:</p>\n\n<pre class='prettypring lang-js'>\nvar listener = ractive.on( 'select', selectHandler );\n\nvar otherListeners = ractive.on({\n  activate: function () { alert( 'Activating' ); },\n  dectivate: function () { alert( 'Deactivating!' ); }\n});\n\n// later...\nlistener.cancel();\notherListeners.cancel();\n</pre>\n\n<p>Try adding a 'silence' button which removes the 'activate' and 'deactivate' handlers.</p>\n\n<div class='hint'>\n\t<p>We haven't yet covered <code>ractive.teardown()</code>, which removes your view from the DOM and cleans up after it. However as you'd expect this will remove any event handlers bound with <code>ractive.on()</code>.</p>\n</div>"},{"template":"<button proxy-click='activate'>Activate!</button>\n<button proxy-click='deactivate'>Deactivate!</button>\n<button proxy-click='silence'>Silence!</button>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\nlistener = ractive.on({\n  activate: function () {\n    alert( 'Activating!' );\n  },\n  deactivate: function () {\n    alert( 'Deactivating!' );\n  },\n  silence: function () {\n  \talert( 'No more alerts!' );\n  \tlistener.cancel();\n  }\n});","init":true,"fixed":{"template":"<button proxy-tap='activate'>Activate!</button>\n<button proxy-tap='deactivate'>Deactivate!</button>\n<button proxy-tap='silence'>Silence!</button>"},"copy":"<h2>Custom events</h2>\n\n<p>It's possible to define custom events in <span class='logo'>Ractive.js</span>. Explaining how to <em>create</em> them is outside the scope of this tutorial, but <em>using</em> them is easy:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;button proxy-tap='activate'&gt;Activate!&lt;/button&gt;\n</pre>\n\n<p>Note that we're using <code>proxy-tap</code> here instead of <code>proxy-click</code> &ndash; <code>tap</code> is a custom event.</p>\n\n<p>The trouble with <code>click</code> is that it's nonsense. If you put your mouse down on the 'activate' button, waggle it about, then lift your finger up after a few seconds, the browser will in most cases consider it a 'click'. I don't. Do you?</p>\n\n<p>Furthermore, if your interface needs to work on touch devices, using <code>click</code> means a 300ms delay between the <code>touchstart</code>-<code>touchend</code> sequence event and the simulated <code>mousedown</code>-<code>mouseup</code>-<code>click</code> sequence.</p>\n\n<p>The <code>tap</code> event corrects for both of these anomalies. Try replacing the <code>click</code> proxies in the template.</p>\n\n<div class='hint'>\n\t<p>More custom events (such as cross-browser <code>mouseenter</code>/<code>mouseleave</code> will be added to future versions of <span class='logo'>Ractive.js</span>.</p>\n</div>"},{"template":"<div class='gif-thumbs'>\n\t<img proxy-tap='select' src='files/gifs/css.jpg' data-caption=\"Trying to fix someone else's CSS\">\n\t<img proxy-tap='select' src='files/gifs/problem.jpg' data-caption=\"Trying to work out a problem after the 5th hour\">\n\t<img proxy-tap='select' src='files/gifs/ie.jpg' data-caption=\"Testing interface on Internet Explorer\">\n\t<img proxy-tap='select' src='files/gifs/w3c.jpg' data-caption=\"Trying to code to W3C standards\">\n\t<img proxy-tap='select' src='files/gifs/build.jpg' data-caption=\"Visiting the guy that wrote the build scripts\">\n\t<img proxy-tap='select' src='files/gifs/test.jpg' data-caption=\"I don't need to test that. What can possibly go wrong?\">\n</div>\n\n<div class='gif'>\n\t<p>{{caption}}</p>\n\t<img src='{{gif}}'>\n</div>","styles":".gif-thumbs img {\t\n\twidth: 16.666%;\n\tfloat: left;\n\tborder: 2px solid white;\n\tborder-radius: 0.2em;\n\t\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.gif-thumbs.selected {\n\tborder: 2px solid rgb(114,157,52);\n\tbox-shadow: 1px 1px 3px rgba(114,157,52,0.3);\n}\n\n.gif {\n\tpadding: 0.5em 0 0 0;\n\ttext-align: center;\n\tclear: both;\n}\n\n.gif img {\n\theight: 250px;\n\tmargin: 0 auto;\n}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\nvar selected;\n\nractive.on( 'select', function ( event ) {\n  var node, gif, caption;\n\n  node = event.node;\n  gif = node.src.replace( 'jpg', 'gif' );\n  caption = node.getAttribute( 'data-caption' );\n\n  this.set({\n    gif: gif,\n    caption: caption\n  });\n\n  // deselect previous selection\n  if ( node !== selected && selected && selected.classList ) {\n  \tselected.classList.remove( 'selected' );\n  }\n\n  // select new selection (unless you're in IE\n  // in which case no classList for you. Sucka)\n  if ( node.classList ) {\n    node.classList.add( 'selected' );\n    selected = node;\n  }\n});","init":true,"copy":"<h2>Event delegation relegation</h2>\n\n<p>Because you're a thoughtful and responsible (and probably devastatingly good-looking) web developer, you're in the habit of using <em>event delegation</em> when you have lots of elements the user may interact with.</p>\n\n<p>Just, in case, a quick recap. Event delegation is the technique of adding an event listener to a parent element (such as the <code>&lt;div&gt;</code> in the example on the right) instead of each of its children (the <code>&lt;img&gt;</code> elements), which tests to see if the <em>event target</em> (or any of the nodes between the target and the element to which the handler was attached, if the target isn't a child node thereof) matches a <em>delegate selector</em>.</p>\n\n<p>This is good practice for two reasons. Firstly, it means you're not creating a ton of event handlers. Secondly, if children are added or removed, it causes us no extra work &ndash; we don't need to keep attaching new handlers.</p>\n\n<p>But with <span class='logo'>Ractive.js</span> event delegation is no longer necessary. Only one event handler is created for each proxy event &ndash; that same handler gets reused with multiple elements. And due to the very nature of what we're doing, we don't need to worry about attaching event handlers to new elements &ndash; it's done for us automatically.</p>\n\n<p>This is in fact <em>more</em> efficient than event delegation. Because here's event delegation's dirty little secret &ndash; it often means that many events get processed unnecessarily, and the process of testing child elements to see if they match a selector takes precious cycles, particularly with complex selectors and DOM trees.</p>\n\n<p>This was a long step, so I'm going to reward you with some gifs from <a href='http://devopsreactions.tumblr.com/'>devopsreactions.tumblr.com</a>. Click on the thumbnails to select an image.</p>\n\n<div class='hint'>\n\t<p>You're probably thinking 'there's a lot of repetition in that template. Surely there's a better way!' Yes. Yes there is. We'll learn about it in the next tutorial but one.</p>\n</div>"}]},{"title":"Conditional sections","steps":[{"template":"<!-- message for non-signed-in users -->\n<p>Hi there! Please <a class='button' proxy-tap='signIn'>sign in</a></p>\n\n<!-- message for signed-in users -->\n<p>Welcome back, {{username}}!</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    signedIn: false,\n    notSignedIn: true\n  }\n});\n\nractive.on( 'signIn', function () {\n  var name = prompt( 'Enter your username to sign in', 'ractive_fan' );\n\n  ractive.set({\n    username: name,\n    signedIn: true,\n    notSignedIn: false\n  });\n});","init":true,"fixed":{"template":"{{#notSignedIn}}\n  <!-- message for non-signed-in users -->\n  <p>Hi there! Please <a class='button' proxy-tap='signIn'>sign in</a></p>\n{{/notSignedIn}}\n\n{{#signedIn}}\n  <!-- message for signed-in users -->\n  <p>Welcome back, {{username}}!</p>\n{{/signedIn}}"},"copy":"<h2>If this then that</h2>\n\n<p>Often, you want to show or hide part of your view depending on whether a particular condition is met. For example you might want to show a slightly different view to users depending on whether they're signed in or not.</p>\n\n<p>In this example we've already set up a mock sign-in mechanism &ndash; click the 'sign in' button and enter your name in the prompt.</p>\n\n<p>All we need to do is hide the 'please sign in' message when we're signed in, and the 'welcome back!' message when we're not.</p>\n\n<p>Wrap the first block in a conditional section that uses the <code>notSignedIn</code> property:</p>\n\n<pre class='prettyprint lang-html'>\n{{#notSignedIn}}\n  &lt;!-- message for non-signed-in users --&gt;\n  &lt;p&gt;Hi there! Please &lt;a class='button' proxy-tap='signIn'&gt;sign in&lt;/a&gt;.&lt;/p&gt;\n{{/notSignedIn}}\n</pre>\n\n<p>Now do the same for the other block, except with the <code>signedIn</code> property. Execute the code.</p>"},{"template":"{{#notSignedIn}}\n  <!-- message for non-signed-in users -->\n  <p>Hi there! Please <a class='button' proxy-tap='signIn'>sign in</a></p>\n{{/notSignedIn}}\n\n{{#signedIn}}\n  <!-- message for signed-in users -->\n  <p>Welcome back, {{username}}!</p>\n{{/signedIn}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    signedIn: false,\n    notSignedIn: true\n  }\n});\n\nractive.on( 'signIn', function () {\n  var name = prompt( 'Enter your username to sign in', 'ractive_fan' );\n\n  ractive.set({\n    username: name,\n    signedIn: true,\n    notSignedIn: false\n  });\n});","init":true,"fixed":{"template":"{{^signedIn}}\n  <!-- message for non-signed-in users -->\n  <p>Hi there! Please <a class='button' proxy-tap='signIn'>sign in</a></p>\n{{/signedIn}}\n\n{{#signedIn}}\n  <!-- message for signed-in users -->\n  <p>Welcome back, {{username}}!</p>\n{{/signedIn}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    signedIn: false\n  }\n});\n\nractive.on( 'signIn', function () {\n  var name = prompt( 'Enter your username to sign in', 'ractive_fan' );\n\n  ractive.set({\n    username: name,\n    signedIn: true\n  });\n});"},"copy":"<h2>If this then NOT that</h2>\n\n<p>Having two properties (<code>signedIn</code> and <code>notSignedIn</code>) to represent one piece of data (whether or not the user is signed in) is the sort of thing that makes most programmers itch uncontrollably.</p>\n\n<p>Fortunately mustache has us covered. We can use an <em>inverted section</em>:</p>\n\n<pre class='prettyprint lang-html'>\n{{^signedIn}}&lt;!-- not-signed-in block --&gt;{{/signedIn}}\n</pre>\n\n<p>Replace the <code>{{#notSignedIn}}</code> section with a <code>{{^signedIn}}</code> section. Then, remove the references to <code>notSignedIn</code> in the JavaScript. Then breathe a sigh of relief &ndash; doesn't that feel better?</p>"},{"template":"{{^signedIn}}\n  <!-- message for non-signed-in users -->\n  <p>Hi there! Please <a class='button' proxy-tap='signIn'>sign in</a></p>\n{{/signedIn}}\n\n{{#signedIn}}\n  <!-- message for signed-in users -->\n  <p>Welcome back, {{username}}!</p>\n{{/signedIn}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    signedIn: false\n  }\n});\n\nractive.on( 'signIn', function () {\n  var name = prompt( 'Enter your username to sign in', 'ractive_fan' );\n\n  ractive.set({\n    username: name,\n    signedIn: true\n  });\n});","init":true,"fixed":{"template":"{{^user}}\n  <!-- message for non-signed-in users -->\n  <p>Hi there! Please <a class='button' proxy-tap='signIn'>sign in</a></p>\n{{/user}}\n\n{{#user}}\n  <!-- message for signed-in users -->\n  <p>Welcome back, {{name}}!</p>\n{{/user}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});\n\nractive.on( 'signIn', function () {\n  var name = prompt( 'Enter your username to sign in', 'ractive_fan' );\n  ractive.set( 'user.name', name );\n});"},"copy":"<h2>True or false?</h2>\n\n<p>In fact, we can be even more efficient. The condition in a conditional section doesn't have to be <code>true</code> or <code>false</code> &ndash; instead it is evaluated as <em>truthy</em> or <em>falsy</em>.</p>\n\n<p>Let's stipulate that the <code>user</code> property only exists if a user is signed in, and that if they are signed in, <code>user</code> is an object with a <code>name</code> property.</p>\n\n<p>Edit the sign-in code accordingly:</p>\n\n<pre class='prettyprint lang-js'>\nractive.on( 'signIn', function () {\n  var name = prompt( 'Enter your username to sign in', 'ractive_fan' );\n  ractive.set( 'user.name', name });\n});\n</pre>\n\n<div class='hint'>\n\t<p>Here, we're setting a property on an object that doesn't exist yet. That's fine &ndash; <span class='logo'>Ractive.js</span> will create the object. If we'd done <code>ractive.set( 'user[0]', name )</code> or <code>ractive.set( 'user.0', name )</code> it would assume we wanted to create an array instead of an object.</p>\n</div>\n\n<p>Initially, <code>user</code> will be <code>undefined</code>, but once someone signs in, <code>user</code> will be an object. Since <code>undefined</code> is falsy and objects are always truthy, we can use <code>user</code> instead of <code>signedIn</code>.</p>\n\n<p>Update the template accordingly, discarding <code>signedIn</code> in favour of <code>user</code>. Notice that <code>{{#user}}</code> isn't just a conditional section any more &ndash; it's also a <em>context section</em>. So we can use the <code>{{name}}</code> property in our 'welcome back!' message.</p>\n\n<p>Execute the code.</p>\n\n<div class='hint'>\n\t<p>In JavaScript, the following values are falsy: <code>undefined</code>, <code>null</code>, <code>NaN</code>, <code>0</code>, <code>\"\"</code> (the empty string), and <code>false</code>.</p>\n\n\t<p>However in mustache, there is a special case &ndash; arrays with a length of 0 are treated as falsy. This will make sense when we tackle list sections in the next tutorial.</p>\n</div>"}]},{"title":"List sections","styles":".superheroes {\n\tborder: 1px solid rgb(210,210,210);\n\tborder: 1px solid rgba(0,0,0,0.3);\n\tbox-shadow: 1px 1px 4px rgba(0,0,0,0.2);\n\tborder-radius: 2px;\n}\n\n.superheroes td, .superheroes th {\n\tpadding: 0.5em !important;\n\ttext-align: left;\n}\n\nth {\n\tbackground-color: rgba(0,0,0,0.7);\n\tcolor: rgba(255,255,255,0.9);\n\t\n\t-webkit-user-select: none;\n\t-moz-user-select: none;\n\t-ms-user-select: none;\n\tuser-select: none;\n}\n\ntd {\n\tbackground-color: rgba(255,255,255, 0.7);\n\tborder-bottom: 1px solid rgba(0,0,0,0.1);\n}\n\ntd a {\n\tfont-weight: bold;\n}\n\ntr:last-child td {\n\tborder-bottom: none;\n}\n\nth.sortable {\n\tposition: relative;\n\tpadding-left: 1.5em !important;\n\tcursor: pointer;\n\twidth: 33.3%;\n}\n\n.sortable:before {\n\tposition: absolute;\n\tleft: 0.5em;\n\ttop: 50%;\n\tline-height: 0;\n\tcontent: '\\25bd';\n\tfont-size: 0.7em;\n\tcolor: rgba(255,255,255,0.3);\n}\n\n.sorted:before {\n\tcontent: '\\25bc';\n\tcolor: rgba(255,255,255,0.9);\n}","steps":[{"template":"<table class='superheroes'>\n  <tr>\n    <th>Superhero name</th>\n    <th>Real name</th>\n    <th>Superpower</th>\n  </tr>\n\n  <tr>\n  \t<td></td>\n  \t<td></td>\n  \t<td></td>\n  </tr>\n</table>","javascript":"var ractive, xmen;\n\n// define our superheroes\nxmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation',    info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',      info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',     info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: { superheroes: xmen }\n});","init":true,"fixed":{"template":"<table class='superheroes'>\n  <tr>\n    <th>Superhero name</th>\n    <th>Real name</th>\n    <th>Superpower</th>\n  </tr>\n\n  {{#superheroes}}\n    <tr>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/superheroes}}\n</table>"},"copy":"<h2>Working with lists</h2>\n\n<p>Lists of data, of some form or another, are often at the heart of webapps. In this tutorial we're going to build a sortable table of superheroes, using data taken from <a href='http://www.superherodb.com'>superherodb.com</a>.</p>\n\n<p>We've already got an array of objects representing four of the X-Men, over there on the right. We just need to update the template.</p>\n\n<p>Begin by wrapping the second <code>&lt;tr&gt;</code> in a section:</p>\n\n<pre class='prettyprint lang-html'>\n{{#superheroes}}\n&lt;tr&gt;\n  &lt;!-- row content --&gt;\n&lt;/tr&gt;\n{{/superheroes}}\n</pre>\n\n<p>Then, insert mustaches representing each of the three properties in the table &ndash; <code>name</code>, <code>realname</code> and <code>power</code>. For extra credit, wrap the name in a link pointing to the <code>info</code> URL.</p>\n\n<p>Execute the code. As ever, you can interact with the result via the console.</p>","console":"// You can use array notation to update the data:\nractive.set( 'superheroes[1].power', 'Martial arts' );\n\n// Or, you can use dot notation. Whichever you prefer:\nractive.set( 'superheroes.3.power', 'Enhanced senses' );"},{"template":"<table class='superheroes'>\n  <tr>\n    <th>Superhero name</th>\n    <th>Real name</th>\n    <th>Superpower</th>\n  </tr>\n\n  {{#superheroes}}\n    <tr>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/superheroes}}\n</table>","javascript":"var ractive, xmen;\n\n// define our superheroes\nxmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation', info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',   info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',  info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: { superheroes: xmen }\n});","init":true,"fixed":{"template":"<table class='superheroes'>\n  <tr>\n    <th>#</th>\n    <th>Superhero name</th>\n    <th>Real name</th>\n    <th>Superpower</th>\n  </tr>\n\n  {{#superheroes:num}}\n    <tr>\n      <td>{{( num + 1 )}}</td>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/superheroes}}\n</table>","javascript":"var ractive, xmen;\n\n// define our superheroes\nxmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation', info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',   info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',  info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: { superheroes: xmen }\n});"},"copy":"<h2>Finding the index</h2>\n\n<p>Often when working with lists, we want to know the <em>index</em> of the list item we're currently rendering.</p>\n\n<p>Mustache doesn't have a good way of doing this, so <span class='logo'>Ractive.js</span> introduces the <em>index reference</em>:</p>\n\n<pre class='prettyprint lang-html'>\n{{#list:num}}\n  &lt;!-- inside here, {{num}} is the index --&gt;\n{{/list}}\n</pre>\n\n<p>By declaring <code>num</code> to be an index reference, we can use it the same way we'd use any other variable. Let's add a number column to our table &ndash; first add the column to the header row:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;tr&gt;\n  &lt;th&gt;#&lt;/th&gt;\n  &lt;th&gt;Superhero name&lt;/th&gt;\n  &lt;!-- etc --&gt;\n&lt;/tr&gt;\n</pre>\n\n<p>Then to the list row:</p>\n\n<pre class='prettyprint lang-html'>\n{{#superheroes:num}}\n  &lt;tr&gt;\n    &lt;td&gt;{{num}}&lt;/td&gt;\n    &lt;td&gt;&lt;a href='{{info}}'&gt;{{name}}&lt;/a&gt;&lt;/td&gt;\n    &lt;td&gt;{{realname}}&lt;/td&gt;\n    &lt;td&gt;{{power}}&lt;/td&gt;\n  &lt;/tr&gt;\n{{/superheroes}}\n</pre>\n\n<p>Execute the code.</p>\n\n<p>Not bad, but it would look better if the numbers started at 1 rather than 0. Use an expression to increment each row number by 1.</p>"},{"template":"<table class='superheroes'>\n  <tr>\n    <th>#</th>\n    <th>Superhero name</th>\n    <th>Real name</th>\n    <th>Superpower</th>\n  </tr>\n\n  {{#superheroes:num}}\n    <tr>\n      <td>{{( num + 1 )}}</td>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/superheroes}}\n</table>","javascript":"var ractive, xmen;\n\n// define our superheroes\nxmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation', info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',   info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',  info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: { superheroes: xmen }\n});","init":true,"fixed":{"console":"var newSuperhero = {\n  name: 'Storm',\n  realname: 'Monroe, Ororo',\n  power: 'Controlling the weather',\n  info: 'http://www.superherodb.com/Storm/10-135/'\n};\n\nxmen.push( newSuperhero );"},"copy":"<h2>Modifying lists</h2>\n\n<p>Let's say you wanted to add an item to your list. You could use <code>ractive.set()</code> the way you're used to, but you have to find the length of the existing array first:</p>\n\n<pre class='prettyprint lang-js'>\nvar index = ractive.get( 'superheroes' ).length;\nractive.set( 'superheroes[' + index + ']', newSuperhero );\n</pre>\n\n<p>That's not ideal. We <em>could</em> use <code>ractive.update( 'superheroes' )</code> instead, which will make sure that the view is up to date:</p>\n\n<pre class='prettyprint lang-js'>\nxmen[ xmen.length ] = newSuperhero;\nractive.update( 'superheroes' );\n</pre>\n\n<div class='hint'>\n\t<p>If you don't pass a keypath argument to <code>ractive.update()</code>, <span class='logo'>Ractive.js</span> will update everything that has changed since the last set or update.</p>\n</div>\n\n<p>But there's a more convenient way. <span class='logo'>Ractive.js</span> wraps the <em>mutator methods</em> of arrays (<code>push</code>, <code>pop</code>, <code>shift</code>, <code>unshift</code>, <code>splice</code>, <code>sort</code> and <code>reverse</code>) so that they trigger view updates automatically:</p>\n\n<pre class='prettyprint lang-js'>\nxmen.push( newSuperhero );\n</pre>\n\n<p>Try running this code in the console &ndash; we've already defined our new superhero.</p>\n\n<div class='hint'>\n\t<p>If you'd rather <span class='logo'>Ractive.js</span> didn't modify arrays like this, you can disable the behaviour by passing in <code>modifyArrays: false</code> at initialisation. But don't worry &ndash; we're not touching the Array prototype.</p>\n</div>","console":"var newSuperhero = {\n  name: 'Storm',\n  realname: 'Monroe, Ororo',\n  power: 'Controlling the weather',\n  info: 'http://www.superherodb.com/Storm/10-135/'\n};\n\n// add Storm to the list"},{"template":"<table class='superheroes'>\n  <tr>\n    <th>#</th>\n    <th class='sortable'>Superhero name</th>\n    <th class='sortable'>Real name</th>\n    <th class='sortable'>Superpower</th>\n  </tr>\n\n  {{#superheroes:num}}\n    <tr>\n      <td>{{( num + 1 )}}</td>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/superheroes}}\n</table>","javascript":"var ractive, xmen;\n\n// define our superheroes\nxmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation', info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',   info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',  info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: { superheroes: xmen }\n});","init":true,"fixed":{"template":"<table class='superheroes'>\n  <tr>\n    <th>#</th>\n    <th class='sortable' proxy-tap='sort:name'>Superhero name</th>\n    <th class='sortable' proxy-tap='sort:realname'>Real name</th>\n    <th class='sortable' proxy-tap='sort:power'>Superpower</th>\n  </tr>\n\n  {{#superheroes:num}}\n    <tr>\n      <td>{{( num + 1 )}}</td>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/superheroes}}\n</table>","javascript":"// define our superheroes\nvar xmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation', info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',   info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',  info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nvar ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { superheroes: xmen }\n});\n\nractive.on( 'sort', function ( event, column ) {\n  alert( 'Sorting by ' + column );\n});"},"copy":"<h2>Making it sortable (part 1)</h2>\n\n<p>It's time to make our table sortable. We've added a 'sortable' class to the three headers to indicate they can be clicked on.</p>\n\n<p>First, let's add a proxy <code>sort</code> event to each column header, specifying the column header as an event argument:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;th class='sortable' proxy-tap='sort:name'&gt;Superhero name&lt;/th&gt;\n&lt;th class='sortable' proxy-tap='sort:realname'&gt;Real name&lt;/th&gt;\n&lt;th class='sortable' proxy-tap='sort:power'&gt;Superpower&lt;/th&gt;\n</pre>\n\n<p>That way, when the user taps one of the column headers, the view will fire a <code>sort</code> event.</p>\n\n<pre class='prettyprint lang-js'>\nractive.on( 'sort', function ( event, column ) {\n  alert( 'Sorting by ' + column );\n});\n</pre>\n\n<p>Execute the code. When you tap on the three sortable headers, the browser should alert the name of the column we're sorting by. Now we just need to add the sorting logic.</p>\n","console":""},{"template":"<table class='superheroes'>\n  <tr>\n    <th>#</th>\n    <th class='sortable' proxy-tap='sort:name'>Superhero name</th>\n    <th class='sortable' proxy-tap='sort:realname'>Real name</th>\n    <th class='sortable' proxy-tap='sort:power'>Superpower</th>\n  </tr>\n\n  {{#superheroes:num}}\n    <tr>\n      <td>{{( num + 1 )}}</td>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/superheroes}}\n</table>","javascript":"// define our superheroes\nvar xmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation', info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',   info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',  info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nvar ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    superheroes: xmen,\n    sort: function ( array, sortColumn ) {\n      // add sorting logic here\n      return array;\n    }\n  }\n});\n\nractive.on( 'sort', function ( event, column ) {\n  alert( 'Sorting by ' + column );\n});","init":true,"fixed":{"template":"<table class='superheroes'>\n  <tr>\n    <th>#</th>\n    <th class='sortable {{( sortColumn === \"name\"     ? \"sorted\" : \"\" )}}' proxy-tap='sort:name'>Superhero name</th>\n    <th class='sortable {{( sortColumn === \"realname\" ? \"sorted\" : \"\" )}}' proxy-tap='sort:realname'>Real name</th>\n    <th class='sortable {{( sortColumn === \"power\"    ? \"sorted\" : \"\" )}}' proxy-tap='sort:power'>Superpower</th>\n  </tr>\n\n  {{#( sort( superheroes, sortColumn ) ) :num}}\n    <tr>\n      <td>{{( num + 1 )}}</td>\n      <td><a href='{{info}}'>{{name}}</a></td>\n      <td>{{realname}}</td>\n      <td>{{power}}</td>\n    </tr>\n  {{/()}}\n</table>","javascript":"// define our superheroes\nvar xmen = [\n  { name: 'Nightcrawler', realname: 'Wagner, Kurt',     power: 'Teleportation', info: 'http://www.superherodb.com/Nightcrawler/10-107/' },\n  { name: 'Cyclops',      realname: 'Summers, Scott',   power: 'Optic blast',   info: 'http://www.superherodb.com/Cyclops/10-50/' },\n  { name: 'Rogue',        realname: 'Marie, Anna',      power: 'Absorbing powers', info: 'http://www.superherodb.com/Rogue/10-831/' },\n  { name: 'Wolverine',    realname: 'Howlett, James',   power: 'Regeneration',  info: 'http://www.superherodb.com/Wolverine/10-161/' }\n];\n\nvar ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    superheroes: xmen,\n    sort: function ( array, column ) {\n      array = array.slice(); // clone, so we don't modify the underlying data\n      \n      return array.sort( function ( a, b ) {\n        return a[ column ] < b[ column ] ? -1 : 1;\n      });\n    },\n    sortColumn: 'name'\n  }\n});\n\nractive.on( 'sort', function ( event, column ) {\n  this.set( 'sortColumn', column );\n});"},"copy":"<h2>Making it sortable (part 2)</h2>\n\n<p>So we've wired up our event handler, and it's behaving as it should. The next step is to add some logic that actually sorts the table. For bonus points, we'll add a 'sorted' class to the header of the sorted column.</p>\n\n<p>There's a nice easy way to ensure that the table remains sorted, even when we add more data: an expression. That's right, you can use expressions with sections.</p>\n\n<p>Update the template:</p>\n\n<pre class='prettyprint lang-html'>\n{{#( sort(superheroes, sortColumn) ) :num}}\n  &lt;tr&gt;\n   &lt;!-- row contents --&gt;\n  &lt;/tr&gt;\n{{/()}}\n</pre>\n\n<p>Notice that the section <code>#</code> character and the index reference both sit outside the expression in parentheses, and that the section is closed with <code>{{/()}}</code>.</p> \n\n<p>Now we need to add the <code>sort</code> function. Here's one (if you're not sure why this works, <a href='https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/sort'>here's an MDN page</a> that will help explain):</p>\n\n<pre class='prettyprint lang-js'>\nfunction ( array, sortColumn ) {\n  array = array.slice(); // clone, so we don't modify the underlying data\n  \n  return array.sort( function ( a, b ) {\n    return a[ sortColumn ] < b[ sortColumn ] ? -1 : 1;\n  });\n}\n</pre>\n\n<p>Wiring it up is easy:</p>\n\n<pre class='prettyprint lang-js'>\nractive.on( 'sort', function ( event, column ) {\n  this.set( 'sortColumn', column );\n});\n</pre>\n\n<p>Try executing this code. Aaargh! It doesn't work!</p>\n\n<p>No, it doesn't. That's because we haven't initialised <code>sortColumn</code> &ndash; without it, the expression can't evaluate. Add <code>sortColumn: 'name'</code> to <code>data</code> and try again.</p>\n\n<p>The last job is to add a <code>sorted</code> class to the header of the currently sorted column. There are several ways we could do this &ndash; you could use a bit of jQuery inside the <code>sort</code> proxy event handler, for example. But for this demonstration we'll put the logic in the template, using the conditional operator:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;th class='sortable {{( sortColumn === \"name\" ? \"sorted\" : \"\" )}}' proxy-tap='sort' data-column='name'&gt;Superhero name&lt;/th&gt;\n</pre>\n\n<p>Do this for each of the headers, then execute the code. Congratulations! You've built a sortable table in just a few steps. Now comes the fun part &ndash; add Storm back to the table via the console. The table will maintain its sort order.</p>","console":"var newSuperhero = {\n  name: 'Storm',\n  realname: 'Monroe, Ororo',\n  power: 'Controlling the weather',\n  info: 'http://www.superherodb.com/Storm/10-135/'\n};\n\nxmen.push( newSuperhero );"}]},{"title":"Triples (embedded HTML)","steps":[{"template":"<p>This is a normal mustache: {{content}}</p>\n<p>And this is a triple mustache: {{{content}}}</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    content: '<strong>Spot the difference?</strong>'\n  }\n});","init":true,"copy":"<h2>Introducing the triple-stache</h2>\n\n<p>Ordinarily in a template, mustaches stand in for data. But occasionally you need to insert chunks of HTML into your view &ndash; for that, we have the triple-stache: <code>{{{content}}}</code>.</p>\n\n<p>In fact, you're looking at the work of a triple-stache right now &ndash; this whole tutorial is one big Ractive, and the HTML for this explanatory text is represented by a triple.</p>\n\n<p>Try running the code in the console.</p>\n\n<div class='hint'>\n\t<p>That was a short tutorial! When using triples, bear in mind that when their data changes, the nodes they represent must be removed from the DOM before being re-rendered and reinserted. For that reason, you shouldn't use triples where regular mustaches will do the same job &ndash; <span class='logo'>Ractive.js</span> is able to operate more efficiently with mustaches.</p>\n</div>","console":"ractive.set( 'content', '<a href=\"http://bit.ly/QOyWC1\"><img src=\"files/gifs/image.gif\"/></a>' );"}]},{"title":"Extending Ractive","styles":".slideshow {\n\tposition: relative;\n\twidth: 100%;\n\theight: 100%;\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n\tpadding: 0 0 3em 0;\n\tbackground-color: #f4f4f4;\n}\n\n.main {\n\tposition: relative;\n\twidth: 100%;\n\theight: 100%;\n\tpadding: 0 2em;\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.prev, .next {\n\tposition: absolute;\n\ttop: 0;\n\twidth: 2em;\n\theight: 100%;\n\ttext-align: center;\n\tcursor: pointer;\n\t\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n\t\n\t-webkit-user-select: none;\n\t-moz-user-select: none;\n\t-ms-user-select: none;\n\tuser-select: none;\n}\n\n.prev:hover, .next:hover {\n\tbackground-color: #eee;\n}\n\n.prev span, .next span {\n\tposition: absolute;\n\ttop: 50%;\n\twidth: 100%;\n\tdisplay: block;\n\tline-height: 0;\n\ttext-align: center;\n\tfont-size: 1.6em;\n\tfont-family: Arial;\n\tcolor: #aaa;\n}\n.prev {\n\tleft: 0;\n\tborder-right: 1px solid #ddd;\n}\n\n.next {\n\tright: 0;\n\tborder-left: 1px solid #ddd;\n}\n\n.main-image {\n\twidth: 100%;\n\theight: 100%;\n\tbackground: #f4f4f4 no-repeat 50% 50%;\n\tbackground-size: contain;\n}\n\n.caption {\n\tposition: absolute;\n\twidth: 100%;\n\theight: 3em;\n\tleft: 0;\n\tbottom: 0;\n\ttext-align: center;\n\tbackground-color: white;\n}","steps":[{"template":"<div class='slideshow'>\n\t<div class='main'>\n\t\t<a class='prev'><span>&laquo;</span></a>\n\t\t<div class='main-image' style='background-image: url();'></div>\n\t\t<a class='next'><span>&raquo;</span></a>\n\t</div>\n\n\t<div class='caption'>\n\t\t<p></p>\n\t</div>\n</div>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    // placeholder image data\n    image: {\n      src: 'files/gifs/problem.gif',\n      caption: 'Trying to work out a problem after the 5th hour'\n    }\n  }\n});","init":true,"fixed":{"template":"<div class='slideshow'>\n\t<div class='main'>\n\t\t<a class='prev' proxy-tap='prev'><span>&laquo;</span></a>\n\t\t<div class='main-image' style='background-image: url({{image.src}});'></div>\n\t\t<a class='next' proxy-tap='next'><span>&raquo;</span></a>\n\t</div>\n\n\t<div class='caption'>\n\t\t<p>{{image.caption}}</p>\n\t</div>\n</div>"},"copy":"<h2>Stay classy</h2>\n\n<p>If you've used Backbone Views in the past, you'll be familiar with the basic concept of <em>extending</em> the <em>base class</em> to create a new <em>subclass</em> with default data and additional methods.</p>\n\n<p>In this tutorial we're going to learn about <code>Ractive.extend</code> and use it to create an image slideshow, using the <a href='http://devopsreactions.tumblr.com/'>devopsreactions.tumblr.com</a> gifs from the <a href='#!/event-proxies/5'>final step of the Event Proxies tutorial</a>. </p>\n\n<p>We've got our basic template set up &ndash; we just need to make a few additions. First, we need to add a mustache for the image URL:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;div class='main-image' style='background-image: url({{image.src}});'&gt;&lt;/div&gt;\n</pre>\n\n<div class='hint'>\n\t<p>We're using a CSS background rather than an <code>img</code> element for this example, because you can use the <code>background-size: contain</code> CSS rule to ensure that the image is shown at maximum size without distorting the aspect ratio. (Unless you're using IE8, in which case get out. Go on, leave.)</p>\n</div>\n\n<p>Then, we need to add a mustache for the image caption:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;div class='caption'&gt;\n  &lt;p&gt;{{caption}}&lt;/p&gt;\n&lt;/div&gt;\n</pre>\n\n<p>Finally, let's add some proxy events that we can wire up later:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;a class='prev' proxy-tap='prev'&gt;&lt;span&gt;&amp;laquo;&lt;/span&gt;&lt;/a&gt;\n&lt;!-- ... --&gt;\n&lt;a class='next' proxy-tap='next'&gt;&lt;span&gt;&amp;raquo;&lt;/span&gt;&lt;/a&gt;\n</pre>\n\n<p>Execute the JavaScript to redraw the view, with some placeholder data.</p>","console":"ractive.set( 'image', {\n  src: 'files/gifs/css.gif',\n  caption: 'Trying to fix someone else\\'s CSS'\n});"},{"template":"<div class='slideshow'>\n\t<div class='main'>\n\t\t<a class='prev' proxy-tap='prev'><span>&laquo;</span></a>\n\t\t<div class='main-image' style='background-image: url({{image.src}});'></div>\n\t\t<a class='next' proxy-tap='next'><span>&raquo;</span></a>\n\t</div>\n\n\t<div class='caption'>\n\t\t<p>{{image.caption}}</p>\n\t</div>\n</div>","javascript":"var Slideshow = Ractive.extend({\n  // subclass methods and properties go here\n});\n\nvar slideshow = new Slideshow({\n  // instance options go here\n});","fixed":{"javascript":"var Slideshow = Ractive.extend({\n  template: template,\n  \n  // method for changing the currently displayed image\n  goto: function ( imageNum ) {\n    // make sure the image number is between 0...\n    while ( imageNum < 0 ) {\n      imageNum += this.images.length;\n    }\n\n    // and the maximum\n    imageNum = imageNum % this.images.length;\n\n    // update the view\n    this.set( 'image', this.images[ imageNum ] );\n    this.currentImage = imageNum;\n  },\n\n  // initialisation code\n  init: function ( options ) {\n    var self = this;\n\n    this.images = options.images;\n\n    this.on({\n      prev: function () { self.goto( self.currentImage - 1 ); },\n      next: function () { self.goto( self.currentImage + 1 ); }\n    });\n\n    this.goto( 0 ); // start with the first image\n  }\n});\n\nvar slideshow = new Slideshow({\n  el: output,\n  images: [\n    { src: 'files/gifs/problem.gif', caption: 'Trying to work out a problem after the 5th hour' },\n    { src: 'files/gifs/css.gif', caption: 'Trying to fix someone else\\'s CSS' },\n    { src: 'files/gifs/ie.gif', caption: 'Testing interface on Internet Explorer' },\n    { src: 'files/gifs/w3c.gif', caption: 'Trying to code to W3C standards' },\n    { src: 'files/gifs/build.gif', caption: 'Visiting the guy that wrote the build scripts' },\n    { src: 'files/gifs/test.gif', caption: 'I don\\'t need to test that. What can possibly go wrong?' }\n  ]\n});"},"copy":"<h2>Creating a Slideshow class</h2>\n\n<p>Time to create our <code>Slideshow</code> class:</p>\n\n<pre class='prettyprint lang-js'>\nvar Slideshow = Ractive.extend({\n  template: template, // this will be applied to all Slideshow instances\n  \n  // method for changing the currently displayed image\n  goto: function ( imageNum ) {\n    // goto method goes here...\n  },\n\n  // initialisation code\n  init: function ( options ) {\n    // initialisation code goes here...\n  }\n});\n</pre>\n\n<p>Each <code>Slideshow</code> instance will have a <code>goto</code> method in addition to the normal <code>Ractive</code> instance methods. Any set-up work we need to do can happen in the <code>init</code> method, which gets called as soon as the template has been rendered.</p>\n\n<p>Let's write our <code>goto</code> method:</p>\n\n<pre class='prettyprint lang-js'>\nfunction ( imageNum ) {\n  // make sure the image number is between 0...\n  while ( imageNum < 0 ) {\n    imageNum += this.images.length;\n  }\n\n  // and the maximum\n  imageNum = imageNum % this.images.length;\n\n  // update the view\n  this.set( 'image', this.images[ imageNum ] );\n  this.currentImage = imageNum;\n}\n</pre>\n\n<p>This method presupposes the existence of <code>this.images</code>. We can add this property, as well as the proxy event handling code, in our <code>init</code> method:</p>\n\n<pre class='prettyprint lang-js'>\nfunction ( options ) {\n  var self = this;\n\n  this.images = options.images;\n\n  this.on({\n    prev: function () { self.goto( self.currentImage - 1 ); },\n    next: function () { self.goto( self.currentImage + 1 ); }\n  });\n\n  this.goto( 0 ); // start with the first image\n}\n</pre>\n\n<p>Let's add some code to instantiate the slideshow with our gifs:</p>\n\n<pre class='prettyprint lang-js'>\nvar slideshow = new Slideshow({\n  el: output,\n  images: [\n    { src: 'files/gifs/problem.gif', caption: 'Trying to work out a problem after the 5th hour' },\n    { src: 'files/gifs/css.gif', caption: 'Trying to fix someone else\\'s CSS' },\n    { src: 'files/gifs/ie.gif', caption: 'Testing interface on Internet Explorer' },\n    { src: 'files/gifs/w3c.gif', caption: 'Trying to code to W3C standards' },\n    { src: 'files/gifs/build.gif', caption: 'Visiting the guy that wrote the build scripts' },\n    { src: 'files/gifs/test.gif', caption: 'I don\\'t need to test that. What can possibly go wrong?' }\n  ]\n});\n</pre>\n\n<p>Go ahead and execute the code &ndash; you should now have a working slideshow.</p>\n\n<div class='hint'>\n  <p>Needless to say, you could add as many bells and whistles as you wanted &ndash; fading or sliding transitions, image preloading, thumbnails, touchscreen gesture controls, and so on.</p>\n\n  <p>You could, of course, just use an existing image slideshow library. But then you would have to learn that library, and potentially submit to its design philosophy.</p>\n\n  <p><span class='logo'>Ractive.js</span> is all about flexibility. If you want to change the design or behaviour of a component (say, adding a class name to a particular element), the power to do so is in your hands &ndash; the template is easy to understand and tweak because it's basically just HTML, and the view logic is straightforward.</p>\n\n  <p>It's better to be able to build your own solution than to rely on developers maintaining high quality and up-to-date documentation.</p>\n</div>","console":"slideshow.goto( 3 );"}]},{"title":"Two-way binding","steps":[{"template":"<label>Enter your name: <input></label>\n<p>Hello, {{name}}!</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});","init":true,"fixed":{"template":"<label>Enter your name: <input value='{{name}}'></label>\n<p>Hello, {{name}}!</p>"},"copy":"<h2>Responding to user input</h2>\n\n<p>The 'Hello world!' of two-way data binding looks like this:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;label&gt;Enter your name: &lt;input value='{{name}}'&gt;&lt;/label&gt;\n&lt;p&gt;Hello, {{name}}!&lt;/p&gt;\n</pre>\n\n<p>Update the template and re-render it, then type your name in the box.</p>\n\n<div class='hint'>\n\t<p>Internally, we're binding to <code>input</code> and <code>key(up|down|press)</code> events alongside <code>change</code> and <code>blur</code> events &ndash; this ensures instantaneous feedback for a slick experience.</p>\n\n\t<p>If you'd rather the updates only happened on <code>change</code> and <code>blur</code> events, pass in <code>lazy: true</code> as an initialisation option.</p>\n\n\t<p>If you'd rather disable two-way binding altogether, you can do so with <code>twoway: false</code>.</p>\n</div>\n\n<p>That's a cute demo, but it doesn't have much real world use. In all likelihood we want to do something with the data when it changes. For that, we use <code>ractive.observe()</code>:</p>\n\n<pre class='prettyprint lang-js'>\nractive.observe( 'name', function ( newValue, oldValue ) {\n  app.user.name = newValue; // or whatever\n});\n</pre>"},{"template":"<input type='checkbox' checked='{{checked}}'>\n<p>The checkbox is {{^checked}}not{{/checked}} checked.</p>\n\n<label><input type='radio' name='{{color}}' value='red' checked> red</label>\n<label><input type='radio' name='{{color}}' value='green'> green</label>\n<label><input type='radio' name='{{color}}' value='blue'> blue</label>\n<p>The selected colour is <span style='color: {{color}};'>{{color}}</span>.</p>","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template\n});","init":true,"copy":"<h2>Checkboxes and radios</h2>\n\n<p>You can control whether checkboxes are checked or not like so:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;input type='checkbox' checked='{{checked}}'&gt;\n&lt;p&gt;The checkbox is {{^checked}}not{{/checked}} checked.&lt;/p&gt;\n</pre>\n\n<p>If you have a group of radio buttons, you can do this:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;label&gt;&lt;input type='radio' name='{{color}}' value='red' checked&gt; red&lt;/label&gt;\n&lt;label&gt;&lt;input type='radio' name='{{color}}' value='green'&gt; green&lt;/label&gt;\n&lt;label&gt;&lt;input type='radio' name='{{color}}' value='blue'&gt; blue&lt;/label&gt;\n&lt;p&gt;The selected colour is &lt;span style='color: {{color}};'&gt;{{color}}&lt;/span&gt;.&lt;/p&gt;\n</pre>\n\n<p>Here, because we've set the <code>name</code> attribute to <code>{{color}}</code>, the value of <code>color</code> is set to the <code>value</code> attribute of whichever radio button is currently checked. (If you need to read that sentence a couple of times, I don't blame you.) Notice that the value is initialised to <code>red</code>, because that option is checked.</p>\n\n<div class='hint'>\n\t<p>Front-end über nerds will notice that this isn't how these attributes normally work. For example, a checkbox with <code>checked='false'</code> is the same as one with <code>checked='true'</code>, because it's a <em>boolean attribute</em> which either exists on the element or doesn't &ndash; its <em>value</em> is completely irrelevant.</p>\n\n\t<p>Furthermore, once you've interacted with a checkbox, its <code>checked</code> attribute becomes irrelevant! You can only change the value programmatically by doing <code>element.checked = true</code> rather than <code>element.setAttribute( 'checked' )</code>.</p>\n\n\t<p>Combine all that with cross-browser quirks (e.g. IE8 and below only fire <code>change</code> events on blur), and we're in some seriously confusing territory.</p>\n\n\t<p>So <span class='logo'>Ractive.js</span> makes no apology for using <code>checked='{{checked}}'</code> to mean 'checked if <code>checked</code> is <code>true</code>, unchecked if it's <code>false</code>'. We're bringing sanity to the process of gathering user input.</p>\n</div>\n\n<p>Try changing the values of <code>checked</code> and <code>color</code> via the console.</p>","console":"ractive.set( 'checked', true );\nractive.set( 'color', 'green' );"},{"template":"<label><input type='radio' name='{{color}}' value='red' checked> red</label>\n<label><input type='radio' name='{{color}}' value='green'> green</label>\n<label><input type='radio' name='{{color}}' value='blue'> blue</label>\n\n<p>The selected colour is <span style='color: {{color}};'>{{color}}</span>.</p>","javascript":"var view = new Ractive({\n  el: output,\n  template: template\n});","init":true,"fixed":{"template":"<select value='{{color}}'>\n  {{#colors}}\n  <option value='{{.}}'>{{.}}</option>\n  {{/colors}}\n</select>\n\n<p>The selected colour is <span style='color: {{color}};'>{{color}}</span>.</p>","javascript":"var colors = [ 'red', 'green', 'blue' ];\n\nvar ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    colors: colors,\n    color: colors[0]\n  }\n});","console":"colors.push( 'purple' );"},"copy":"<h2>Drop-down menus</h2>\n\n<p>As well as <code>&lt;input&gt;</code> elements (and <code>&lt;textarea&gt;</code>s, which work similarly), two-way binding works with <code>&lt;select&gt;</code> menus. Let's replace the radio group with a <code>&lt;select&gt;</code>:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;select value='{{color}}'&gt;\n  &lt;option value='red'&gt;red&lt;/option&gt;\n  &lt;option value='green'&gt;green&lt;/option&gt;\n  &lt;option value='blue' selected&gt;blue&lt;/option&gt;\n&lt;/select&gt;\n</pre>\n\n<div class='hint'>\n\t<p>I apologise to my fellow Brits, and other English-speaking non-Americans, for the repeated use of <code>color</code> instead of <code>colour</code>. Occupational hazard.</div>\n</div>\n\n<p>Re-render the ractive. Notice that once again, the data is initialised to the value of the selected <code>&lt;option&gt;</code> &ndash; in this case, blue.</p>\n\n<p>That's good, but we can go one better &ndash; rather than hard-coding our colours into the template, let's do it properly:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;select value='{{color}}'&gt;\n  {{#colors}}\n  &lt;option value='{{.}}'&gt;{{.}}&lt;/option&gt;\n  {{/colors}}\n&lt;/select&gt;\n</pre>\n\n<div class='hint'>\n\t<p>We haven't seen <code>{{.}}</code> before. It's called the <em>implicit iterator</em>, and it basically points to the current list item. Previously, whenever we've used lists, they've been lists of objects. The implicit iterator allows us to use lists of <em>primitives</em> (in this case, strings) instead.</p>\n</div>\n\n<p>And add some data to our view:</p>\n\n<pre class='prettyprint lang-js'>\nvar colors = [ 'red', 'green', 'blue' ];\n\nvar ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    colors: colors,\n    color: colors[0]\n  }\n});\n</pre>\n\n<div class='hint'>\n\t<p>The template no longer has an <code>&lt;option&gt;</code> with a <code>selected</code> attribute, so we need to specify an initial value of <code>color</code>.</p>\n</div>\n\n<p>Execute this code. You can add more colours to the menu via the console.</p>"}]},{"title":"Partials","styles":".newTodo {\n\twidth: 100%;\n\tmax-width: 20em;\n\t@include border-box;\n}\n\n.todos {\n\tpadding: 0;\n\tborder-top: 1px solid #eee;\n\tmax-width: 20em;\n}\n\n.todos li {\n\tposition: relative;\n\tpadding: 0.5em 3em 0.5em 2em;\n\tlist-style: none;\n\tborder-bottom: 1px solid #eee;\n\tmin-height: 1em;\n}\n\n.todos li input {\n\tposition: absolute;\n\tmargin: 0;\n\tleft: 0.5em;\n\ttop: 0.6em;\n}\n\n.todos span {\n\tposition: relative;\n\tdisplay: block;\n\tcursor: pointer;\n}\n\n.todos li.done span {\n\topacity: 0.5;\n\ttext-decoration: line-through;\n}\n\n.todos .button {\n\tposition: absolute;\n\tright: 0.5em;\n\twidth: 1em;\n\ttext-align: center;\n\ttop: 0.4em;\n\tbackground-color: #d00;\n\tborder: none;\n\topacity: 0.3;\n}\n\n.todos .edit {\n\tposition: absolute;\n\twidth: 100%;\n\theight: 100%;\n\ttop: -0.3em;\n\tleft: -0.3em;\n\tpadding: 0.2em;\n}\n\n.todos li:hover {\n\tbackground-color: #f9f9f9;\n}\n\n.todos li:hover .button {\n\topacity: 1;\n}","steps":[{"template":"<h2>To-do list</h2>\n\n<input proxy-change='newTodo' class='newTodo' placeholder='What needs to be done?'>\n\n<ul class='todos'>\n  {{#items:i}}\n    <li data-index='{{i}}' class='{{( done ? \"done\" : \"pending\" )}}'>\n      <input type='checkbox' checked='{{done}}'>\n      <span proxy-tap='edit'>\n        {{description}}\n\n        {{#.editing}}\n          <input id='editTodo' class='edit' value='{{description}}' proxy-blur='stop_editing'>\n        {{/.editing}}\n      </span>\n      <a class='button' proxy-tap='remove'>x</a>\n    </li>\n  {{/items}}\n</ul>","javascript":"var TodoList = Ractive.extend({\n  template: template,\n\n  partials: {}, // add the 'item' partial\n\n  addItem: function ( description ) {\n    this.items.push({\n      description: description,\n      done: false\n    });\n  },\n\n  removeItem: function ( index ) {\n  \tthis.items.splice( index, 1 );\n  },\n\n  editItem: function ( index ) {\n    var self = this, keydownHandler, blurHandler, input, currentDescription;\n\n    currentDescription = this.get( 'items.' + index + '.description' );\n    this.set( 'items.' + index + '.editing', true );\n\n    input = this.nodes.editTodo;\n    input.select();\n\n    window.addEventListener( 'keydown', keydownHandler = function ( event ) {\n      switch ( event.which ) {\n        case 13: // ENTER\n        input.blur();\n        break;\n\n        case 27: // ESCAPE\n        input.value = currentDescription;\n        self.set( 'items.' + index + '.description', currentDescription );\n        input.blur();\n        break;\n\n        case 9: // TAB\n        event.preventDefault();\n        input.blur();\n        self.editItem( ( index + 1 ) % self.get( 'items' ).length );\n        break;\n      }\n    });\n\n    input.addEventListener( 'blur', blurHandler = function () {\n      window.removeEventListener( 'keydown', keydownHandler );\n      input.removeEventListener( 'blur', blurHandler );\n    });\n    \n    this.set( 'items.' + index + '.editing', true );\n  },\n\n  init: function ( options ) {\n    var self = this;\n\n    this.items = options.items;\n\n    // initialise\n    this.set( 'items', this.items );\n\n    // proxy event handlers\n    this.on({\n      remove: function ( event ) {\n        this.removeItem( event.index.i );\n      },\n      newTodo: function ( event ) {\n        this.addItem( event.node.value );\n        event.node.value = '';\n      },\n      edit: function ( event ) {\n        this.editItem( event.index.i );\n      },\n      stop_editing: function ( event ) {\n        this.set( event.keypath + '.editing', false );\n      }\n    });\n  }\n});\n\nvar ractive = new TodoList({\n  el: output,\n  items: [\n    { done: true,  description: 'Add a todo item' },\n    { done: false, description: 'Add some more todo items' },\n    { done: false, description: 'Complete all the Ractive tutorials' }\n  ]\n});","init":true,"fixed":{"template":"<h2>To-do list</h2>\n\n<input proxy-change='newTodo' class='newTodo' placeholder='What needs to be done?'>\n\n<ul class='todos'>\n  {{#items:i}}\n    {{>item}}\n  {{/items}}\n</ul>","javascript":"var item = \"<li data-index='{{i}}' class='{{( done ? \\\"done\\\" : \\\"pending\\\" )}}'>\" +\n             \"<input type='checkbox' checked='{{done}}'>\" +\n             \"<span proxy-tap='edit'>\" +\n               \"{{description}}\" +\n\n               \"{{#.editing}}\" +\n                 \"<input id='editTodo' class='edit' value='{{description}}' proxy-blur='stop_editing'>\" +\n               \"{{/.editing}}\" +\n             \"</span>\" +\n             \"<a class='button' proxy-tap='remove'>x</a>\" +\n           \"</li>\";\n\nvar TodoList = Ractive.extend({\n  template: template,\n\n  partials: { item: item },\n\n  addItem: function ( description ) {\n    this.items.push({\n      description: description,\n      done: false\n    });\n  },\n\n  removeItem: function ( index ) {\n  \tthis.items.splice( index, 1 );\n  },\n\n  init: function ( options ) {\n    var self = this;\n\n    this.items = options.items;\n\n    // initialise\n    this.set( 'items', this.items );\n\n    // proxy event handlers\n    this.on({\n      remove: function ( event ) {\n        var index = event.node.parentNode.getAttribute( 'data-index' );\n        this.removeItem( index );\n      },\n      newTodo: function ( event ) {\n        this.addItem( event.node.value );\n        event.node.value = '';\n      },\n      edit: function ( event ) {\n        var node, li, index, input, submit;\n\n        // first, find the index of the todo we're editing\n        node = event.node;\n        li = node.parentNode;\n        index = li.getAttribute( 'data-index' );\n\n        // create an input and fill it with the current description\n        input = document.createElement( 'input' );\n        input.className = 'edit';\n        input.value = this.get( 'items.' + index + '.description' );\n\n        // on submit, update the data and remove the input\n        submit = function ( event ) {\n          event.preventDefault();\n\n          input.removeEventListener( 'blur', submit );\n          input.removeEventListener( 'change', submit );\n\n          node.removeChild( input );\n          self.set( 'items.' + index + '.description', input.value );\n        };\n\n        input.addEventListener( 'blur', submit );\n        input.addEventListener( 'change', submit );\n\n        // add the input, and select all the text in it\n        node.appendChild( input );\n        input.select();\n      }\n    });\n  }\n});\n\nvar ractive = new TodoList({\n  el: output,\n  items: [\n    { done: true,  description: 'Add a todo item' },\n    { done: false, description: 'Add some more todo items' },\n    { done: false, description: 'Complete all the Ractive tutorials' }\n  ]\n});"},"copy":"<h2>How to use partials</h2>\n\n<p>Partials are a good way to split complex templates up into several more manageable files. Take this todo list, for example. It's not too bad, but the template would look neater if we could separate out the code for an individual item.</p>\n\n<p>Well, we can. Add this above the rest of the JavaScript:</p>\n\n<pre class='prettyprint lang-js'>\nvar item = \"&lt;li data-index='{{i}}' class='{{( done ? \"done\" : \"pending\" )}}'&gt;\" +\n             \"&lt;input type='checkbox' checked='{{done}}'&gt;\" +\n             \"&lt;span proxy-tap='edit'&gt;\" +\n               \"{{description}}\" +\n\n               \"{{#.editing}}\" +\n                 \"&lt;input id='editTodo' class='edit' value='{{description}}' proxy-blur='stop_editing'&gt;\" +\n               \"{{/.editing}}\" +\n             \"&lt;/span&gt;\" +\n             \"&lt;a class='button' proxy-tap='remove'&gt;x&lt;/a&gt;\" +\n           \"&lt;/li&gt;\";\n</pre>\n\n<p>Then, in the main template we replace all that with a partial, which looks like a regular mustache but with a <code>&gt;</code> character:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;ul class='todos'&gt;\n  {{#items:i}}\n    {{&gt;item}}\n  {{/items}}\n&lt;/ul&gt;\n</pre>\n\n<p>Finally, we need to add the partial when we define our <code>TodoList</code>:</p>\n\n<pre class='prettyprint lang-js'>\nvar TodoList = Ractive.extend({\n  template: template,\n  partials: { item: item },\n  // etc...\n});\n</pre>\n\n<p>Execute this code.</p>"},{"template":"<h2>To-do list</h2>\n\n<input proxy-change='newTodo' class='newTodo' placeholder='What needs to be done?'>\n\n<ul class='todos'>\n  {{#items:i}}\n    {{>item}}\n  {{/items}}\n</ul>\n\n<!-- {{>item}} -->\n <!-- add the partial here -->\n<!-- {{/item}} -->","javascript":"var item = \"<li data-index='{{i}}' class='{{( done ? \\\"done\\\" : \\\"pending\\\" )}}'>\" +\n             \"<input type='checkbox' checked='{{done}}'>\" +\n             \"<span proxy-tap='edit'>\" +\n               \"{{description}}\" +\n\n               \"{{#.editing}}\" +\n                 \"<input id='editTodo' class='edit' value='{{description}}' proxy-blur='stop_editing'>\" +\n               \"{{/.editing}}\" +\n             \"</span>\" +\n             \"<a class='button' proxy-tap='remove'>x</a>\" +\n           \"</li>\";\n\nvar TodoList = Ractive.extend({\n  template: template,\n\n  // remove the next line - we don't need to explicitly\n  // define our partial now that it's inline\n  partials: { item: item },\n\n  addItem: function ( description ) {\n    this.items.push({\n      description: description,\n      done: false\n    });\n  },\n\n  removeItem: function ( index ) {\n    this.items.splice( index, 1 );\n  },\n\n  init: function ( options ) {\n    var self = this;\n\n    this.items = options.items;\n\n    // initialise\n    this.set( 'items', this.items );\n\n    // proxy event handlers\n    this.on({\n      remove: function ( event ) {\n        var index = event.node.parentNode.getAttribute( 'data-index' );\n        this.removeItem( index );\n      },\n      newTodo: function ( event ) {\n        this.addItem( event.node.value );\n        event.node.value = '';\n      },\n      edit: function ( event ) {\n        var node, li, index, input, submit;\n\n        // first, find the index of the todo we're editing\n        node = event.node;\n        li = node.parentNode;\n        index = li.getAttribute( 'data-index' );\n\n        // create an input and fill it with the current description\n        input = document.createElement( 'input' );\n        input.className = 'edit';\n        input.value = this.get( 'items.' + index + '.description' );\n\n        // on submit, update the data and remove the input\n        submit = function ( event ) {\n          event.preventDefault();\n\n          input.removeEventListener( 'blur', submit );\n          input.removeEventListener( 'change', submit );\n\n          node.removeChild( input );\n          self.set( 'items.' + index + '.description', input.value );\n        };\n\n        input.addEventListener( 'blur', submit );\n        input.addEventListener( 'change', submit );\n\n        // add the input, and select all the text in it\n        node.appendChild( input );\n        input.select();\n      }\n    });\n  }\n});\n\nvar ractive = new TodoList({\n  el: output,\n  items: [\n    { done: true,  description: 'Add a todo item' },\n    { done: false, description: 'Add some more todo items' },\n    { done: false, description: 'Complete all the Ractive tutorials' }\n  ]\n});","init":true,"fixed":{"template":"<h2>To-do list</h2>\n\n<input proxy-change='newTodo' class='newTodo' placeholder='What needs to be done?'>\n\n<ul class='todos'>\n  {{#items:i}}\n    {{>item}}\n  {{/items}}\n</ul>\n\n<!-- {{>item}} -->\n<li data-index='{{i}}' class='{{( done ? \"done\" : \"pending\" )}}'>\n  <input type='checkbox' checked='{{done}}'>\n  <span proxy-tap='edit'>\n    {{description}}\n\n    {{#.editing}}\n      <input id='editTodo' class='edit' value='{{description}}' proxy-blur='stop_editing'>\n    {{/.editing}}\n  </span>\n  <a class='button' proxy-tap='remove'>x</a>\n</li>\n<!-- {{/item}} -->","javascript":"var TodoList = Ractive.extend({\n  template: template,\n\n  addItem: function ( description ) {\n    this.items.push({\n      description: description,\n      done: false\n    });\n  },\n\n  removeItem: function ( index ) {\n    this.items.splice( index, 1 );\n  },\n\n  init: function ( options ) {\n    var self = this;\n\n    this.items = options.items;\n\n    // initialise\n    this.set( 'items', this.items );\n\n    // proxy event handlers\n    this.on({\n      remove: function ( event ) {\n        var index = event.node.parentNode.getAttribute( 'data-index' );\n        this.removeItem( index );\n      },\n      newTodo: function ( event ) {\n        this.addItem( event.node.value );\n        event.node.value = '';\n      },\n      edit: function ( event ) {\n        var node, li, index, input, submit;\n\n        // first, find the index of the todo we're editing\n        node = event.node;\n        li = node.parentNode;\n        index = li.getAttribute( 'data-index' );\n\n        // create an input and fill it with the current description\n        input = document.createElement( 'input' );\n        input.className = 'edit';\n        input.value = this.get( 'items.' + index + '.description' );\n\n        // on submit, update the data and remove the input\n        submit = function ( event ) {\n          event.preventDefault();\n\n          input.removeEventListener( 'blur', submit );\n          input.removeEventListener( 'change', submit );\n\n          node.removeChild( input );\n          self.set( 'items.' + index + '.description', input.value );\n        };\n\n        input.addEventListener( 'blur', submit );\n        input.addEventListener( 'change', submit );\n\n        // add the input, and select all the text in it\n        node.appendChild( input );\n        input.select();\n      }\n    });\n  }\n});\n\nvar ractive = new TodoList({\n  el: output,\n  items: [\n    { done: true,  description: 'Add a todo item' },\n    { done: false, description: 'Add some more todo items' },\n    { done: false, description: 'Complete all the Ractive tutorials' }\n  ]\n});"},"copy":"<h2>Inline partials</h2>\n\n<p>Fine, except that multiline string was fugly. It's good to know that you can pass partials in as strings, but unless you're loading those strings from a template file with AJAX, you'd probably prefer a neater way.</p>\n\n<p>There are two. Firstly, you can add partials as <code>&lt;script&gt;</code> tags on the page:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;script id='item' type='text/ractive'&gt;\n&lt;li data-index='{{i}}' class='{{( done ? \"done\" : \"pending\" )}}'&gt;\n  &lt;input type='checkbox' checked='{{done}}'&gt;\n  &lt;span proxy-tap='edit'&gt;\n    {{description}}\n\n    {{#.editing}}\n      &lt;input id='editTodo' class='edit' value='{{description}}' proxy-blur='stop_editing'&gt;\n    {{/.editing}}\n  &lt;/span&gt;\n  &lt;a class='button' proxy-tap='remove'&gt;x&lt;/a&gt;\n&lt;/li&gt;\n&lt;/script&gt;\n</pre>\n\n<div class='hint'>\n\t<p>Note that the <code>id</code> attribute is the name of the partial, and that the <code>type</code> attribute is <code>text/ractive</code> (though it could be anything, as long as it's not <code>text/javascript</code>). This is a convenient way to quickly test ideas out on a blank page (you can use these script tags as main templates as well as partials - just reference them as e.g. <code>'#myTemplate'</code> in your initialisation options).</p>\n</div>\n\n<p>Or, you can use an <em>inline partial</em>. Inline partials are declared within your main template, surrounded by comment blocks:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;!-- {{>item}} --&gt;\n&lt;li data-index='{{i}}' class='{{( done ? \"done\" : \"pending\" )}}'&gt;\n  &lt;input type='checkbox' checked='{{done}}'&gt;\n  &lt;span proxy-tap='edit'&gt;\n    {{description}}\n\n    {{#.editing}}\n      &lt;input id='editTodo' class='edit' value='{{description}}' proxy-blur='stop_editing'&gt;\n    {{/.editing}}\n  &lt;/span&gt;\n  &lt;a class='button' proxy-tap='remove'&gt;x&lt;/a&gt;\n&lt;/li&gt;\n&lt;!-- {{/item}} --&gt;\n</pre>\n\n<p>Add the partial to the <strong>#template</strong>, and remove it (and the <code>var item = ...</code> bit) from the <strong>#javascript</strong> code.</p>"}]},{"title":"Animation","styles":"svg {\n\twidth: 100%;\n\theight: 100%;\n}\n\n.temperatures {\n\tposition: relative;\n\twidth: 100%;\n\theight: 100%;\n\tpadding: 4em 0 0 0;\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n\n.header {\n\tposition: absolute;\n\ttop: 0;\n\tleft: 0;\n\twidth: 100%;\n\theight: 2em;\n}\n\n.radio-group {\n\tdisplay: inline-block;\n\tfloat: right;\n\ttext-align: right;\n\tpadding: 0.5em 0 0 0;\n}\n\n.header h2 {\n\tfloat: left;\n\tmargin: 0;\n}\n\n.header select {\n\tposition: relative;\n\ttop: 0.1em;\n\tfloat: left;\n\tclear: left;\n\tfont-size: inherit;\n\tfont-family: inherit;\n\tz-index: 7;\n}\n\n.header label {\n\tposition: relative;\n\tz-index: 7;\n}\n\n.header p {\n\tfloat: left;\n\tclear: left;\n\tmargin: 0;\n}\n\n.bar-chart {\n\tposition: relative;\n\tpadding: 0 0 3em 0;\n\twidth: 100%;\n\theight: 100%;\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.bar-group {\n\tposition: relative;\n\tfloat: left;\n\theight: 100%;\n\ttext-align: center;\n}\n\n.month-label {\n\tposition: absolute;\n\tbottom: -2em;\n\tleft: 0;\n\twidth: 100%;\n}\n\n.bar-outer {\n\tposition: absolute;\n\twidth: 100%;\n\tpadding: 0 1px;\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.bar-outer.positive {\n\tbottom: 20%;\n}\n\n.bar-outer.positive .bar-inner {\n\tbottom: 0;\n\tborder-top: 1px solid #333;\n\tborder-left: 1px solid #333;\n\tborder-right: 1px solid #333;\n\tborder-radius: 2px 2px 0 0;\n}\n\n.bar-outer.negative {\n\ttop: 80%;\n}\n\n.bar-outer.negative .bar-inner {\n\ttop: 0;\n\tborder-bottom: 1px solid #333;\n\tborder-left: 1px solid #333;\n\tborder-right: 1px solid #333;\n\tborder-radius: 0 0 2px 2px;\n}\n\n.bar-outer.high.negative {\n\tz-index: 6;\n}\n\n.bar-inner {\n\tposition: relative;\n\twidth: 100%;\n\theight: 100%;\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.high.positive span {\n\ttop: -0.6em;\n\tfont-weight: bold;\n}\n\n.low.positive span {\n\ttop: 0.8em;\n\tcolor: white;\n\ttext-shadow: 0 0 3px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,1);\n}\n\n.high.negative span {\n\tbottom: 0.8em;\n\tcolor: white;\n\ttext-shadow: 0 0 3px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,1);\n}\n\n.low.negative span {\n\tbottom: -0.6em;\n\tfont-weight: bold;\n}\n\n.bar-chart span {\n\tposition: absolute;\n\twidth: 100%;\n\tleft: 0;\n\tfont-family: 'Helvetica Neue', Arial;\n\tfont-size: 0.7em;\n\tline-height: 0;\n\tz-index: 6;\n}\n\n.axis {\n\tposition: relative;\n\twidth: 100%;\n\theight: 0;\n\tborder-top: 1px solid #333;\n\tz-index: 5;\n\tleft: 0;\n\ttop: 80%;\n}","steps":[{"template":"<div class='temperatures'>\n  \n  <!-- header and options -->\n  <div class='header'>\n    <h2>Average high and low temperature</h2>\n    \n    <!-- switch between celsius and fahrenheit -->\n    <div class='radio-group'>\n      <label>°C <input type='radio' name='{{degreeType}}' value='celsius' checked></label>\n      <label>°F <input type='radio' name='{{degreeType}}' value='fahrenheit'></label>\n    </div>\n\n    <!-- dropdown menu -->\n    <select value='{{selected}}'>\n      {{#cities:i}}\n      <option value='{{i}}'>{{name}}</option>\n      {{/cities}}\n    </select>\n  </div>\n\n  <!-- the chart -->\n  <div class='bar-chart'>\n    {{#selectedCity}}\n      \n      <!-- 12 sections, one for each month -->\n      {{#months:i}}\n        <div class='bar-group' style='width: {{( 100 / months.length )}}%;'>\n          \n          <!-- average high temperature -->\n          <div class='bar-outer high {{( (high >= 0) ? \"positive\" : \"negative\" )}}' style='height: {{( scale(high) )}}%;'>\n            <div class='bar-inner' style='background-color: {{( getColor(high) )}};'></div>\n            <span>{{( format(high, degreeType) )}}</span>\n          </div>\n\n\n          <!-- average low temperature -->\n          <div class='bar-outer low {{( (low >= 0) ? \"positive\" : \"negative\" )}}' style='height: {{( scale(low) )}}%;'>\n            <div class='bar-inner' style='background-color: {{( getColor(low) )}};'></div>\n            <span>{{( format(low, degreeType) )}}</span>\n          </div>\n\n          <!-- month label (JFMAMJJASOND) -->\n          <span class='month-label'>{{( monthNames[i] )}}</span>\n        </div>\n      {{/months}}\n    {{/selectedCity}}\n\n    <!-- horizontal line representing freezing -->\n    <div class='axis'></div>\n  </div>\n</div>","javascript":"var cities, ractive;\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    scale: function ( val ) {\n      // quick and dirty...\n      return 2 * Math.abs( val );\n    },\n    format: function ( val, degreeType ) {\n      if ( degreeType === 'fahrenheit' ) {\n        // convert celsius to fahrenheit\n        val = ( val * 1.8 ) + 32;\n      }\n\n      return val.toFixed( 1 ) + '°';\n    },\n    getColor: function ( val ) {\n      // quick and dirty function to pick a colour - the higher the\n      // temperature, the warmer the colour\n      var r = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( val + 50 ) ) ) );\n      var g = 100;\n      var b = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( 50 - val ) ) ) );\n\n      return 'rgb(' + r + ',' + g + ',' + b + ')';\n    },\n    monthNames: [ 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D' ]\n  }\n});\n\n// when the user makes a selection from the drop-down, update the chart\nractive.observe( 'selected', function ( index ) {\n  this.set( 'selectedCity', cities[ index ] );\n});\n\n// load our data\n$.getJSON( 'files/data/temperature.json' ).then( function ( data ) {\n  cities = data;\n\n  ractive.set({\n    cities: cities,\n    selectedCity: cities[0] // initialise to London\n  });\n});","init":true,"fixed":{"javascript":"var cities, ractive;\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    scale: function ( val ) {\n      // quick and dirty...\n      return 2 * Math.abs( val );\n    },\n    format: function ( val, degreeType ) {\n      if ( degreeType === 'fahrenheit' ) {\n        // convert celsius to fahrenheit\n        val = ( val * 1.8 ) + 32;\n      }\n\n      return val.toFixed( 1 ) + '°';\n    },\n    getColor: function ( val ) {\n      // quick and dirty function to pick a colour - the higher the\n      // temperature, the warmer the colour\n      var r = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( val + 50 ) ) ) );\n      var g = 100;\n      var b = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( 50 - val ) ) ) );\n\n      return 'rgb(' + r + ',' + g + ',' + b + ')';\n    },\n    monthNames: [ 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D' ]\n  }\n});\n\n// when the user makes a selection from the drop-down, update the chart\nractive.observe( 'selected', function ( index ) {\n  this.animate( 'selectedCity', cities[ index ] );\n});\n\n// load our data\n$.getJSON( 'files/data/temperature.json' ).then( function ( data ) {\n  cities = data;\n\n  ractive.set({\n    cities: cities,\n    selectedCity: cities[0] // initialise to London\n  });\n});"},"copy":"<h2>Bringing it to life</h2>\n\n<p>Animation can play an important role in communicating changing states of your webapp. In this tutorial we'll learn about using <code>Ractive.animate()</code>.</p>\n\n<p>Here, we've got a bar chart showing average temperatures throughout the year. We want there to be a smooth transition when the user changes the city using the dropdown menu.</p>\n\n<p>Find the code that changes the data in the bar chart when the user makes a selection from the dropdown. Change <code>this.set</code> to <code>this.animate</code>...</p>\n\n<p>...and that's it! We now have a smooth transition between cities &ndash; not just the bar height, but the labels and colours as well.</p>\n\n<div class='hint'>\n\t<p><span class='logo'>Ractive.js</span> is efficient about how it handles animations. Even though there are a total of 72 properties being animated each time (height, colour and label text for two bars for each of twelve months), there is a single animation loop which uses <code>requestAnimationFrame</code> where possible, and which runs as long as there are one or more sets of animations in progress.</p>\n\n\t<p>If a second animation on a keypath were to start before the first had completed, the first would be cancelled.</p>\n</div>"},{"template":"<div class='temperatures'>\n  \n  <!-- header and options -->\n  <div class='header'>\n    <h2>Average high and low temperature</h2>\n    \n    <!-- switch between celsius and fahrenheit -->\n    <div class='radio-group'>\n      <label>°C <input type='radio' name='{{degreeType}}' value='celsius' checked></label>\n      <label>°F <input type='radio' name='{{degreeType}}' value='fahrenheit'></label>\n    </div>\n\n    <!-- dropdown menu -->\n    <select value='{{selected}}'>\n      {{#cities:i}}\n      <option value='{{i}}'>{{name}}</option>\n      {{/cities}}\n    </select>\n  </div>\n\n  <!-- the chart -->\n  <div class='bar-chart'>\n    {{#selectedCity}}\n      \n      <!-- 12 sections, one for each month -->\n      {{#months:i}}\n        <div class='bar-group' style='width: {{( 100 / months.length )}}%;'>\n          \n          <!-- average high temperature -->\n          <div class='bar-outer high {{( (high >= 0) ? \"positive\" : \"negative\" )}}' style='height: {{( scale(high) )}}%;'>\n            <div class='bar-inner' style='background-color: {{( getColor(high) )}};'></div>\n            <span>{{( format(high, degreeType) )}}</span>\n          </div>\n\n\n          <!-- average low temperature -->\n          <div class='bar-outer low {{( (low >= 0) ? \"positive\" : \"negative\" )}}' style='height: {{( scale(low) )}}%;'>\n            <div class='bar-inner' style='background-color: {{( getColor(low) )}};'></div>\n            <span>{{( format(low, degreeType) )}}</span>\n          </div>\n\n          <!-- month label (JFMAMJJASOND) -->\n          <span class='month-label'>{{( monthNames[i] )}}</span>\n        </div>\n      {{/months}}\n    {{/selectedCity}}\n\n    <!-- horizontal line representing freezing -->\n    <div class='axis'></div>\n  </div>\n</div>","javascript":"var cities, ractive;\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    scale: function ( val ) {\n      // quick and dirty...\n      return 2 * Math.abs( val );\n    },\n    format: function ( val, degreeType ) {\n      if ( degreeType === 'fahrenheit' ) {\n        // convert celsius to fahrenheit\n        val = ( val * 1.8 ) + 32;\n      }\n\n      return val.toFixed( 1 ) + '°';\n    },\n    getColor: function ( val ) {\n      // quick and dirty function to pick a colour - the higher the\n      // temperature, the warmer the colour\n      var r = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( val + 50 ) ) ) );\n      var g = 100;\n      var b = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( 50 - val ) ) ) );\n\n      return 'rgb(' + r + ',' + g + ',' + b + ')';\n    },\n    monthNames: [ 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D' ]\n  }\n});\n\n// when the user makes a selection from the drop-down, update the chart\nractive.observe( 'selected', function ( index ) {\n  this.animate( 'selectedCity', cities[ index ] );\n});\n\n// load our data\n$.getJSON( 'files/data/temperature.json' ).then( function ( data ) {\n  cities = data;\n\n  ractive.set({\n    cities: cities,\n    selectedCity: cities[0] // initialise to London\n  });\n});","init":true,"fixed":{"javascript":"var cities, ractive;\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    scale: function ( val ) {\n      // quick and dirty...\n      return 2 * Math.abs( val );\n    },\n    format: function ( val, degreeType ) {\n      if ( degreeType === 'fahrenheit' ) {\n        // convert celsius to fahrenheit\n        val = ( val * 1.8 ) + 32;\n      }\n\n      return val.toFixed( 1 ) + '°';\n    },\n    getColor: function ( val ) {\n      // quick and dirty function to pick a colour - the higher the\n      // temperature, the warmer the colour\n      var r = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( val + 50 ) ) ) );\n      var g = 100;\n      var b = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( 50 - val ) ) ) );\n\n      return 'rgb(' + r + ',' + g + ',' + b + ')';\n    },\n    monthNames: [ 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D' ]\n  }\n});\n\n// when the user makes a selection from the drop-down, update the chart\nractive.observe( 'selected', function ( index ) {\n  this.animate( 'selectedCity', cities[ index ], {\n    easing: 'easeOut'\n  });\n});\n\n// load our data\n$.getJSON( 'files/data/temperature.json' ).then( function ( data ) {\n  cities = data;\n\n  ractive.set({\n    cities: cities,\n    selectedCity: cities[0] // initialise to London\n  });\n});"},"copy":"<h2>Making it slick</h2>\n\n<p>That's good, but it looks a bit... robotic. That's because the animation is following a linear path. We can make the whole thing look much slicker with an <em>easing function</em>. Find the existing animation code and update it:</p>\n\n<pre class='prettyprint lang-js'>\nthis.animate( 'city', city, {\n  easing: 'easeOut'\n});\n</pre>\n\n<p>Execute this code, then try changing the city via the drop-down.</p>\n\n<div class='hint'>\n\t<p><span class='logo'>Ractive.js</span> has four easing functions built in &ndash; <code>linear</code> (the default), <code>easeIn</code>, <code>easeOut</code> and <code>easeInOut</code>. I personally find <code>easeOut</code> and <code>easeInOut</code> meet 95% of my needs.</p>\n\n\t<p>However you can add more easing functions to <code>Ractive.easing</code>, and they will become globally available. Here's an elastic easing function, for example:</p>\n\n\t<pre class='prettyprint lang-js'>\nRactive.easing.elastic = function( pos ) {\n  return -1 * Math.pow(4,-8*pos) * Math.sin((pos*6-1)*(2*Math.PI)/2) + 1;\n};\n</pre>\n\n\t<p>This was taken from <a href='https://github.com/danro/easing-js/blob/master/easing.js'>danro's easing.js</a>, which contains just about every easing function you could imagine. Or you could create your own &ndash; all it is is a function that takes an x value between 0 (animation start) and 1 (animation end) and returns a y value (usually between 0 and 1, but sometimes just outside as in the <code>elastic</code> example).</p>\n\n\t<p>As an alternative to making easing functions globally available, you can pass a function in as the <code>easing</code> parameter rather than a string.</p>\n</div>"},{"template":"<div class='temperatures'>\n  \n  <!-- header and options -->\n  <div class='header'>\n    <h2>Average high and low temperature</h2>\n    \n    <!-- switch between celsius and fahrenheit -->\n    <div class='radio-group'>\n      <label>°C <input type='radio' name='{{degreeType}}' value='celsius' checked></label>\n      <label>°F <input type='radio' name='{{degreeType}}' value='fahrenheit'></label>\n    </div>\n\n    <p>{{selectedCity.name}}</p>\n  </div>\n\n  <!-- the chart -->\n  <div class='bar-chart'>\n    {{#selectedCity}}\n      \n      <!-- 12 sections, one for each month -->\n      {{#months:i}}\n        <div class='bar-group' style='width: {{( 100 / months.length )}}%;'>\n          \n          <!-- average high temperature -->\n          <div class='bar-outer high {{( (high >= 0) ? \"positive\" : \"negative\" )}}' style='height: {{( scale(high) )}}%;'>\n            <div class='bar-inner' style='background-color: {{( getColor(high) )}};'></div>\n            <span>{{( format(high, degreeType) )}}</span>\n          </div>\n\n\n          <!-- average low temperature -->\n          <div class='bar-outer low {{( (low >= 0) ? \"positive\" : \"negative\" )}}' style='height: {{( scale(low) )}}%;'>\n            <div class='bar-inner' style='background-color: {{( getColor(low) )}};'></div>\n            <span>{{( format(low, degreeType) )}}</span>\n          </div>\n\n          <!-- month label (JFMAMJJASOND) -->\n          <span class='month-label'>{{( monthNames[i] )}}</span>\n        </div>\n      {{/months}}\n    {{/selectedCity}}\n\n    <!-- horizontal line representing freezing -->\n    <div class='axis'></div>\n  </div>\n</div>","javascript":"var cities, ractive;\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    scale: function ( val ) {\n      // quick and dirty...\n      return 2 * Math.abs( val );\n    },\n    format: function ( val, degreeType ) {\n      if ( degreeType === 'fahrenheit' ) {\n        // convert celsius to fahrenheit\n        val = ( val * 1.8 ) + 32;\n      }\n\n      return val.toFixed( 1 ) + '°';\n    },\n    getColor: function ( val ) {\n      // quick and dirty function to pick a colour - the higher the\n      // temperature, the warmer the colour\n      var r = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( val + 50 ) ) ) );\n      var g = 100;\n      var b = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( 50 - val ) ) ) );\n\n      return 'rgb(' + r + ',' + g + ',' + b + ')';\n    },\n    monthNames: [ 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D' ]\n  }\n});\n\n// when the user makes a selection from the drop-down, update the chart\nractive.observe( 'selected', function ( index ) {\n  this.animate( 'selectedCity', cities[ index ], {\n    easing: 'easeOut'\n  });\n});\n\n// load our data\n$.getJSON( 'files/data/temperature.json' ).then( function ( data ) {\n  cities = data;\n\n  ractive.set({\n    cities: cities,\n    selectedCity: cities[0] // initialise to London\n  });\n});","init":true,"fixed":{"javascript":"var cities, ractive;\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    scale: function ( val ) {\n      // quick and dirty...\n      return 2 * Math.abs( val );\n    },\n    format: function ( val, degreeType ) {\n      if ( degreeType === 'fahrenheit' ) {\n        // convert celsius to fahrenheit\n        val = ( val * 1.8 ) + 32;\n      }\n\n      return val.toFixed( 1 ) + '°';\n    },\n    getColor: function ( val ) {\n      // quick and dirty function to pick a colour - the higher the\n      // temperature, the warmer the colour\n      var r = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( val + 50 ) ) ) );\n      var g = 100;\n      var b = Math.max( 0, Math.min( 255, Math.floor( 2.56 * ( 50 - val ) ) ) );\n\n      return 'rgb(' + r + ',' + g + ',' + b + ')';\n    },\n    monthNames: [ 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D' ]\n  }\n});\n\n// animate to the next city, then to the next one after that, and so on...\nractive.observe( 'selected', function ( index ) {\n  this.animate( 'selectedCity', cities[ index ], {\n    easing: 'easeOut',\n    complete: function () {\n      setTimeout( function () {\n        ractive.set( 'selected', ( index + 1 ) % cities.length );\n      }, 2000 );\n    }\n  });\n});\n\n// load our data\n$.getJSON( 'files/data/temperature.json' ).then( function ( data ) {\n  cities = data;\n\n  ractive.set({\n    cities: cities\n  });\n\n  // kick off the loop\n  ractive.set( 'selected', 0 );\n});"},"copy":"<h2>Other animation options</h2>\n\n<p>Alongside <code>easing</code>, there are several other options you can pass in when creating an animation:</p>\n\n<pre class='prettyprint lang-js'>\nthis.animate( 'city', city, {\n  easing: 'easeOut',\n  duration: 300, // in milliseconds - default 400\n  step: function ( t, value ) {\n    // function that will be called immediately after\n    // each step of the animation loop.\n    //\n    // `t` is a value between 0 (start) and 1 (end),\n    // as determined by the easing function.\n    //\n    // `value` is the intermediate value\n  },\n  complete: function ( t, value ) {\n    // function that will be called when the animation\n    // completes - same function signature as `step`,\n    // except `t` is always 1\n  }\n});\n</pre>\n\n<p>Try using <code>Ractive.animate</code> to cycle the bar chart through a loop &ndash; each city's data is displayed for a couple of seconds before transitioning to the next one. To make it simple, the <code>&lt;select&gt;</code> has been removed. If you get stuck, use the 'fix code' button to see one possible solution.</p>\n\n<div class='hint'>\n\t<p>You can animate between numerical properties, and arrays or objects that contain numerical properties (nested however deep &ndash though be aware that <span class='logo'>Ractive.js</span> doesn't check for cyclical data structures which will cause infinite loops!).</p>\n\n\t<p>Strings, such as the city's <code>name</code> in this example, are ignored, or rather set immediately on the first animation tick. (Future versions may include clever string interpolators à la <a href='http://d3js.org/'>D3</a>.</p>\n</div>"}]},{"title":"SVG","steps":[{"template":"<svg>\n  \n  <!-- offset everything by 30,30 so we can see the labels -->\n  <g transform='translate(30,30)'>\n    \n    <!-- the rectangle -->\n    <rect width='100' height='100'/>\n\n    <!-- the area of the rectangle -->\n    <text class='area' x='50' y='50'>\n      10000 px²\n    </text>\n\n    <!-- the width -->\n    <text transform='translate( 50, -10 )'>\n      100 px\n    </text>\n\n    <!-- the height -->\n    <text transform='translate( -10, 50 ), rotate(-90)'>\n      100 px\n    </text>\n  </g>\n</svg>","styles":"svg {\n\tposition: absolute;\n\ttop: 0;\n\tleft: 0;\n}\n\nrect {\n\tfill: rgb(200,0,0);\n\tstroke: rgb(50,50,50);\n}\n\ntext {\n\ttext-anchor: middle;\n\talignment-baseline: middle;\n\tfill: rgb(150,150,150);\n}\n\ntext.area {\n\tfont-family: 'Voltaire';\n\tfill: white;\n}","javascript":"ractive = new Ractive({\n  el: output,\n  template: template\n});","init":true,"fixed":{"template":"<svg class='svg-demo-1'>\n  \n  <!-- offset everything by 30,30 so we can see the labels -->\n  <g transform='translate(30,30)'>\n    \n    <!-- the rectangle -->\n    <rect width='{{width}}' height='{{height}}'/>\n\n    <!-- the area of the rectangle -->\n    <text class='area' x='{{( width / 2 )}}' y='{{( height / 2 )}}'>\n      {{( Math.round( width * height ) )}} px²\n    </text>\n\n    <!-- the width -->\n    <text transform='translate( {{( width / 2 )}}, -10 )'>\n      {{( Math.round( width ) )}} px\n    </text>\n\n    <!-- the height -->\n    <text transform='translate( -10, {{( height / 2 )}} ), rotate(-90)'>\n      {{( Math.round( height ) )}} px\n    </text>\n  </g>\n</svg>","javascript":"ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    width: 100,\n    height: 100\n  }\n});"},"copy":"<h2>Using Ractive.js for graphics</h2>\n\n<p><span class='logo'>Ractive.js</span> works with SVG just as easily as with HTML. This makes it possible to create data-driven graphics using the same declarative structure as we use with the rest of the web.</p>\n\n<p>In the template, we've got some hard-coded values. Let's replace them with mustaches:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;!-- the rectangle --&gt;\n&lt;rect width='{{width}}' height='{{height}}'/&gt;\n</pre>\n\n<p>We can use expressions to replace the other hard-coded values:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;!-- the area of the rectangle --&gt;\n&lt;text class='area' x='{{( width / 2 )}}' y='{{( height / 2 )}}'&gt;\n  {{( Math.round( width * height ) )}} px²\n&lt;/text&gt;\n</pre>\n\n<p>Note that we're using <code>Math.round()</code> to make the end result cleaner.</p>\n\n<p>Apply similar changes to the labels, then add some data:</p>\n\n<pre class='prettyprint lang-js'>\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: { width: 100, height: 100 }\n});\n</pre>\n\n<p>Execute this code. Now we can have some fun &ndash; run the code in the console.</p>\n\n<div class='hint'>\n\t<p>SVG is a big topic; bigger than can be accommodated here. It's well worth learning how to use it though. Unfortunately, the web is littered with bad SVG tutorials, but once you get your head round the basics it all makes a lot of sense.</p>\n\n\t<p>Since you're a better (and more charismatic) developer than most, I predict you'll pick it up easily.</p>\n</div>","console":"ractive.animate({ width: 300, height: 200 }, {\n\teasing: 'easeOut',\n\tduration: 800\n});"},{"template":"<div class='temperatures'>\n\n  <!-- header and options -->\n  <div class='header'>\n    <h2>Average high and low temperature</h2>\n    \n    <!-- switch between celsius and fahrenheit -->\n    <div class='radio-group'>\n      <label>°C <input type='radio' name='{{degreeType}}' value='celsius' checked></label>\n      <label>°F <input type='radio' name='{{degreeType}}' value='fahrenheit'></label>\n    </div>\n\n    <!-- dropdown menu -->\n    <select value='{{selected}}'>\n      {{#cities:i}}\n      <option value='{{i}}'>{{name}}</option>\n      {{/cities}}\n    </select>\n  </div>\n\n  <!-- the chart -->\n  <div class='bar-chart'>\n    <svg id='svg'>\n\n      <!-- gradient - higher temperatures are redder, lower temperatures are bluer -->\n      <defs>\n        <linearGradient id='gradient' x2='0' y2='100%' gradientUnits='userSpaceOnUse'>\n          <stop offset='0%' stop-color='rgb(255,0,0)' />\n          <stop offset='100%' stop-color='rgb(0,0,255)' />\n        </linearGradient>\n      </defs>\n\n      <!-- horizontal line representing freezing -->\n      <line class='freezing' x1='0' y1='{{( yScale(0) )}}' x2='{{width}}' y2='{{( yScale(0) )}}'/>\n\n      {{#selectedCity}}\n        \n        <!-- the band -->\n        <polygon fill='url(#gradient)' stroke='url(#gradient)' class='temperature-band' points='{{( getBand(months,xScale,yScale) )}}'/>\n\n        {{#months:i}}\n          <!-- point markers for average highs -->\n          <g class='marker' transform='translate({{( xScale(i+0.5) )}},{{( yScale(high) )}})'>\n            <circle r='2'/>\n            <text y='-10'>{{( format(high,degreeType) )}}</text>\n          </g>\n\n          <!-- point markers for average lows -->\n          <g class='marker' transform='translate({{( xScale(i+0.5) )}},{{( yScale(low) )}})'>\n            <circle r='2'/>\n            <text y='15'>{{( format(low,degreeType) )}}</text>\n          </g>\n        {{/months}}\n      {{/selectedCity}}\n    </svg>\n\n    <div class='month-labels'>\n      {{#monthNames:i}}\n      <span style='width: {{( 100 / monthNames.length )}}%;'>{{( monthNames[i] )}}</span>\n      {{/monthNames}}\n    </div>\n  </div>\n</div>","styles":".temperatures {\n\tposition: relative;\n\twidth: 100%;\n\theight: 100%;\n\tpadding: 4em 0 0 0;\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.header {\n\tposition: absolute;\n\ttop: 0;\n\tleft: 0;\n\twidth: 100%;\n\theight: 2em;\n}\n\n.radio-group {\n\tdisplay: inline-block;\n\tfloat: right;\n\ttext-align: right;\n\tpadding: 0.5em 0 0 0;\n}\n\n.header h2 {\n\tfloat: left;\n\tmargin: 0;\n}\n\n.header select {\n\tposition: relative;\n\ttop: 0.1em;\n\tfloat: left;\n\tclear: left;\n\tfont-size: inherit;\n\tfont-family: inherit;\n\tz-index: 7;\n}\n\n.header label {\n\tposition: relative;\n\tz-index: 7;\n}\n\n.header p {\n\tfloat: left;\n\tclear: left;\n\tmargin: 0;\n}\n\n.bar-chart {\n\tposition: relative;\n\tpadding: 0 0 3em 0;\n\twidth: 100%;\n\theight: 100%;\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.temperature-band {\n\tfill-opacity: 0.3;\n\tstroke-width: 2;\n}\n\n.freezing {\n\tstroke: #ccc;\n\tstroke-width: 1;\n}\n\n.marker circle {\n\tfill: white;\n\tstroke: black;\n\tstroke-width: 1;\n}\n\n.marker\ttext {\n\ttext-anchor: middle;\n\tfont-family: 'Helvetica Neue', 'Arial';\n\tfont-size: 0.6em;\n\tfont-weight: bold;\n\tfill: #333;\n}\n\n.month-labels {\n\tposition: absolute;\n\tleft: 0;\n\tbottom: 0;\n\twidth: 100%;\n}\n\n.month-labels span {\n\ttext-align: center;\n\tfloat: left;\n\tdisplay: block;\n\tfont-family: 'Helvetica Neue', 'Arial';\n\tfont-size: 0.6em;\n}","javascript":"var linearScale, getPointsArray, resize, cities, ractive;\n\n// this returns a function that scales a value from a given domain\n// to a given range. Hat-tip to D3\nlinearScale = function ( domain, range ) {\n  var d0 = domain[0], r0 = range[0], multipler = ( range[1] - r0 ) / ( domain[1] - d0 );\n\n  return function ( num ) {\n    return r0 + ( ( num - d0 ) * multipler );\n  };\n};\n\n// this function takes an array of values, and returns an array of\n// points plotted according to the given x scale and y scale\ngetPointsArray = function ( array, xScale, yScale, point ) {\n  var result = array.map( function ( month, i ) {\n    return xScale( i + 0.5 ) + ',' + yScale( month[ point ] );\n  });\n\n  // add the december value in front of january, and the january value after\n  // december, to show the cyclicality\n  result.unshift( xScale( -0.5 ) + ',' + yScale( array[ array.length - 1 ][ point ] ) );\n  result.push( xScale( array.length + 0.5 ) + ',' + yScale( array[0][ point ] ) );\n\n  return result;\n};\n\nractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    format: function ( val, degreeType ) {\n      if ( degreeType === 'fahrenheit' ) {\n        // convert celsius to fahrenheit\n        val = ( val * 1.8 ) + 32;\n      }\n\n      return val.toFixed( 1 ) + '°';\n    },\n    getBand: function ( array, xScale, yScale ) {\n      var high = [], low = [];\n\n      high = getPointsArray( array, xScale, yScale, 'high' );\n      low = getPointsArray( array, xScale, yScale, 'low' );\n\n      return high.concat( low.reverse() ).join( ' ' );\n    },\n    monthNames: [ 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D' ]\n  }\n});\n\n\n// because we're using SVG, we need to manually redraw\n// when the container resizes\nresize = function () {\n  var width, height;\n\n  width = ractive.nodes.svg.clientWidth;\n  height = ractive.nodes.svg.clientHeight;\n\n  ractive.set( 'width', width );\n  ractive.get( 'height', height );\n\n  ractive.set( 'xScale', linearScale([ 0, 12 ], [ 0, width ]) );\n  ractive.set( 'yScale', linearScale([ -10, 42 ], [ height - 20, 25 ]) );\n};\n\n// For the purposes of this tutorial, we've got a global\n// onResize function which lets us safely add resize handlers\n// (they are removed each time this code re-executes)\nonResize( resize );\nresize();\n\n\n// respond to user input\nractive.observe( 'selected', function ( index ) {\n  this.animate( 'selectedCity', cities[ index ], {\n    easing: 'easeOut',\n    duration: 300\n  });\n});\n\n\n// load our data\n$.getJSON( 'files/data/temperature.json' ).then( function ( data ) {\n  cities = data;\n\n  ractive.set({\n    cities: cities,\n    selectedCity: cities[0] // initialise to London\n  });\n});","init":true,"copy":"<h2>Using Ractive.js for graphics</h2>\n\n<p>In this example, we're using the same data as in the previous tutorial to draw a combination area range and line chart. It's more of a demo than a lesson.</p>\n\n<p>There are some points worth noting here. Firstly, we're mixing HTML and SVG together in the same ractive - the two languages are treated as equals.</p>\n\n<p>Secondly, we haven't had to write a <code>render</code> or <code>update</code> function &ndash; our intentions are expressed <em>declaratively</em>. There's some custom logic to create the shape of the temperate band polygon, for example, but we don't need to specify when that logic should be invoked &ndash; the system simply reacts to new data and internal changes in state. The temperature labels don't need an event handler to tell them when to switch from °C to °F.</p>\n\n<p>Thirdly, because this is based on a template, it's much easier to understand and extend than we've come to expect data visualisations to be. Ordinarily, you'd have to maintain a complex mental model of the <em>flow</em> of your application in order to understand which bits of code affected the result in which ways &ndash; here, the link between code and result is much more obvious.</p>"},{"template":"<div class='graphic'>\n  <div class='header'>\n    {{#fullscreenEnabled}}\n      <button proxy-tap='toggleFullscreen'>Toggle fullscreen</button>\n    {{/fullscreenEnabled}}\n\n    <h3>Neuron cell diagram</h3>\n    <p>adapted from <a href='http://en.wikipedia.org/wiki/File:Complete_neuron_cell_diagram_en.svg'>Wikipedia diagram by LadyofHats</a></p>\n  </div>\n\n  <!--\n    This SVG originally came from http://en.wikipedia.org/wiki/File:Complete_neuron_cell_diagram_en.svg\n    It was modified in Adobe Illustrator, and then by hand\n  -->\n  <svg viewBox=\"{{#viewBox}}{{x}} {{y}} {{width}} {{height}}{{/viewBox}}\">\n\n    <defs>\n      <marker id='arrow-start' viewBox='0 0 14 14' refX='4' refY='7' markerUnits='strokeWidth' markerWidth='8' markerHeight='6' orient='auto'>\n        <path d='M 12 2 L 2 7 L 12 12 z' fill='#729d34'/>\n      </marker>\n\n      <marker id='arrow-end' viewBox='0 0 14 14' refX='2' refY='7' markerUnits='strokeWidth' markerWidth='8' markerHeight='6' orient='auto'>\n        <path d='M 2 2 L 12 7 L 2 12 z' fill='#729d34'/>\n      </marker>\n\n      <marker id='arrow-end-black' viewBox='0 0 14 14' refX='2' refY='7' markerUnits='strokeWidth' markerWidth='8' markerHeight='6' orient='auto'>\n        <path d='M 2 2 L 12 7 L 2 12 z' fill='#333'/>\n      </marker>\n\n      <marker id='arrow-start-outline' viewBox='0 0 14 14' refX='4' refY='7' markerUnits='strokeWidth' markerWidth='4' markerHeight='3' orient='auto'>\n        <path d='M 12 2 L 2 7 L 12 12 z' fill='#729d34' stroke-width='2' stroke='#f9f9f9' stroke-linejoin='miter'/>\n      </marker>\n\n      <marker id='arrow-end-outline' viewBox='0 0 14 14' refX='2' refY='7' markerUnits='strokeWidth' markerWidth='4' markerHeight='3' orient='auto'>\n        <path d='M 2 2 L 12 7 L 2 12 z' fill='#729d34' stroke-width='2' stroke='#f9f9f9' stroke-linejoin='miter'/>\n      </marker>\n    </defs>\n\n  \t<!-- background -->\n  \t<rect class='background' x='0' y='0' width='819.18' height='596.441'/>\n\n  \t<!-- background neurons -->\n  \t<g>\n  \t\t<path fill=\"#E2E2E2\" d=\"M815.828,533.027c-0.14-1.658-0.288-6.496,0.41-7.615c0.199-0.318,1.939,1.543,2.281,0.277\n  \t\t\tc0.176-0.652-0.865-1.123-1.262-1.449c-0.87-0.717-1.605-1.607-2.308-2.484c-1.375-1.719-2.621-3.549-4.284-5.014\n  \t\t\tc-1.634-1.438-4.537-1.922-5.818-3.711c-1.447-2.02-0.728-2.762-0.006-6.035c2.816-0.188,5.537-1.342,8.181-2.238\n  \t\t\tc1.453-0.492,3.007-0.797,4.438-1.328c1.02-0.377,1.078-1.066-0.206-1.125c-0.81-0.037-1.74,0.223-2.538,0.352\n  \t\t\tc-1.906,0.311-3.798,0.713-5.672,1.18c-6.735,1.676-10.933-1.525-17.217-2.484c-1.785-0.271-2.384-0.488-3.749-1.574\n  \t\t\tc-2.104-1.67-5.927-6.562-5.185-9.414c0.336-1.285,2.645-2.166,2.865-3.398c0.268-1.486-1.822-3.463-1.939-5.268\n  \t\t\tc-0.301-4.643,5.785-9.594,8.772-12.65c0.151,0.182,0.714,0.473,0.901,0.717c2.734-4.344,5.704-2.338,8.018,1.008\n  \t\t\tc1.295,1.873,2.168,3.148,4.064,4.518c1.822,1.314,2.048,1.162,2.232,3.059c0.171,1.738,0.114,3.867,0.084,5.656\n  \t\t\tc1.378-1.158,0.42-4.199,0.983-5.924c1.573,0,4.679,1.385,6.627,1.943c0.698,0.201,2.688,0.656,2.737,1.482\n  \t\t\tc-0.584,0.107-1.202-0.338-1.713-0.635c-0.709-0.41-1.432-0.869-1.951-1.516c1.146-0.631,2.291,0.191,3.343-0.15\n  \t\t\tc0.859-0.279,0.141-0.523-0.479-0.65c-1.358-0.275-2.797,0.42-4.161,0.369c-1.91-0.07-3.65-0.703-5.104-1.961\n  \t\t\tc-1.658-1.434-3.289-2.914-4.774-4.516c-1.528-1.65-1.392-3.639-2.531-5.01c3.184-2.566,13.02-0.367,14.863,2.594\n  \t\t\tc0.487,0.781,0.461,2.959,1.069,3.371c1.601,1.082,1.433-0.98,1.365-1.715c-0.146-1.602-2.306-3.846-3.582-4.658\n  \t\t\tc0.931-0.871,1.908-0.779,3.059-0.98c0.567-0.098,1.203-0.014,0.653-0.58c-0.497-0.514-2.377-0.533-3.064-0.514\n  \t\t\tc-1.508,0.043-1.729,0.518-2.715,0.75c-2.008,0.471-4.408-0.303-6.451-0.35c-4.337-0.1-7.403,1.055-5.322-3.992\n  \t\t\tc0.76-1.844,2.896-5.094,1.771-6.973c-2.84,0.988-2.686,7.027-4.115,9.402c-1.623,2.697-2.815,1.281-5.256,2.812\n  \t\t\tc-2.268,1.424-2.151,5.305-5.335,5.514c-4.754,0.311-5.206-8.867-5.392-11.975c-0.27-4.523,2.402-11.477,7.21-12.91\n  \t\t\tc2.551-0.762,6.446,1.098,7.838-2.146c-1.366-0.086-5.896,0.887-6.589-0.125c-0.932-1.357,1.133-3.719,1.948-4.607\n  \t\t\tc2.456-2.674,3.483-2.35,4.407-6.01c1.022-4.053,3.309-6.463,7.513-7.404c3.253-0.73,12.186-0.197,11.721-6.211\n  \t\t\tc-5.079,0.242-9.377,6.203-14.59,5.25c-0.779-4.064,0.832-10.07,3.276-13.283c2.735-3.596,11.257-4.537,11.295-9.549\n  \t\t\tc-2.66,0.713-5.086,3.373-7.61,4.555c-2.97,1.393-2.479,1.135-2.66-1.414c-0.171-2.406,0.097-4.82,0.241-7.178\n  \t\t\tc0.169-2.736,1.847-5.727,1.357-8.385c-2.961,0.389-2.412,7.953-2.6,10.322c-0.156,1.975-0.955,4.047-1.052,5.988\n  \t\t\tc-0.06,1.193,0.735,2.043,0.04,3.344c-0.372,0.693-1.562,0.748-1.955,1.393c-0.339,0.551-0.157,1.385-0.367,1.918\n  \t\t\tc-0.681,1.721-0.939,3.193-1.018,5.006c-0.138,3.203-0.969,4.154-2.407,6.982c-0.93,1.826-3.691,15.762-7.86,10.969\n  \t\t\tc-2.046-2.354,1.01-11.803,1.351-14.691c0.122-1.037,0.909-9.014-2.031-6.842c0.35,1.422,0.492,3.012,0.69,4.557\n  \t\t\tc0.307,2.391,1.298,11.68-2.481,9.691c-1.99-1.047-2.85-7.053-5.242-7.023c-3.592,0.045,1.901,4.389,2.567,5.352\n  \t\t\tc1.613,2.334,3.373,5.895,3.729,8.674c0.455,3.531-9.293,20.939-11.924,18.365c-1.874-1.834,0.456-11.062,0.684-13.365\n  \t\t\tc0.138-1.398,1.044-9.916-2.706-6.258c1.28,2.818,2.396,4.566,1.982,7.592c-0.986,7.227-4.279,14.363-10.938,17.971\n  \t\t\tc-5.446,2.947-9.716-4.002-10.315-7.281c-0.559-3.051,1.18-6.059,2.975-9.42c0.761-1.422,3.701-9.279,4.354-9.83\n  \t\t\tc-5.125,4.326-7.093,16.031-13.872,14.826c-5.669-1.006,0.119-10.83-5.23-13.312c1.4,2.453,2.591,5.289,1.656,8.883\n  \t\t\tc-1.801,6.932-2.208,5.084,4.255,7.559c2.746,1.049,4.945,2.75,4.062,6.502c-1.954,8.287-7.263,3.305-10.352,2.176\n  \t\t\tc-4.667-1.707-11.81,0.037-14.988-3.668c-2.805-3.266,0.633-8.945-0.708-12.754c-0.932-2.641-5.491-6.406-7.619-9.084\n  \t\t\tc2.151,2.107,3.183,6.428,3.934,9.492c0.728,2.977-0.747,5.838-0.458,8.873c-3.342,0.932-6.4-2.207-9.62-2.566\n  \t\t\tc-4.04-0.453-5.513-0.117-7.738-2.902c-4.001-5.008-5.258-7.68-13.797-7.09c4.075,1.162,8.441,0.863,10.598,4.238\n  \t\t\tc1.538,2.404,0.962,7.117,4.412,8.152c4.206,1.26,9.979-0.141,14.103,1.754c2.379,1.094,6.005,2.984,7.882,4.662\n  \t\t\tc-4.213,3.436-9.28,2.812-13.54,6.764c8.812-3.881,19.541-6.701,28.59-2.025c7.774,4.018-3.664,6.918-6.582,7.742\n  \t\t\tc-2.347,0.662-4.696,1.439-6.855,2.59c-1.488,0.791-3.759,3.648-5.006,4.029c-2.769,0.85-2.433-3.191-1.811-5.367\n  \t\t\tc0.866-3.023,3.509-5.225,2.207-8.545c-2.975,0.604-3.287,8.293-3.999,10.588c-2.188-0.01-3.899-0.902-6.019-0.861\n  \t\t\tc-2.005,0.037-4.93,0.557-6.517-1.16c-4.807-5.203,1.847-12.977-0.734-17.836c-2.113,2.23-0.271,7.764-2.934,9.193\n  \t\t\tc-1.347-1.154-1.859-2.512-2.825-3.957c-0.878-1.316-3.469-3.477-2.506-0.318c0.371,1.217,3.217,3.008,3.997,4.301\n  \t\t\tc1.119,1.859,1.786,3.967,2.333,6.02c0.431,1.615,1.991,5.658-1.427,5.021c-0.716-0.133-1.698-1.588-2.229-2.104\n  \t\t\tc-2.296-2.227-5.737-4.24-7.531-6.875c0.807,2.178,8.117,7.291,7.391,9.564c-3.202,1.004-6.011,4.998-9.274,5.064\n  \t\t\tc-3.555,0.072-6.606-2.854-9.667-3.939c-2.731-0.967-6.02-0.145-8.592-1.41c-2.763-1.357-3.95-4.473-5.108-7.188\n  \t\t\tc1.366,2.941,2.499,6.186,4.674,8.799c-2.396,1.166-4.474,3.055-6.657,4.352c-1.753,1.041-4.338,1.691-5.882,3.07\n  \t\t\tc2.894-0.369,5.954-1.586,8.492-3.006c1.437-0.803,3.06-1.57,4.447-2.424c0.499-0.309,0.432-1.303,1.025-1.525\n  \t\t\tc1.856-0.697,3.831,0.676,5.591,0.857c1.893,0.193,2.934-0.145,4.677,0.398c4.29,1.342,6.684,4.32,11.667,2.094\n  \t\t\tc5.082-2.273,7.943-5.975,14.006-5.75c2.287,0.084,6.258-0.127,8.018,1.584c3.127,3.041,2.372,8.412,3.894,12.084\n  \t\t\tc1.093,2.631,2.85,7.197,1.479,9.98c-2.269,4.605-7.751-0.959-10.07-2.949c-1.812,2.08,2.705,3.268,3.309,5.248\n  \t\t\tc-1.622,0.115-3.862,0.859-5.3,0.717c-8.926-0.889-1.054-13.154-5.796-17.021c-0.062,3.611,2.622,7.086-3.751,6.66\n  \t\t\tc-4.189-0.279-4.992-3.674-7.945-5.178c-5.435-2.771-16.415,0.68-22.825-2.723c3.998,3.387,7.152,4.008,13.636,4.055\n  \t\t\tc2.272,0.018,4.69-0.006,6.552,0.645c1.665,0.576,3.094,2.811,5.1,2.615c-2.096,2.48-5.697,3.828-8.346,6.27\n  \t\t\tc5.758-1.633,11.058-5.975,14.809-2.188c1.47,1.48,1.18,4.398,2.313,6.078c1.017,1.512,2.67,2.139,3.644,3.684\n  \t\t\tc-6.787,5.9-9.641,3.963-16.79,6.564c3.01-0.314,6.495,0.281,9.56-0.562c3.333-0.918,5.81-3.91,8.732-5.441\n  \t\t\tc3.271-1.715,10.118-2.402,11.274,0.189c1.549,3.467-7.182,10.385-10.391,13.652c-17.316,17.627-36.744,35.18-55.578,51.465\n  \t\t\tc-9.469,8.189-19.204,16.033-28.966,23.846h10.256c1.896-1.641,3.799-3.264,5.711-4.861c10.804-9.025,21.954-17.615,32.552-26.883\n  \t\t\tc10.708-9.365,21.209-17.506,31.916-26.949c7.286-6.426,20.713-18.475,29.266-16.549c4.521,1.021,0.337,14.518,1.817,19.332\n  \t\t\tc0.768,2.492,4.104,5.18,2.856,8.127c-0.553,1.309-3.59,3.242-4.464,5.244c-0.403,0.928-0.068,2.922-0.192,3.982\n  \t\t\tc-1.113,9.564-3.035,17.646-8.237,26.75c7.443-4.791,7.73-16.539,9.043-22.467c0.812-3.662,0.549-8.5,5.898-10.961\n  \t\t\tc4.703-2.16,4.338,1.436,7.079,2.721c4.618,2.168,13.376,1.371,18.868,2.717c7.198,1.766,15.389,3.219,21.419,6.508\n  \t\t\tc3.326,1.812,6.67,4.527,7.459,8.01c0.969,4.256,0.346,8.6,2.452,12.371c-0.105-3.164-0.502-5.395-1.151-8.086\n  \t\t\tc-0.491-2.029-2.172-4.889,1.533-7.238c2.026,2.094,6.414,0.803,8.847,0.35c0.583-0.105,3.584-0.234,2.752-1.012\n  \t\t\tc-0.472-0.438-1.913-0.172-2.513-0.172c-1.554,0-3.109-0.074-4.648-0.287c-2.616-0.361-5.232-1.131-7.398-2.689\n  \t\t\tc-8.942-6.445-24.398-5.15-33.318-12.033c-2.351,1.141-6.53,0.521-4.688-2.463c1.098-1.787,9.521-3.232,11.186-3.553\n  \t\t\tc6.505-1.242,15.601-2.807,20.387-0.109c0.435,0.246,0.896,1.951,1.812,2.424c2.474,1.277,6.289,0.537,8.498,2.02\n  \t\t\tc-2.229-2.143-6.018-2.562-8.434-4.613c-1.673-1.42-5.445-2.881-5.365-5.285c-5.989,0.857-12.687,3.486-18.05,2.844\n  \t\t\tc2.311-3.561,7.595-6.203,10.444-8.934c0.781-0.75,1.486-0.369,2.534-1.52c0.478-0.525,0.641-2.439,1.091-3.221\n  \t\t\tc1-1.732,1.865-3.498,3.016-5.105c-3.595,7.787-9.348,9.328-15.211,15.438c-4.521,4.711-13.046,9.947-17.988,9.242\n  \t\t\tc-3.183-0.449-6.962-2.555-8.135-4.545c-0.701-1.193-0.183-3.062-0.848-4.242c-0.7-1.24-2.396-0.496-2.982-1.867\n  \t\t\tc-2.092-4.896,0.909-14.098,2.434-20.084c5.998-2.676,12.426,4.168,11.794,9.025c-0.494,3.793-1.804,7.822-2.097,11.41\n  \t\t\tc1.424-3.525,2.352-7.123,3.703-10.605c1.367-3.521,0.763-4.957,3.941-3.195c1.882,1.045,3.949,4.482,5.101,6.297\n  \t\t\tc1.052,1.652,1.208,4.188,0.722,5.9c1.419-5.943-2.245-14.195-6.479-16.617c3.563-2.107,6.696,1.051,9.745-3.801\n  \t\t\tc-0.099-0.271-0.212-0.531-0.338-0.789c-0.233-0.473,12.468-4.266,12.823-4.42c-2.983-0.078-7.104,0.746-10.389,1.895\n  \t\t\tc-2.372,0.832-13.199,6.021-9.075,0.682c1.915-2.48,6.896-3.195,9.321-5.104c1.466-1.154,2.338-4.355,4.041-5.367\n  \t\t\tc3.604-2.145,5.245,1.934,7.444,2.568c3.822,1.104,8.558-0.615,10.961,2.787c0.875,1.238,0.822,2.854,1.577,4.133\n  \t\t\tc1.018,1.729,2.389,2.027,3.952,2.965c3.041,1.82,4.36,3.867,3.938,7.615c-0.206,1.83-1.841,5.705-0.416,7.045\n  \t\t\tc1.408-2.359,0.432-16.326,5.768-7.451c3.134,5.209,1.512,15.623,0.293,21.055c1.459-1.754,0.039-5.49,1.267-7.322\n  \t\t\tc0.633-0.945,1.381-0.26,1.918,0.377c0.54,0.641,0.67,1.445,1.277,2.037c0.096,0.092-0.208-0.967-0.25-1.053\n  \t\t\tc-0.209-0.432-0.539-0.834-0.771-1.262c-0.53-1.02-1.01-2.158-1.12-3.379L815.828,533.027z\"/>\n  \t\t<path fill=\"#D8D8D8\" d=\"M740.358,57.59c-2.769,0.274-5.542,0.43-8.401-0.054c-2.396-0.405-4.021-0.744-2.339-3.006\n  \t\t\tc0.866-1.165,2.16-2.127,3.35-2.981c4.87-3.5,10.002-6.285,15.644-8.323c5.634-2.036,11.462-3.619,16.776-6.308\n  \t\t\tc3.02-1.528,13.218-4.797,13.765-8.605c-3.559,0.419-6.976,2.54-10.105,4.218c-4.854,2.601-9.76,4.749-14.891,6.748\n  \t\t\tc-2.513,0.979-4.363,1.865-4.727-1.244c-0.135-1.147,1.189-8.292-0.938-4.466c-0.896,1.61-0.354,3.757-1.123,5.424\n  \t\t\tc-0.657,1.424-1.66,2.05-2.938,2.977c-1.988,1.44-3.749,3.106-5.693,4.58c-0.823,0.624-3.062,2.594-4.122,2.5\n  \t\t\tc-2.58-0.229-0.83-7.189-0.651-8.617c0.617-4.923-0.272-10.121-0.045-15.163c0.069-1.549,1.554-6.323,0.462-7.681\n  \t\t\tc-1.868-2.328-1.698,2.919-1.698,3.744c-0.001,4.267,0.406,8.537,0.151,12.803c-0.187,3.143-0.637,7.86-2.142,10.646\n  \t\t\tc-2.117,3.918-4.947,7.93-8.816,10.249c-3.938,2.362-8.409,3.624-12.602,5.442c-2.922,1.268-5.72,2.766-8.743,3.819\n  \t\t\tc-2.343,0.816-4.559,1.912-6.884,2.741c-0.986,0.351-3.425,1.356-4.488,1.195c-3.32-0.501,0.796-4.86,1.494-5.868\n  \t\t\tc1.522-2.193,3.329-5.155,5.33-6.912c2.537-2.228,7.11-3.199,10.203-4.459c1.531-0.623,4.649-1.635,4.975-3.419\n  \t\t\tc-3.826-0.698-7.467,4.329-11.193,3.923c0.245,0.027,3.689-4.133,4.018-4.529c0.856-1.038,6.934-5.731,4.769-7.76\n  \t\t\tc-1.053,0.234-2.232,2.397-2.929,3.241c-2.262,2.747-4.354,5.606-7.046,8.092c-4.34,4.008-8.494,8.265-12.734,12.376\n  \t\t\tc-2.843,2.757-5.972,6.836-9.927,7.937c-4.301,1.196-8.896,1.851-13.313,2.564c-7.095,1.146-13.351,2.998-19.936-0.331\n  \t\t\tc-4.825-2.439-9.69-3.53-13.111-7.927c-4.236-5.445-6.07-11.734-1.104-17.538c2.087-2.439,4.104-4.419,7.408-4.304\n  \t\t\tc2.854,0.1,7.078,0.963,9.561,2.36c2.703,1.522,3.976,5.498,4.716,8.292c0.807,3.048,0.396,4.972-0.204,8.055\n  \t\t\tc-0.504,2.583-1.228,4.041,0.675,5.705c1.104,0.966,1.974,2.139,3.283,2.747c1.049-1.79-2.874-3.075-3.115-4.812\n  \t\t\tc-0.134-0.964,0.559-5.982,1.553-6.194c1.161-0.247,5.373,3.446,6.327,4.354c1.7,1.619-0.5,4.332-0.976,6.341\n  \t\t\tc1.214,0.537,1.711-2.092,2.084-2.892c1.342-2.877,2.47-1.652,4.984-0.388c0.538,0.271,6.183,2.189,4.442,0.37\n  \t\t\tc-1.031-1.08-3.449-0.824-4.468-2.055c1.365-0.733,3.93-1.854,4.273-3.447c-2.019-0.986-3.031,1.434-4.801,1.731\n  \t\t\tc-1.953,0.329-4.879-1.181-6.715-1.895c-2.226-0.865-3.256-1.441-4.468-3.483c-1.087-1.831-1.508-3.952-2.386-5.807\n  \t\t\tc1.479-1.306,4.975-0.359,6.675-0.01c0.276,1.246-0.314,6.244,1.354,6.319c0.573-1.638-0.062-3.394,0.371-4.985\n  \t\t\tc0.475-1.741,2.46-1.266,4.082-1.373c1.677-0.11,3.372-0.108,5.053-0.201c0.722-0.04,2.455-0.463,3.104,0.029\n  \t\t\tc1.171,0.889,0.593,3.593,1.701,4.62c2.25,2.086,0.377-4.295,0.891-4.917c1.116-1.352,3.424-1.209,4.825-2.143\n  \t\t\tc0.507-0.338,1.72-1.33,0.517-1.779c-0.652-0.244-2.63,1.208-3.336,1.476c-3.376,1.279-7.877,0.612-11.478,1.08\n  \t\t\tc-0.896,0.117-1.859,0.232-1.704-1.253c0.063-0.616,0.843-1.596,1.165-2.072c1.062-1.572,2.849-3.188,3.438-4.974\n  \t\t\tc0.639-1.93,0.478-4.072,1.243-6.058c1.183-3.059,4.593-4.005,6.276-6.512c-1.696-1.205-4.54,4.135-6.116,4.338\n  \t\t\tc-1.151,0.148-1.285-2.195-1.225-3.295c0.12-2.209,1.37-4.61,2.054-6.691c0.741-2.261,1.789-4.36,2.592-6.58\n  \t\t\tc0.371-1.025,1.08-2.277,0.821-3.397c-1.371,0.658-1.739,3.023-2.209,4.431c-0.654,1.958-1.194,3.94-2.061,5.852\n  \t\t\tc-0.794,1.754-1.666,3.394-2.411,5.201c-0.644,1.56-0.605,2.183-0.474,3.923c0.147,1.934,0.617,4.143,0.317,6.057\n  \t\t\tc-0.243,1.548-1.418,2.953-2.027,4.449c-1.308,3.21-5.709,7.086-9.306,5.628c-1.162-0.471-2.741-0.364-3.657-1.38\n  \t\t\tc-0.611-0.678-0.947-1.907-1.365-2.705c-0.21-0.401-1.312-1.822-1.173-2.235c0.199-0.583,2.574-0.808,3.091-0.692\n  \t\t\tc2.085,0.469,2.787,4.743,4.944,4.289c0.338-1.996-1.834-3.035-2.552-4.625c1.716-1.568,3.918-0.774,5.85-1.2\n  \t\t\tc0.401-0.088,1.132-0.106,1.22-0.678c0.181-1.16-1.845-0.658-2.419-0.582c-5.258,0.704,0.327-7.466-1.425-10.041\n  \t\t\tc-2.012,2.751-1.059,7.417-3.529,9.855c-1.872-1.238-1.913-3.723-4.15-4.612c0.395-1.218,1.117-2.284,1.341-3.555\n  \t\t\tc-1.177-0.289-1.808,1.074-2.425,1.842c-2.022-1.009-2.901-3.529-4.759-4.741c-0.422,2.765,3.972,5.581,5.62,7.206\n  \t\t\tc0.755,0.745,2.43,2.479,2.146,3.577c-0.337,1.308-2.617,1.643-3.699,1.723c-3.093,0.229-7.122,0.467-9.813-1.374\n  \t\t\tc-3.646-2.494-1.732-7.867,0.817-10.322c3.632-3.495,8.252-6.546,10.742-10.98c2.618-4.663,6.471-8.467,9.772-12.628\n  \t\t\tc0.961-1.21,2.013-2.475,3.143-3.531c0.622-0.581,1.413-0.925,1.821-1.692c-1.036-0.685-2.729,0.06-3.895,0.115\n  \t\t\tc-1.353,0.063-1.355,0.019-2.373,1.208c-1.642,1.919-2.953,4.114-4.712,5.972c-1.952,2.064-3.644,5.46-5.563,1.6\n  \t\t\tc-1.085-2.18-2.373-6.768-1.297-9.094c-1.381-0.111-2.732,0.209-4.085,0.163c-0.188,0.835,0.375,1.883,0.489,2.727\n  \t\t\tc0.243,1.772,0.606,3.553,0.825,5.334c0.486,3.965-0.009,7.759-2.155,11.159c-2.37,3.754-6.525,6.096-9.408,9.458\n  \t\t\tc-2.909,3.392-4.049,6.022-5.217,0.335c-0.576-2.806-0.747-5.833-0.951-8.682c-0.184-2.557-1.305-6.454-0.812-8.891\n  \t\t\tc0.844-4.164,5.813-4.73,7.072-8.772c-2.761-0.27-4.914,4.694-7.93,4.596c-0.449-2.183-0.469-4.801-0.681-7.259h-2.283\n  \t\t\tc0.292,3.781,1.597,8.163,2.144,10.796c0.979,4.714,1.919,10.358,1.955,15.155c0.037,4.936-0.312,10.207-2.015,14.878\n  \t\t\tc-2.19,6.003-8.037,9.984-14.47,9.715c-2.329-0.098-4.073-1.466-5.878-2.78c-1.833-1.334-1.837-2.382-0.917-4.493\n  \t\t\tc0.678-1.553,1.578-3.273,3.272-3.886c1.685-0.61,12.216,0.257,12.221-1.579c0.006-2.451-7.383,1.292-7.629-0.688\n  \t\t\tc-0.141-1.132,3.902-2.688,4.706-3.28c2.531-1.869-0.087-6.215,1.707-8.768c0.888-1.263,2.112-2.58,3.4-3.396\n  \t\t\tc0.856-0.542,2.959-1.411,2.215-2.841c-1.256-2.412-4.75,2.891-5.448,3.667c-0.743,0.826-1.708,2.376-2.785,1.555\n  \t\t\tc-0.669-0.51-0.954-2.528-1.074-3.279c-0.192-1.211,0.145-2.647-0.437-3.74c-0.51-0.961-1.412-1.346-2.112-0.095\n  \t\t\tc-1.194,2.136,1.5,5.281,2.256,7.14c1.117,2.749,3.898,7.11,0.349,9.09c-1.499,0.836-5.852,4.478-5.338,0.504\n  \t\t\tc0.11-0.863,0.412-1.775-0.312-2.411c-0.619-0.543-0.973-0.469-1.422,0.335c-0.922,1.647,1.1,3.444-0.203,5.172\n  \t\t\tc-0.699,0.927-3.098,2.585-4.233,2.385c-0.32-2.502,0.734-4.687,1.387-7.033c0.23-0.837,1.336-3.253,0.106-3.925\n  \t\t\tc-2.573-1.408-1.886,5.8-1.989,6.465c-0.809,5.136-3.19,0.313-4.347-1.517c-0.634-1.003-1.75-1.907-2.109-0.193\n  \t\t\tc-0.191,0.914,0.618,2.04,1.079,2.833c1.244,2.142,3.343,4.307,4.082,6.659c0.656,2.089-1.325,4.009-3.224,4.785\n  \t\t\tc-2.414,0.987-3.277-1.493-3.974-3.425c-0.382-1.062-0.356-3.349-1.178-4.118c-0.694-0.65-2.286-0.333-2.771,0.523\n  \t\t\tc-0.904,1.598,2.174,3.492,2.811,4.85c2.228,4.757-6.603,5.442-7.785,0.993c-0.562-2.107-0.693-4.624-0.688-6.837\n  \t\t\tc0.004-1.492,0.091-2.914,0.686-4.229c0.815-1.809,2.69-4.477,4.416-5.432c2.444-1.354,5.253-2.182,7.938-2.908\n  \t\t\tc2.602-0.703,4.853-1.954,7.555-2.47c0.771-0.147,3.292-0.578,2.761-1.855c-0.772-1.857-2.524,0.442-3.535,0.487\n  \t\t\tc-1.752,0.078-0.109-3.244,0.155-3.903c0.888-2.213,1.495-4.425,3.376-6.087c1.153-1.02,1.399-0.437,2.616-0.804\n  \t\t\tc1.15-0.347,2.01-1.76,0.356-2.045c-1.316-0.228-2.574,1.82-3.598,2.187c0.308-2.141,1.396-4.127,2.163-6.168\n  \t\t\tc0.566-1.51,1.591-5.235,2.65-5.847c-1.083,0.049-2.146-0.217-3.267-0.146c0.188,2.135-0.824,4.444-1.541,6.466\n  \t\t\tc-1.053,2.969-1.973,5.948-3.098,8.887c-0.818,2.144-1.062,5.128-2.746,6.828c-1.674,1.688-4.693,2.449-6.875,3.265\n  \t\t\tc-1.388,0.519-5.019,3.239-6.064,1.184c-0.514-1.009-0.623-3.303-2.232-1.507c-1.366,1.523,0.657,3.056,0.141,4.611\n  \t\t\tc-0.368,1.107-2.497,2.633-3.38,3.426c-0.253-2.015-1.316-3.976-1.4-6.014c-0.061-1.442,0.633-2.938,0.984-4.325\n  \t\t\tc0.493-1.946,0.695-4.064,2.455-5.172c2.098-1.321,4.412-2.093,6.604-3.164c1.953-0.955,4.251-1.471,5.748-3.156\n  \t\t\tc1.657-1.865,3.316-3.732,4.051-6.265c0,0-0.021-2.119-0.118-5.057c-1.805,5.539-0.726,2.648-3.45,7.578\n  \t\t\tc-1.416,2.561-3.739,3.713-6.267,4.893c-0.658,0.308-7.862,3.193-7.937,3.128c-1.252-1.121-2.826-2.197-3.75-3.384\n  \t\t\tc-1.441-1.852-1.661-5.321-1.586-7.612c0.021-0.646,0.307-1.28,0.312-1.91c0.019-1.662-1.913-2.068-3.074-1.31\n  \t\t\tc-2.171,1.415,0.852,2.785,1.515,4.26c0.876,1.946-0.388,4.443,0.385,6.198c0.604,1.372,2.766,2.087,3.451,3.422\n  \t\t\tc0.705,1.373-0.303,3.247-0.744,4.652c-0.371,1.182-1.188,5.788-2.889,4.647c-0.81-0.542-1.479-2.597-1.884-3.443\n  \t\t\tc-0.689-1.441-1.327-2.882-2.063-4.295c-1.257-2.414-3.558-5.244-3.787-7.915c-0.08-0.933,0.454-1.491-0.684-2.11\n  \t\t\tc-0.897-0.488-1.486-0.246-1.896,0.692c-0.824,1.891,1.33,3.652,2.244,5.035c3.424,5.182,5.789,10.926,8.385,16.509\n  \t\t\tc1.316,2.833,2.62,5.354,2.624,8.598c0.006,3.926-1.418,9.434-5.889,10.357c-1.735,0.359-4.096,0.221-5.646-0.722\n  \t\t\tc-1.586-0.965-2.774-2.873-3.563-4.484c-0.748-1.526-0.952-2.167-0.346-3.57c0.288-0.665,0.876-3.037-1.074-2.797\n  \t\t\tc-1.28,0.157,0.185,3.035-1.17,2.728c-0.585-0.133-1.862-3.568-2.266-4.222c-3.375-5.474-6.704-10.923-9.553-16.7\n  \t\t\tc-3.193-6.476-7.488-12.421-11.771-18.222l-11.257-0.003c2.35,3.602,4.718,7.19,7.096,10.771\n  \t\t\tc4.536,6.832,10.765,13.557,13.475,21.752c2.577,7.798,7.14,12.11,11.44,18.626c0.85,1.285,2.296,2.924,2.464,4.582\n  \t\t\tc0.557,5.442-3.619,2.056-5.47,0.115c-5.068-5.313-12.244-11.032-13.797-18.598c-0.198-0.967-1.878-9.505-3.34-6.966\n  \t\t\tc-0.706,1.226,0.401,4.746,0.709,6.006c0.345,1.416,0.619,2.886,0.706,4.323c-0.7-0.212-1.234-1.022-1.856-1.484\n  \t\t\tc-1.489-1.105-3.105-2.179-4.677-3.172c-3.376-2.135-6.604-4.556-9.871-6.841c-3.771-2.637-7.409-5.457-11.225-8.012\n  \t\t\tc-1.927-1.29-4.224-3.809-6.564-4.211c-0.339,1.302,1.697,2.038,2.491,2.625c1.221,0.903,3.207,2.276,3.896,3.628\n  \t\t\tc-3.484,1.521-7.291,2.762-10.932,3.89c-2.153,0.668-4.271,1.243-6.365,2.08c-1.437,0.573-3.728,0.853-4.7,2.16\n  \t\t\tc1.821,0.81,5.146-1.305,6.831-1.872c3.604-1.211,7.33-2.061,10.955-3.213c3.688-1.173,6.855-0.291,9.313,2.929\n  \t\t\tc1.186,1.554,0.388,2.416-0.9,3.737c-2.866,2.943-6.478,5.083-9.868,7.338c-2.133,1.418-4.096,2.671-6.562,3.337\n  \t\t\tc-1.832,0.495-4.293,1.472-5.793,2.654c0.749,1.513,6.396-1.583,7.527-2.098c2.099-0.955,4.135-2.166,6.134-3.325\n  \t\t\tc1.172-0.679,2.74-2.127,4.09-2.315c0.653,1.591-0.813,7.553,1.414,8.137c0.106-1.598,0.219-3.208,0.306-4.811\n  \t\t\tc0.074-1.374-0.087-3.897,0.768-5.058c0.723-0.984,1.94-1.602,2.988-2.17c1.011-0.548,1.386-1.077,2.2-1.741\n  \t\t\tc1.265-1.028,3.879-1.131,5.372-0.615c1.343,0.465,2.58,1.781,3.687,2.644c1.506,1.173,3.052,2.259,4.546,3.454\n  \t\t\tc3.825,3.058,7.233,6.491,10.757,9.882c3.346,3.221,5.664,7.142,8.79,10.488c2.709,2.898,3.458,6.489,3.271,10.46\n  \t\t\tc-0.026,0.58,0.17,1.946-0.33,2.395c-1.079,0.968-1.915-0.801-2.251-1.71c-0.262-0.707-0.257-5.052-1.51-4.13\n  \t\t\tc-0.744,0.548,0.03,2.798-0.062,3.572c-1.799,0.417-3.396-4.121-4.969-2.247c-1.438,1.714,3.577,3.151,4.487,3.821\n  \t\t\tc3.546,2.61,3.781,8.562,0.64,11.78c-2.457,2.516-7.923-1.945-10.066-3.525c-1.537-1.133-3.266-2.521-4.098-4.286\n  \t\t\tc-1.127-2.391,0.681-3.318,1.107-5.52c0.402-2.061-1.026-6.705-2.199-8.287c-2.246,1.629,1.083,5.034,0.991,6.919\n  \t\t\tc-0.051,1.038-0.797,1.926-1.479,2.713c-0.828,0.957-0.8,1.169-1.806,0.339c-3.082-2.545-3.137-8.299-2.23-11.693\n  \t\t\tc0.743-2.783,1.93-5.309,2.804-8.036c0.22-0.688,1.05-3.289,0.038-3.808c-0.714-0.367-0.882,0.41-1.093,1.079\n  \t\t\tc-0.415,1.316-0.522,8.078-2.397,8.377c-1.262,0.202-3.633-6.737-4.77-7.611c-1.092-0.839-1.834-0.451-1.555,0.931\n  \t\t\tc0.236,1.175,1.651,2.674,2.242,3.728c1.175,2.093,3.543,4.758,3.529,7.232c-0.004,0.703-0.361,1.561-0.304,2.395\n  \t\t\tc0.057,0.829,0.544,2.49,0.174,3.285c-0.894,1.916-4.417-0.406-6.159,0.203c-3.115,1.089,2.468,2.033,3.405,2.075\n  \t\t\tc3.094,0.139,3.32,0.461,4.44,3.272c1.12,2.813-1.412,2.554-3.716,3.25c-3.483,1.053-5.773,2.27-7.612-1.854\n  \t\t\tc-0.355-0.799-1.229-3.079-2.06-1.417c-0.375,0.75,0.787,2.574,1.198,3.112c0.884,1.155,2.451,1.558,0.796,2.458\n  \t\t\tc-1.245,0.676-3.342,0.912-4.736,0.974c-0.632,0.028-1.513,0.136-2.079-0.203c-0.802-0.479-0.751-1.916-1.356-2.351\n  \t\t\tc-2.127-1.524-0.268,2.068-0.001,2.591c0.902,1.77-0.549,1.623-2.201,1.983c-2.984,0.651-6.027-0.066-7.484-3.053\n  \t\t\tc-0.697-1.43-0.454-3.247-0.297-4.777c0.162-1.567,1.126-4.239,0.306-5.7c-1.009,0.535-0.819,3.092-0.946,4.111\n  \t\t\tc-0.189,1.522,0.081,3.812-0.598,5.139c-1.993-1.099-3.906-3.441-5.473-5.131c-1.42-1.533-1.885-3.783-3.754-4.806\n  \t\t\tc-0.259,1.8,2.048,3.032,1.836,4.771c-1.062,0.414-2.795,0.133-3.562,1.028c1.175,0.087,2.086-0.059,3.261-0.099\n  \t\t\tc1.374-0.046,1.734,0.413,2.732,1.455c2.181,2.276,4.683,4.183,6.895,6.427c0.941,0.956,1.83,2.175,3.232,2.428\n  \t\t\tc-0.017,0.099,0.001,0.349,0.001,0.461c-2.027-0.004-3.572,2.802-5.133,3.813c-1.93,1.25-3.158-0.947-4.962-1.535\n  \t\t\tc0.026,1.986,3.664,2.033,3.941,3.59c0.214,1.206-2.392,3.444-2.737,4.785c1.251,0.921,5.274-6.28,6.342-7.403\n  \t\t\tc2.264-2.379,5.398-3.199,8.429-4.14c2.971-0.923,5.86-2.034,8.89-2.782c1.235-0.305,5.188-1.896,5.756-0.551\n  \t\t\tc0.335,0.794-0.704,2.864-1.109,3.562c-0.9,1.554-1.752,3.137-3.567,3.437c-0.5,0.083-5.027-0.456-3.792,0.516\n  \t\t\tc1.232,0.968,3.459-0.585,4.798-0.142c0.217,1.433-1.829,3.482-2.424,4.776c-1.039,2.263,0.425,1.958,1.375,0.315\n  \t\t\tc1.114-1.928,1.866-4.175,2.757-6.2c0.679-1.543,1.42-3.009,2.274-4.458c1.761-2.984,5.315-4.376,8.417-2.499\n  \t\t\tc2.539,1.539,5.123,3.21,7.407,5.246c1.533,1.366,2.879,2.721,4.603,3.86c1.739,1.151,3.513,2.481,4.719,4.133\n  \t\t\tc1.398,1.917,2.478,3.974,2.171,6.438c-0.529,4.257-3.547,7.915-7.04,10.21c-0.571,0.375-1.513,0.629-1.372,1.533\n  \t\t\tc0.232,1.495,2.49,0.467,2.358,2.029c-0.076,0.904-1.937,2.542-2.521,3.143c-1.215,1.249-2.595,2.325-3.939,3.426\n  \t\t\tc-2.69,2.203-5.438,4.108-8.595,5.536c-4.799,2.17-9.543,4.622-14.63,5.99c-1.422,0.382-3.881,0.675-4.991,1.544\n  \t\t\tc-0.626,0.489-1.072,1.378-0.139,1.875c0.74,0.393,2.001-0.47,2.55-0.834c0.917-0.611,1.407-0.976,2.568-1.333\n  \t\t\tc2.245-0.69,6.42-2.689,8.771-2.084c3.003,0.773-2.146,7.73-3.248,9.051c-1.862,2.229-3.56,4.593-5.307,6.929\n  \t\t\tc-0.979,1.311-3.086,3.078-3.609,4.63c-0.274,0.813-0.325,1.767,0.824,1.732c1.2-0.036,1.622-2.172,2.094-2.944\n  \t\t\tc2.188-3.592,5.768-6.647,8.354-9.974c2.562-3.294,5.184-6.652,7.915-9.75c2.464-2.794,5.629-5.744,8.774-7.749\n  \t\t\tc0.823-0.525,2.135-1.531,3.129-0.859c1.248,0.844,0.275,3.034-0.129,4.093c-0.901,2.358-2.311,4.441-3.462,6.682\n  \t\t\tc-0.808,1.57-2.674,4.133-2.913,5.884c-0.144,1.038-0.073,1.146,1.002,0.718c1.022-0.407,1.374-1.467,1.673-2.484\n  \t\t\tc1.083-3.687,2.596-6.82,4.514-10.151c0.776-1.348,1.667-2.665,2.609-3.914c0.969-1.285,2.149-3.293,3.599-4.087\n  \t\t\tc3.738-2.049,4.92,3.013,5.637,5.744c1.25,4.763,1.989,9.761,2.563,14.646c0.35,2.986,0.022,7.685,1.584,10.25\n  \t\t\tc2.506-5.183-1.036-15.32-1.945-21.038c-0.939-5.916,0.82-8.041,5.089-10.42c3.74-2.086,7.342-1.715,11.146-3.819\n  \t\t\tc5.032-2.785,8.411-4.156,13.996-1.682c2.566,1.137,4.52,4.282,4.548,7.098c0.018,1.84-1.787,2.901-3.243,3.603\n  \t\t\tc-0.903,0.435-9.149,2.604-8.576,3.835c0.768,1.648,8.212-3.44,10.09-3.073c2.121,0.415-4.885,13.839-5.662,15.132\n  \t\t\tc-2.656,4.427-7.006,4.795-11.682,4.241c-2-0.237-4.028-0.759-5.726-1.867c-0.713-0.465-1.715-1.606-2.705-0.863\n  \t\t\tc-2.636,1.976,6.681,3.575,7.425,3.753c1.302,0.311,3.026,0.704,2.774,2.146c-0.238,1.377-2.043,2.258-3.046,3.005\n  \t\t\tc-1.493,1.112-2.965,2.257-4.526,3.284c-2.93,1.926-5.958,3.694-9.124,5.198c-1.255,0.596-3.23,1.318-3.989,2.576\n  \t\t\tc-0.523,0.869-0.677,1.968,0.172,2.626c1.35,1.046,2.451-0.517,3.146-1.556c0.979-1.465,1.968-2.316,3.432-3.431\n  \t\t\tc1.87-1.425,4.854-3.663,7.157-3.98c0.113,2.047-0.938,3.217-1.538,5.128c-0.761,2.414-1.549,4.816-2.52,7.197\n  \t\t\tc-1.188,2.917-2.56,3.618-5.244,5.19c-0.945,0.553-2.932,1.466-3.521,2.455c-0.965,1.612,0.881,1.271,1.852,0.511\n  \t\t\tc2.031-1.591,3.556-2.925,5.981-3.8c0.425,0.891,0.126,1.97,0.374,2.906c0.405,1.53,1.271,1.303,1.375-0.301\n  \t\t\tc0.077-1.197-0.66-2.158-0.515-3.292c0.286-2.241,1.625-4.743,2.58-6.776c1.475-3.142,3.019-6.377,4.689-9.412\n  \t\t\tc0.771-1.4,1.988-2.482,3.221-3.569c2.105-1.856,4.625-5.288,7.54-5.814c4.409-0.796,0.425,9.2-0.154,10.901\n  \t\t\tc-0.673,1.976-1.24,3.456-2.705,4.982c-0.975,1.015-2.332,1.826-3.181,2.919c-0.471,0.609-1.106,1.14-0.091,1.378\n  \t\t\tc1.1,0.258,2.173-1.627,2.713-2.359c0.768-1.039,1.993-3.618,3.417-3.778c0.17,1.238-0.339,2.408-0.614,3.589\n  \t\t\tc-0.519,2.229-0.904,4.48-1.423,6.712c-0.614,2.652-0.749,6.038-2.042,8.463c-1.24,2.328-3.865,4.501-5.574,6.51\n  \t\t\tc-1.179,1.383-2.473,2.731-3.579,4.12c-0.372,0.467-1.339,1.591-1.192,2.231c0.468,2.052,3.45-3.081,4.309-3.722\n  \t\t\tc0.746,1.787-0.322,3.966,0.329,5.779c1.935-0.849,0.673-4.065,1.041-5.672c0.47-2.047,2.558-4.146,3.79-5.881\n  \t\t\tc0.413-0.581,1.458-3.05,2.408-3.026c1.095,0.028,1.194,3.85,1.203,4.788c0.021,2.313-2.234,3.531-3.67,5.167\n  \t\t\tc-0.475,0.539-2.151,1.751-1.811,2.58c0.512,1.235,1.788,0.044,2.208-0.427c0.691-0.775,1.36-1.962,1.896-2.853\n  \t\t\tc0.215-0.357,0.403-1.366,0.896-1.514c1.182-0.354,1.125,1.502,1.978,1.84c1.062-1.197-0.126-3.753-0.124-5.314\n  \t\t\tc0.003-2.401-0.155-4.872-0.307-7.261c-0.168-2.681,0.242-5.302,0.696-7.91c0.558-3.198,0.844-6.441,1.29-9.655\n  \t\t\tc0.3-2.161-0.077-5.223,1.406-7.03c1.466-1.785,2.546,0.665,2.945,2.141c0.838,3.093,0.872,6.405,1.232,9.568\n  \t\t\tc0.243,2.128,0.056,4.694,0.595,6.746c0.256,0.975,0.899,2.203,1.955,1.298c1.2-1.028-0.018-2.835-0.397-3.852\n  \t\t\tc-1.128-3.017-1.296-7.229-1.515-10.499c-0.095-1.417-0.007-2.376,1.543-1.938c0.951,0.269,2.604,2.845,3.628,2.611\n  \t\t\tc0.752-0.171,0.65-0.949,0.388-1.43c-0.49-0.892-1.652-0.749-2.454-1.114c-1.582-0.721-2.904-2.386-3.784-3.833\n  \t\t\tc-0.916-1.508-2.356-3.015-2.884-4.641c-0.53-1.637,0.834-4.03,1.468-5.477c0.818-1.872,1.686-3.577,2.964-5.183\n  \t\t\tc1.636,0.285,2.901,2.041,3.064,3.778c0.184,1.939-1.647,3.468-1.73,5.339c-0.11,2.531,1.718,0.287,1.98-1.21\n  \t\t\tc0.477-2.714,1.658-1.544,2.186,0.658c0.479,1.996,1.027,4.012,1.344,6.041c0.209,1.334,0.136,2.942,0.763,4.175\n  \t\t\tc0.825,1.622,1.834,0.685,1.855-0.896c0.03-2.021-1.417-4.466-2.026-6.366c-0.879-2.733-1.45-5.558-2.319-8.295\n  \t\t\tc-0.832-2.619-1.752-5.219-2.212-7.954c-0.501-2.977-0.079-13.404,2.688-14.643c1.997-0.893,2.777,1.631,3.655,3.946\n  \t\t\tc0.273,0.722,0.885,1.139,1.081,1.896c0.423,1.623-0.784,4.271,0.427,5.759c2.222,2.73,1.511-1.83,3.482-1.668\n  \t\t\tc4.168,0.342,6.985,13.124,6.393,16.202c-0.487,2.541-0.487,3.811-0.071,6.576c0.416,2.769,1.034,12.63,4.622,12.498\n  \t\t\tc-1.737,0.064-1.288,4.687-1.192,5.615c0.277,2.689,1.229,5.345,1.903,7.959c0.28,1.093,0.332,2.542,1.047,3.466\n  \t\t\tc0.358,0.464,1.74,1.621,2.32,1.562c-1.31,0.132-1.479,2.103-1.594,3.135c-0.402,3.643,0.766,7.534,1.234,11.141\n  \t\t\tc0.367,2.817,0.32,12.377,4.266,11.774c0.888,1.653-0.572,1.782-0.977,3.284c-0.708,2.636,0.47,6.049,0.783,8.667\n  \t\t\tc0.205,1.711,0.23,5.968,1.48,7.378c0.661,0.741,1.746,1.28,2.294,2.025c-0.577,1.329-1.639,0.692-1.575,2.491\n  \t\t\tc0.134,3.775,1.267,7.658,1.781,11.421c0.243,1.779,0.521,3.535,0.881,5.293c0.146,0.712,0.145,1.767,0.488,2.395\n  \t\t\tc0.762,1.389,2.236,0.877,3.437,1.394c-1.136,1.226-1.676,1.275-1.462,3.073c0.376,3.152,0.617,6.366,0.902,9.533\n  \t\t\tc0.106,1.188,0.062,2.458,0.445,3.603c0.562,1.686,1.158,1.309,2.615,1.732c-0.632,0.683-0.848,0.99-0.842,1.929\n  \t\t\tc0.009,1.356,0.448,2.7,0.753,4.012c0.456,1.964,0.539,3.99,0.879,5.974c0.338,1.977,0.386,4.269,1.121,6.122\n  \t\t\tc0.451,1.133,1.463,1.47,2.587,1.897c-0.482,0.624-1.119,0.863-1.363,1.604c-0.438,1.319,0.217,3.391,0.43,4.718\n  \t\t\tc0.31,1.923,0.234,4.78,1.133,6.541c0.479,0.934,1.77,1.113,2.165,2.083c-2.376,1.502-0.877,5.02-0.325,7.289\n  \t\t\tc0.431,1.77,0.814,3.555,1.162,5.342c0.203,1.047,0.384,1.945,1.252,2.627c0.799,0.629,0.924,0.25,0.565,1.16\n  \t\t\tc-0.472,1.197-0.865,1.914-0.745,3.227c0.153,1.676,0.372,3.348,0.55,5.021c0.181,1.699,0.058,4.715,0.987,6.244\n  \t\t\tc0.432,0.709,1.594,1.16,2.312,1.498c-0.896,0.381-1.13,0.119-1.451,0.988c-0.844,2.275,0.025,5.939,0.209,8.273\n  \t\t\tc0.112,1.422,0.021,3.305,0.936,4.48c0.688,0.887,1.148,0.582,2.086,0.65c-0.191,0.52-0.744,0.498-1.023,0.949\n  \t\t\tc-0.216,0.352-0.109,1.24-0.094,1.633c0.155,3.625,0.812,7.438,1.41,11.021c0.319-0.041,2.046,0.367,2.313,0.621\n  \t\t\tc0.501,0.477,0.563,1.879,0.656,2.502c0.584,3.92,0.575,7.916-0.629,11.682c-0.633,1.979-0.751,4.084-1.279,6.094\n  \t\t\tc-0.598,2.279-1.43,4.492-2.347,6.66c-0.75,1.773-1.572,3-2.573,4.467c-0.971,1.424-1.388,3.344-2.349,4.793\n  \t\t\tc-0.626,0.943-1.314,1.855-1.905,2.795c-0.881,1.402-1.404,2.961-2.123,4.465c-0.81,1.691-1.786,3.242-2.422,5.066\n  \t\t\tc-0.294,0.842-0.328,2.055-0.634,2.777c-0.73,1.734-2.998,2.215-4.464,2.803c-2.269,0.91-4.68,1.729-7.129,1.906\n  \t\t\tc-4.451,0.322-7.103,7.516-11.339,9.201c1.797-0.748,3.39-1.771,4.968-3.047c1.818-1.471,4.181-4.348,6.456-4.742\n  \t\t\tc0.928-0.164,1.823,0.281,2.786,0.191c1.877-0.176,3.599-1.256,5.43-1.434c0.053,1.926-2.053,4.305-3.095,5.566\n  \t\t\tc-1.239,1.498-2.735,2.041-4.004,3.338c-1.503,1.535-2.731,3.463-4.209,4.99c-1.708,1.766-3.809,2.838-5.747,4.199\n  \t\t\tc-3.089,2.168-8.151,3.963-10.036,7.547c-0.854,1.621-1.29,3.861-1.896,5.645c-1.035,3.053-2.528,6.049-2.312,9.57\n  \t\t\tc0.896-1.156,1.378-3.494,1.896-4.994c0.855-2.473,1.438-6.027,2.822-8.035c1.358-1.967,3.892-2.986,5.66-4.377\n  \t\t\tc3.282-2.58,6.423-5.27,9.791-7.688c0.55-0.395,2.425-2.363,3.203-1.529c0.622,0.664-0.348,4.639-0.438,5.424\n  \t\t\tc-0.208,1.818-3.288,12.449-0.26,13.17c0.604-1.756,0.773-3.869,1.05-5.762c0.408-2.816,0.728-5.66,1.068-8.51\n  \t\t\tc0.271-2.283,0.457-5.6,1.749-7.391c0.702-0.979,1.79-1.803,2.595-2.826c0.865-1.1,1.601-2.359,2.45-3.488\n  \t\t\tc0.491-0.656,1.037-2.006,1.564-2.502c0.319-0.299-0.108-0.842,0.589-0.459c0.121,0.064,0.607,1.488,0.673,1.662\n  \t\t\tc0.724,1.957,1.442,3.844,3.287,4.453c-0.337-2.51-2.639-4.6-2.888-6.945c-0.31-2.902,1.455-7.291,3.052-9.131\n  \t\t\tc2.082-2.4,3.162-5.842,4.596-8.916c1.02-2.189,3.186-8.461,5.72-8.121c2.354,0.314,3.767,4.596,4.551,6.869\n  \t\t\tc1.6,4.629,1.263,9.451,0.564,14.133c-0.491,3.293-1.699,6.971-1.096,10.27c0.642,3.486,2.446,6.523,3.231,9.99\n  \t\t\tc0.878,3.883,1.166,8.156-0.342,11.604c-0.979,2.24-3.152,3.643-1.329,6.434c0.471,0.725,1.319,1.844,2.009,1.051\n  \t\t\tc0.649-0.74-0.212-2.256-0.275-3.016c-0.21-2.498,0.964-5.283,1.146-7.811c0.213-2.932,0.074-5.885-0.268-8.846\n  \t\t\tc-0.44-3.838-2.037-7.275-2.244-11.105c1.356,1.117,2.608,2.43,3.91,3.682c1.823,1.752,3.914,2.66,5.911,3.996\n  \t\t\tc2.479,1.658,3.217,6.346,3.723,9.512c0.779-1.145-0.148-4.975-0.393-6.52c-0.341-2.174-0.414-3.102-2.006-4.379\n  \t\t\tc-1.895-1.523-3.943-2.771-5.747-4.5c-1.062-1.016-2.698-2.051-3.486-3.371c-1.966-3.291-0.188-7.805-0.09-11.207\n  \t\t\tc0.2-7.062,5.542,1.17,6.907,3.498c0.449,0.771,1.286,2.568,2.299,2.164c0.536-0.215,0.923-1.459,0.501-2.154\n  \t\t\tc-0.478-0.787-1.456-0.318-2.156-0.889c-1.149-0.936-2.043-3.381-2.891-4.707c-0.673-1.053-1.355-1.783-2.096-2.752\n  \t\t\tc-1.605-2.105-2.686-5.865-3.521-8.486c-0.646-2.027-2.3-5.684-1.057-7.609c1.607-2.494,5.911,1.424,7.432,2.873\n  \t\t\tc3.26,3.105,6.382,8.32,8.438,12.615c2.464,5.15-0.512,11.812-1.269,16.803c-0.36,2.375,0.781,4.969,1.165,7.432\n  \t\t\tc0.278,1.777,0.443,3.457,0.444,5.215c0,0.643-0.208,1.129,0.023,1.85c2.3,0.098,0.752-5.453,0.402-6.842\n  \t\t\tc-0.469-1.863-1.146-5.295-0.421-7.107c2.705,0.971,3.588,7.402,5.201,9.834c0.577,0.869,2.002,2.365,2.043,0.494\n  \t\t\tc0.024-1.154-0.745-1.197-1.281-1.758c-1.793-1.873-2.982-4.709-4.13-7.242c-0.996-2.197-1.924-4.121-0.956-6.418\n  \t\t\tc0.129,0.025,0.154,0.102,0.297,0.123c0.696-1.055,0.647-2.912,0.975-4.229c0.447-1.795,0.54-2.297,1.614-0.707\n  \t\t\tc3.92,5.807,7.707,12.625,10.337,19.41c2.914,7.52-2.168,12.613-4.373,18.748c-0.448,1.25-0.853,2.582-0.262,3.973\n  \t\t\tc0.772,1.812,1.936,1.262,2.103-0.531c0.134-1.432-0.335-2.035,0.129-3.508c0.742-2.363,2.148-4.215,2.936-6.564\n  \t\t\tc0.475-1.422,2.154-8.791,3.638-4.893c0.531,1.395,0.633,2.377,1.475,3.633c1.154,1.727,1.531,2.865,1.966,5.029\n  \t\t\tc0.889,4.439,2.272,8.941,2.278,13.498c0.001,1.033-0.722,3.092,0.178,3.818c0.806,0.656,2.05-0.383,2.406-1.154\n  \t\t\tc0.657-1.424,0.01-3.201-0.521-4.623c-1.812-4.859-2.914-9.865-4.484-14.812c-1.158-3.645-3.421-7.828-2.525-11.672\n  \t\t\tc1.589,1.027,3.408,1.869,4.735,3.303c1.169,1.262,5.439,7.004,6.854,3.467c0.381-0.955,0.073-1.367-0.503-1.986\n  \t\t\tc-0.933-1-1.143-0.271-2.04-0.242c-1.646,0.053-2.795-1.256-3.85-2.648c-0.92-1.215-2.052-2.133-2.959-3.361\n  \t\t\tc-0.28-0.379-0.358-0.84-0.748-1.152c-0.797-0.643-1.924-0.424-2.873-0.779c-2.23-0.838-3.219-3.225-4.316-5.523\n  \t\t\tc-1.174-2.461-2.732-4.438-4.207-6.641c-1.723-2.576-3.183-5.396-4.502-8.281c-0.355-0.781-1.618-3.146-1.292-4.018\n  \t\t\tc0.45-1.197,2.288-0.402,3.026-0.051c2.253,1.078,4.065,3.168,6.103,4.729c1.758,1.346,3.658,2.273,5.472,3.469\n  \t\t\tc1.157,0.762,2.934,1.434,3.896,2.547c2.064,2.393,3.769,14.629,7.37,14.057c0.322-1.172-0.213-2.223-0.909-2.984\n  \t\t\tc-1.093-1.197-1.585-1.316-2.348-3.076c-0.785-1.812-4.226-9.473-0.098-6.646c3.513,2.4,7.194-0.457,10.81-0.105\n  \t\t\tc2.028,0.197,6.965,7.686,8.596,5.83c0.602-0.684,0.182-1.988-0.712-2.193c-1.413-0.324-1.067,1.043-2.487-0.193\n  \t\t\tc-1.302-1.137-2.313-2.65-3.602-3.818c-1.935-1.752-2.462-1.57-4.646-1.121c-4.225,0.873-9.353,0.908-13.021-2.299\n  \t\t\tc-2.567-2.24-5.378-4.469-7.899-6.789c-0.3-0.273-0.611-0.545-0.894-0.85c0.747-0.594,2.126-0.215,3.031-0.307\n  \t\t\tc1.137-0.111,1.91-0.131,3.068,0.377c1.396,0.611,8.115,5.994,8.793,2.285c-1.135-0.516-1.81-0.572-3.012-0.5\n  \t\t\tc-1.134,0.064-1.521-0.24-2.627-1.123c-1.529-1.223-3.047-2.529-4.821-3.076c-1.393-0.428-2.201,0.232-3.597,0.533\n  \t\t\tc-1.565,0.338-3.659,0.797-5.267,0.156c-0.925-0.367-1.798-1.297-2.691-1.807c-3.542-2.021-6.053-4.99-8.606-8.594\n  \t\t\tc-1.175-1.656-1.866-3.486-3.156-5.039c-1.553-1.873-3.049-4.73-2.096-7.299c0.889-2.396,3.862-2.559,5.795-2.143\n  \t\t\tc2.771,0.6,6.266,3.609,7.408,6.906c0.681,1.959,0.919,4.359,0.873,6.426c-0.021,0.967-0.383,1.875,0.367,2.658\n  \t\t\tc2.316,2.412,0.019-5.594-0.002-6.338c-0.038-1.443,0.082-3.859,1.156-4.355c1.134-0.521,2.3,0.824,3.194,1.561\n  \t\t\tc3.673,3.008,6.582,7.328,9.011,11.82c0.668,1.238,1.968,2.953,2.218,4.344c0.187,1.031-0.492,2.439,0.645,2.795\n  \t\t\tc1.765,0.553,0.936-2.301,0.631-3.209c-0.728-2.178-2.241-4.926-2.018-7.35c0.213-2.299,0.811-1.469,2.018-1.078\n  \t\t\tc1.205,0.391,2.461,0.012,3.658-0.178c1.197-0.188,2.646-0.729,3.754-0.236c1.323,0.588,2.625,2.518,3.69,3.613\n  \t\t\tc2.677,2.762,4.751,6.539,7.574,9.061c2.6,2.318,4.465-0.842,7.227,0.195c0.773,0.291,3.546,2.021,2.545-0.814\n  \t\t\tc-0.43-1.223-1.215-0.793-1.947-0.627c-0.356,0.08-0.378,0.51-0.732,0.553c-0.313,0.037-0.861-0.307-1.182-0.395\n  \t\t\tc-3.1-0.814-5.045-2.17-7.714-4.521c-1.726-1.521-3.514-3.566-4.696-5.705c2.521-0.084,4.715-2.191,6.61-3.867\n  \t\t\tc0.655-0.578,1.347-1.199,2.14-1.416c0.713-0.195,1.601,0.254,2.334-0.182c0.64-0.381,1.809-1.838,1.407-2.869\n  \t\t\tc-0.887-2.287-2.132,0.93-2.423,1.752c-1.674-0.619-3.035,0.555-4.413,1.395c-1.722,1.045-3.353,1.684-5.231,1.885\n  \t\t\tc-2.469,0.268-4.751,0.051-7.189-0.104c-3.041-0.193-5.621-0.678-8.557-1.9c-6.59-2.744-11.777-9.615-18.06-13.195\n  \t\t\tc-1.365-0.775-2.729-0.65-3.994-1.828c-1.004-0.934-1.854-2.527-3.303-2.818c-2.389-0.479-3.603,3.049-5.798,0.49\n  \t\t\tc-1.227-1.428-1.778-3.355-2.537-5.045c-0.506-1.123-1.318-2.375-1.318-3.646c0.001-1.564,1.473-1.424,1.552-2.936\n  \t\t\tc0.116-2.18-0.712-4.766-1.042-6.928c-0.22-1.436-0.048-4.84-2.084-4.982c0.374-0.691,1.105-1.062,1.329-1.834\n  \t\t\tc0.354-1.221-0.18-3.219-0.458-4.52c-0.467-2.18-0.697-4.809-1.855-6.764c-0.411-0.693-0.878-0.965-1.606-1.391\n  \t\t\tc0.29-1.188,1.325-0.729,1.331-2.24c0.013-3.238-0.663-6.84-1.375-9.992c-0.356-1.58-0.367-2.705-1.747-3.582\n  \t\t\tc-0.491-0.312-1.13-0.426-1.015-1.035c0.106-0.562,1.012-0.582,1.279-0.959c0.333-0.465,0.188-1.258,0.142-1.82\n  \t\t\tc-0.122-1.471-0.518-2.9-0.69-4.363c-0.226-1.898-0.157-6.172-1.682-7.611c-0.516-0.486-1.392-0.426-2.027-0.645\n  \t\t\tc0.35-0.619,1.24-0.734,1.587-1.476c0.33-0.705,0.217-1.974,0.132-2.732c-0.418-3.728-0.978-8.305-2.562-11.724\n  \t\t\tc-0.378,0.14-0.788,0.293-1.155,0.443c1.027-1.802,0.34-3.571-0.021-5.43c-0.319-1.649-0.664-3.37-0.867-5.055\n  \t\t\tc-0.304-2.52-0.352-5.073-0.997-7.533c-0.348-1.324-1.081-1.605-2.334-1.967c0.655-0.657,1.266-1.381,1.34-2.351\n  \t\t\tc0.041-0.531-0.229-1.237-0.263-1.791c-0.088-1.469-0.038-2.938-0.271-4.401c-0.396-2.49-0.804-5.22-1.756-7.565\n  \t\t\tc-0.437-1.077-1.148-1.911-2.456-1.916c0.222-0.833,1.341-1.062,1.49-2.104c0.122-0.853-0.225-2.148-0.338-2.998\n  \t\t\tc-0.254-1.924-0.479-3.859-0.909-5.755c-0.79-3.481-0.947-7.264-2.163-10.63c-0.522-1.45-1.229-1.28-2.58-1.392\n  \t\t\tc1.548-2.08,1.524-3.584,0.966-6.101c-0.599-2.693-1.19-5.389-1.841-8.071c-0.422-1.744-0.578-5.141-2.139-6.272\n  \t\t\tc-0.338-0.245-0.686-0.18-0.977-0.497c1.189-1.101,1.063-2.258,0.886-3.818c-0.313-2.751-0.865-5.458-1.159-8.237\n  \t\t\tc-0.374-3.542-0.981-7.087-1.469-10.609c-0.104-0.751-0.159-1.771-0.618-2.396c-0.55-0.749-1.335-0.558-2.108-0.97\n  \t\t\tc0.61-0.68,1.452-0.925,1.842-1.77c0.379-0.822,0.202-1.736-0.015-2.575c-0.422-1.63-0.717-3.247-0.972-4.911\n  \t\t\tc-0.167-1.087-0.263-2.14-0.43-3.181c-0.14-0.862-0.326-1.718-0.644-2.58c-0.166-0.449-1.524-4.739-2.624-4.01\n  \t\t\tc2.202-1.46,1.872-4.775,1.604-7.024c-0.378-3.14-0.952-6.243-1.472-9.361c-0.179-1.079-0.321-2.836-1.031-3.772\n  \t\t\tc-0.713-0.939-1.836-0.678-2.771-1.083c0.158-4.312-1.357-9-2.22-13.194c-0.538-2.619-1.535-5.109-2.068-7.727\n  \t\t\tc-0.211-1.035-1.499-6.354,0.303-6.504c1.273-0.106,3.806,3.6,4.474,4.469c0.683,0.887,1.199,1.729,1.586,2.765\n  \t\t\tc0.235,0.629,0.45,2.408,1.342,2.503c0.319,0.034,1.367-0.585,1.546-0.863c0.601-0.932,0.025-0.595-0.479-1.209\n  \t\t\tc-1.205-1.462-4.791-4.95-3.688-7.007c0.863-1.608,3.846-1.54,4.688-3.095c0.249-0.459,0.525-0.928-0.344-1.17\n  \t\t\tc-0.801-0.223-0.901,0.418-1.418,0.826c-0.991,0.784-2.15,1.834-3.4,2.067c-1.816,0.339-3.216-1.189-3.427-2.901\n  \t\t\tc-0.27-2.176,1.37-4.233,2.729-5.736c6.033-6.665,13.011-10.158,21.271-13.402c4.991-1.961,8.364-2.235,13.285-0.015\n  \t\t\tc5.875,2.651,12.466,6.464,15.708,12.227c0.892,1.583,1.67,3.164,2.349,4.844c1.637,4.054,1.172,7.693,0.264,11.936\n  \t\t\tc-0.725,3.382-1.798,6.674-2.631,10.013c-0.438,1.755-2.106,4.716-1.455,6.303c3.469-3.144,2.072-9.917,4.769-13.343\n  \t\t\tc1.334,1.319,1.924,3.793,2.688,5.516c1.604,3.617,3.006,7.241,4.816,10.78c1.486,2.905,3.401,7.587,5.95,9.717\n  \t\t\tc-0.072-2.416-1.658-4.772-2.706-6.904c-1.168-2.377-2.303-4.854-3.257-7.313c-1.447-3.727-2.819-7.118-4.937-10.45\n  \t\t\tc-1.742-2.741-1.702-5.472-1.558-8.769c0.079-1.792-0.567-7.307,1.007-8.468c3.89,5.332,7.821,10.854,10.506,16.948\n  \t\t\tc0.716,1.623,1.12,2.637,0.938,4.509c-0.24,2.468-2.718,7.78-1.39,9.886c-0.718-1.137,2.829-8.269,3.231-9.884\n  \t\t\tc-0.003,0.01,4.953,5.572,5.316,6.087c3.654,5.188,7.314,10.649,10.214,16.291c0.706,1.375,1.356,3.281,2.64,4.067\n  \t\t\tc0.4-2.065-2.021-5.002-2.957-6.716c-1.562-2.858-3.243-5.662-4.944-8.451c-2.66-4.363-5.587-8.291-8.573-12.375\n  \t\t\tc-1.001-1.368-5.613-7.413-4.254-8.9c1.009-1.104,6.482,1.112,7.59,1.476c2.05,0.674,3.948,0.78,5.907,0.894\n  \t\t\tc-1.708-3.329-8.684-1.856-11.744-3.443c-4.132-2.143-7.041-6.198-8.041-10.765c-0.485-2.216-0.813-5.588,2.305-4.393\n  \t\t\tc1.735,0.665,3.558,4.257,5.25,4.217c4.797-0.112-1.716-4.993-2.808-5.524c-1.817-0.884-22.777-7.505-20.724-11.407\n  \t\t\tc1.481-2.812,9.402,0.244,11.086,0.845c3.42,1.22,6.9,2.531,10.45,3.325c1.778,0.397,4.498,1.27,6.2,0.444\n  \t\t\tc1.033-6.633-18.78-2.489-21.181-8.151c3.039-3.558,9.132-3.007,13.264-2.751c3.739,0.231,8.065-0.586,11.591,0.971\n  \t\t\tc3.239,1.431,5.383,4.583,7.112,7.534c1.26,2.149,3.539,8.153,5.77,9.176c1.066-1.641-0.686-3.888-1.518-5.316\n  \t\t\tc-0.412-0.707-2.657-3.068-2.519-3.919c0.229-1.388,6.624,1.176,5.497-1.646c-0.474-1.188-3.379-0.023-3.979-0.078\n  \t\t\tc-1.345-0.121-1.631-0.278-2.737-0.965c-1.196-0.742-3.755-3.077-3.849-4.612c-0.2-3.248,3.726,0.331,5.278-1.501\n  \t\t\tc1.854-2.186-5.64-2.625-7.175-2.712c-2.179-0.125-4.415,0.234-6.579-0.043c-2.87-0.368-4.435-1.169-0.938-2.151\n  \t\t\tc2.12-0.595,4.628-0.901,6.628-1.81c1.581-0.719,3.086-1.638,4.706-2.347c7.047-3.084,19.66-7.528,21.613,3.804\n  \t\t\tc0.616,3.571,1.079,7.229,1.486,10.832c0.182,1.606,0.208,4,0.819,5.478c0.942,2.28,1.979,1.247,2.023-1.057\n  \t\t\tc0.062-3.204-1.257-6.997-1.779-10.191c-0.534-3.259-2.863-7.826,0.763-9.477c1.923,1.437,3.514,3.384,5.05,5.281\n  \t\t\tc2.585,3.19,5.403,6.228,7.949,9.438c3.322,4.191,8.135,7.581,7.998,13.309c-0.06,2.459-0.469,4.939-0.811,7.383\n  \t\t\tc-0.312,2.226-2.95,8.307-1.187,9.999c1.676-2.602,2.31-7.228,2.729-10.346c1.311,1.719,1.53,4.545,3.768,5.392\n  \t\t\tc1.175-1.863-2.85-5.907-3.005-8.28c-0.153-2.357,0.635-6.065,3.257-3.023c1.436,1.666,2.21,4.394,3.312,6.323\n  \t\t\tc1.486,2.597,2.356,5.236,3.431,8.013c1.281,3.311,2.258,7.768,4.7,10.411c-0.836-0.909-0.363-3.231-0.688-4.373\n  \t\t\tc-0.548-1.924-1.643-3.91-2.363-5.808c-1.174-3.085-2.323-6.188-3.235-9.362c-0.251-0.877-1.577-4.102-0.899-4.794\n  \t\t\tc0.659-0.673,2.969,0.355,3.719,0.587c1.767,0.545,4.642,1.689,6.424,0.588c2.832-1.75-0.393-2.93-2.143-3.012\n  \t\t\tc-7.626-0.359-13.03-2.685-18.444-8.181c-4.312-4.379-8.287-9.159-12.317-13.807c-2.666-3.074-6.16-6.607-7.153-10.681\n  \t\t\tc-0.777-3.188,1.699-3.837,4.408-4.273c3.867-0.624,7.766-0.203,11.645,0.041c0.618,0.039,9.865,0.47,7.343-2.036\n  \t\t\tc-0.593-0.588-2.402-0.414-3.181-0.382c-2.34,0.067-4.62,0.374-6.899,0.6L740.358,57.59z\"/>\n  \t\t<path fill=\"#E2E2E2\" d=\"M227.452,151.759c15.399-5.684,30.163-12.934,45.509-18.752c6.308-2.392,12.168-5.882,18.35-8.574\n  \t\t\tc3.292-1.434,6.697-2.337,10.024-3.618c3.585-1.379,6.863-3.432,10.418-4.879c2.715-1.106,4.876-1.748,7.837-1.936\n  \t\t\tc3.847-0.245,7.549-0.142,11.301,0.842c3.914,1.026,7.774,1.933,11.054,4.374c1.438,1.07,3.215,1.645,4.541,2.885\n  \t\t\tc0.761,0.712,1.739,4.478,2.979,3.844c0.952-0.488,1.159-2.361,0.564-3.083c-0.633-0.769-1.98-0.871-2.799-1.378\n  \t\t\tc-1.117-0.692-4.742-2.419-4.6-4.099c0.128-1.503,3.293-1.246,4.428-1.397c2.866-0.385,6.725-0.685,9.405-1.789\n  \t\t\tc1.174-0.484,2.802-2.223,1.258-3.442c-1.463-1.155-2.501,1.38-3.513,2.067c-1.613,1.094-4.458,1.239-6.293,1.542\n  \t\t\tc-2.145,0.354-4.208,0.708-6.358,1.057c-2.034,0.329-4.129-0.389-6.174-0.817c-2.857-0.599-5.511-1.516-8.211-2.586\n  \t\t\tc1.125-2.031,4.574-2.065,6.617-2.514c3.735-0.822,7.269-2.949,11.065-4.127c1.863-0.579,3.972-1.771,5.939-1.912\n  \t\t\tc0.853-0.061,1.589,0.35,2.432,0.332c1.972-0.042,1.908-2.285,3.852-2.566c-0.933,0.352-2.03,1.014-2.88,1.279\n  \t\t\tc-0.671,0.209-1.113-0.095-1.818-0.133c-1.761-0.093-3.763,0.621-5.444,1.197c0.038-0.437-0.003-0.99-0.175-1.339\n  \t\t\tc-0.762,0.314-1.138,1.061-1.753,1.565c-0.826,0.678-1.925,1.138-2.914,1.462c-1.302,0.427-3.304,1.015-4.713,0.776\n  \t\t\tc-0.613-0.104,1.743-1.755,1.864-1.826c1.325-0.771,2.628-1.582,3.946-2.363c1.493-0.885,2.853-1.651,4.529-1.938\n  \t\t\tc0.977-0.167,2.691-0.571,1.918-2.114c-1.625-3.241-5.425,1.61-6.783,2.446c-2.127,1.31-4.228,2.584-6.463,3.718\n  \t\t\tc-0.889,0.451-8.803,4.91-9.205,4.177c-0.46-0.838,0.018-2.142,0.169-3.04c0.29-1.711,0.397-3.674,1.219-5.225\n  \t\t\tc1.112-2.097,3.452-3.562,5.544-4.542c0.92-0.431,2.927-1.195,1.825-2.593c-0.842-1.069-2.042-0.175-2.476,0.533\n  \t\t\tc-0.283,0.463-0.224,1.083-0.663,1.611c-0.476,0.571-1.254,0.998-1.833,1.457c-0.946,0.748-2.156,1.997-3.135,0.813\n  \t\t\tc-0.891-1.076-0.664-5.236-0.233-6.439c0.28-0.782,0.87-0.926,1.01-1.652c0.134-0.698-0.438-1.477-1.169-1.473\n  \t\t\tc-1.997,0.012-1.388,2.806-1.251,3.938c0.289,2.375,0.183,4.872,0.154,7.285c-0.027,2.243,0.038,4.685-0.976,6.728\n  \t\t\tc-1.022,2.059-3.445,4.341-5.815,4.783c-4.114,0.767-5.491-3.857-4.704-6.855c1.055-4.021,3.158-7.771,4.206-11.815\n  \t\t\tc0.378-1.458,0.858-2.973,1.425-4.372c0.515-1.269,1.554-1.997,0.193-3.036c-1.41-1.078-2.187-0.316-1.978,1.129\n  \t\t\tc0.259,1.787,0.485,3.333,0.012,5.182c-0.711,2.787-2.25,5.83-3.526,8.415c-1.796,3.636-2.897,7.956-5.644,11.042\n  \t\t\tc-2.587,2.908-7.088,5.119-10.526,6.919c-7.876,4.123-16.386,6.81-24.519,10.354c-28.637,12.481-57.103,24.857-86.463,35.722\n  \t\t\tc-9.074,3.358-18.095,7.144-27.289,10.149c-6.833,2.233-12.559,4.407-19.379,0.485c-1.945-1.118-2.597-2.965-5.751-1.496\n  \t\t\tc-1.72,0.802-3.526,4.542-5.5,3.81c-4.708-1.749,2.979-9.733,5.887-9.949c5.185-0.384,7.76,5.69,13.46,4.915\n  \t\t\tc-2.908-1.598-7.527-1.669-2.958-4.889c3.004-2.117,6.312-1.076,9.498-2c5.866-1.701,10.323-9.061,17.349-11.012\n  \t\t\tc-5.416,0.667-8.015,2.083-12.349,5.525c-1.52,1.207-3.103,2.507-4.865,3.221c-1.578,0.639-4.348,0.436-5.518,1.592\n  \t\t\tc-0.639-2.194,0.646-4.702,0.406-7.174c-2.481,3.783-2.443,8.494-8.024,8.858c-2.185,0.143-4.377-1.276-6.5-1.398\n  \t\t\tc-1.908-0.11-3.517,0.5-5.424,0.351c-0.325-6.182,3.151-6.866,5.762-11.811c-1.737,1.743-4.535,3.347-5.875,5.349\n  \t\t\tc-1.458,2.179-0.654,4.796-1.339,7.021c-0.768,2.489-4.742,6.444-7.628,5.939c-3.858-0.675-3.727-8.333-4.27-11.462\n  \t\t\tc-2.928-16.883-4.397-34.86-5.226-51.973c-0.566-11.692-0.288-23.371-0.201-35.057c0.127-17.24-3.741-35.273,2.338-51.83\n  \t\t\tc0.424-1.155,0.839-2.313,1.259-3.471c1.09-3.005,2.205-6.005,3.523-8.917c0.653-1.443,1.355-2.864,2.135-4.243\n  \t\t\tc0.378-0.67,0.776-1.329,1.195-1.975c0.173-0.267,0.276-0.527,0.411-0.809c0.09-0.187,0.707-0.724,0.707-0.724l-2.749-0.029\n  \t\t\tc0,0-2.2,3.291-3.108,5.036c-1.447,2.78-2.695,5.658-4.134,8.442c-2.057-1.93-1.772-5.583-2.388-8.307\n  \t\t\tc-0.113,3.824,1.286,7.396,0.998,10.858c-0.145,1.735-2.071,11.71-3.5,11.56c-0.041-0.004-0.08-0.014-0.118-0.027\n  \t\t\tc-0.393-0.139-0.604-0.652-0.746-1.003c-0.284-0.701-0.445-1.455-0.586-2.195c-0.422-2.217-0.605-4.482-0.754-6.731\n  \t\t\tc-0.171-2.593-0.26-5.192-0.299-7.79c-0.009-0.607-0.016-1.215-0.019-1.823c-0.006-1.228-0.271-2.422-0.378-3.647\n  \t\t\tc-0.046-0.528-0.132-1.054-0.188-1.582c-0.039-0.363-0.101-0.723-0.143-1.084c-0.066-0.563-0.018-1.14-0.058-1.708\n  \t\t\tc-0.646,0.027-1.267-0.012-1.917,0.029c-0.055,0.852-0.038,1.713,0.044,2.563c0.042,0.44,0.105,0.873,0.174,1.31\n  \t\t\tc0.137,0.879,0.205,1.737,0.423,2.6c0.251,0.992,0.508,1.982,0.727,2.982c0.523,2.396,1.004,5.245-0.274,7.494\n  \t\t\tc-2.496-1.007-3.611-4.317-3.946-6.863c-3.104-0.869-4.601-4.949-6.789-7.074c-2.719-2.64-3.635-2.509-1.647,0.962\n  \t\t\tc3.567,6.23,9.146,10.487,11.01,18.013c2.366,9.552,0.945,20.641,0.502,30.416c-0.591,13.031,1.309,26.42,1.601,39.458\n  \t\t\tc0.217,9.679-0.154,19.354,0.397,29.027c0.557,9.774,0.249,18.909,0.87,28.718c0.423,6.675,1.371,19.062-5.87,22.795\n  \t\t\tc-3.829,1.974-12.085-6.106-17.002-7.401c-2.544-0.67-6.952-0.052-8.534-1.994c-0.703-0.862-0.27-3.322-1.327-4.655\n  \t\t\tc-0.491-0.618-2.342-1.303-3.127-1.829c-7.077-4.737-12.407-9.264-16.397-15.986c-1.019,6.051,8.389,11.292,12.363,14.562\n  \t\t\tc2.455,2.02,6.583,3.973,5.047,7.897c-1.35,3.449-4.043,1.697-6.914,2.603c-4.832,1.526-9.983,6.55-14.722,8.9\n  \t\t\tc-6.212,3.08-12.828,6.824-19.51,8.621c-3.685,0.991-8.121,1.601-11.488,0.516c-4.119-1.328-7.254-3.541-11.734-4.049\n  \t\t\tc2.656,1.313,4.739,2.068,7.371,2.886c1.982,0.616,5.433,0.958,4.897,3.952c-3.092,0.18-5.445,3.899-7.423,6.076\n  \t\t\tc-4.079,4.489-7.976,9.362-12.482,13.343c7.977-6.867,14.537-17.493,24.982-19.347c11.193-1.986,20.376-10.802,31.913-12.583\n  \t\t\tc0.625-1.75,3.899-3.714,5.121-1.438c0.731,1.36-3.669,6.486-4.511,7.512c-3.294,4.013-8.043,9.548-13.419,10.936\n  \t\t\tc-0.488,0.126-2.188-0.367-3.18-0.083c-2.683,0.767-4.607,3.125-7.281,3.665c3.228-0.262,6.08-2.104,9.358-2.506\n  \t\t\tc2.269-0.278,5.963-1.66,7.875-0.576c3.269-3.571,5.557-8.287,9.637-10.873c1.379,2.777,0.037,6.744,0.379,9.448\n  \t\t\tc0.094,0.742-0.687,0.954-0.438,2.012c0.113,0.482,1.569,1.396,1.909,1.977c0.752,1.286,1.621,2.511,2.174,3.823\n  \t\t\tc-3.982-5.295-1.428-9.034-2.536-14.812c-0.854-4.455,0.516-11.276,4.366-13.611c2.478-1.503,6.704-2.611,9.107-2.375\n  \t\t\tc1.437,0.142,2.622,1.229,4.027,1.384c1.476,0.164,1.994-1.065,3.502-0.784c5.387,1.004,10.916,6.591,14.798,9.997\n  \t\t\tc-1.788,4.363-11.638,4.832-15.188,2.39c-2.771-1.907-5.197-4.352-7.934-6.062c1.938,2.288,4.259,4.34,6.21,6.571\n  \t\t\tc1.973,2.256,3.545,2.554,0,3.488c-2.1,0.553-6.279,0.168-8.524-0.002c-2.048-0.155-4.223-1.167-5.299-2.171\n  \t\t\tc3.916,3.333,13.085,4.95,17.87,3.735c-0.637,2.817-5.295,3.122-3.352,6.852c0.288,0.064,0.577,0.118,0.868,0.161\n  \t\t\tc0.542,0.081-4.774,8.505-4.884,8.762c2.042-1.559,4.098-4.115,5.336-6.367c0.893-1.628,3.826-9.658,5.458-5.143\n  \t\t\tc0.758,2.098-1.961,5.067-2.007,7.189c-0.028,1.284,2.01,3.135,1.708,4.482c-0.638,2.854-5.056,1.964-7.032,2.863\n  \t\t\tc-3.437,1.563-5.168,4.837-9.542,4.648c-1.943-0.084-3.684-1.168-5.877-1.012c-3.014,0.215-5.652,1.674-8.749,2.135\n  \t\t\tc-2.7,0.402-6.497,0.943-9.237,0.265c-2.123-0.525-3.31-1.977-5.447-1.813c2.307,3.291,10.543,3.721,14.321,3.302\n  \t\t\tc2.256-0.25,4.576-1.591,6.889-1.5c2.609,0.103,2.738,0.806,4.937,2.611c-3.356,3.104-4.63,8.203-8.302,11.013\n  \t\t\tc-3.311,2.534-8.552,5.382-12.386,7.537c8.857-3.149,14.982-7.243,20.486-14.936c2.664-3.724,10.241-8.368,14.867-7.297\n  \t\t\tc-0.719,3.998,2.271,6.743,2.01,10.543c0.508-2.991-2.164-4.472-1.486-7.371c0.745-3.186,5.959-7.343,9.072-4.584\n  \t\t\tc1.773,1.571,0.922,5.086,0.439,6.99c-1.597,6.295-5.991,12.172-9.735,17.336c-7.053,9.726-15.247,18.411-23.179,27.394\n  \t\t\tc-4.659,5.276-8.756,10.998-13.767,15.957c-3.239,3.205-5.669,9.609-9.938,11.609c-2.919,1.368-5.675-0.589-8.545-0.383\n  \t\t\tc0.61,3.909,6.153,5.006,7.137,8.804c1.386,5.37-2.004,11.901-1.898,17.335c3.562-2.023,3-6.736,3.426-10.338\n  \t\t\tc0.554-4.678,1.264-8.987,3.573-13.112c3.743-6.687,9.564-11.243,14.374-17.021c11.377-13.669,21.61-28.156,33.418-41.464\n  \t\t\tc3.124-3.521,6.331-7.426,10.607-9.647c3.493-1.815,10.853-4.25,14.124-1.13c4.009,3.824,3.485,13.425,3.102,18.304\n  \t\t\tc-0.933,11.857-7.927,29.31-0.474,40.179c2.834-4.77,1.999-16.277,2.303-21.91c0.375-6.945,0.579-13.713,0.948-20.584\n  \t\t\tc0.789-14.69,2.297-17.711,15.223-8.251c16.314,11.94,32.862,30.467,40.952,48.876c9.325,0.204-2.032-12.057-4.174-14.849\n  \t\t\tc-6.788-8.846-13.974-17.549-21.219-26.023c-3.945-4.615-19.535-16.495-17.519-23.527c1.201-4.187,9.708-3.456,12.784-2.357\n  \t\t\tc2.863,1.023,4.169,3.254,5.726,5.669c0.658,1.021,5.132,5.996,5.149,6.582c-0.14-4.609-8.399-10.731-2.922-13.831\n  \t\t\tc4.578-2.591,8.77,4.754,14.345,2.974c-2.933-0.314-6.038-0.906-8.358-2.963c-4.471-3.963-2.69-3.382-8.995-1\n  \t\t\tc-2.676,1.011-5.524,1.45-8.004-0.647c-5.477-4.633,2.112-5.311,5.082-6.471c4.487-1.753,7.795-6.324,12.93-6.417\n  \t\t\tc4.526-0.082,6.889,4.214,10.889,5.146c2.775,0.646,8.875-0.157,12.472-0.134c-3.146,0.236-7.36-1.085-10.36-2.012\n  \t\t\tc-2.915-0.899-4.277-2.927-6.949-4.087c1.455-2.188,6.047-2.462,8.475-4.026c3.045-1.961,3.748-2.893,7.5-2.875\n  \t\t\tc6.742,0.031,9.757,0.519,14.933-4.297c-3.649,1.672-6.298,4.133-10.484,3.823c-2.986-0.221-6.454-2.569-9.585-1.174\n  \t\t\tc-3.817,1.7-6.496,5.39-10.777,6.771c-2.471,0.797-6.417,1.916-9.034,2.19c-0.015-3.738,3.851-6.175,3.447-10.16\n  \t\t\tc-2.667,6.386-5.131,10.139-11.547,12.222c-2.455,0.797-4.168,1.629-6.457,0.587c1.695-14.411,22.07-17.558,32.771-21.635\n  \t\t\tc17.74-6.73,34.74-15.95,52.65-22.56L227.452,151.759z\"/>\n  \t\t<path fill=\"#E2E2E2\" d=\"M420.78,152.599c7.765-3.153,14,5.24,20.639,3.735c11.629-2.634,3.537-13.604,10.784-15.122\n  \t\t\tc5.178-1.084,2.646,0.621,6.107,3.684c3.162,2.798,3.955,0.309,5.183,5.32c1.052,4.298-0.56,9.219,1.368,13.256\n  \t\t\tc-1.913-4.005-1.018-13.869,1.322-17.408c3.724,1.757,8.263,9.242,8.75,13.395c0.75,6.398-3.529,9.196,4.062,11.063\n  \t\t\tc8.854,2.179,11.854,10.313,15.423,17.393c-0.92-4.227-3.706-8.447-6.246-11.917c1.731,0.01,3.222,0.919,4.876,0.97\n  \t\t\tc3.337,0.101,6.383-1.669,9.801-1.436c-4.614,0.559-10.726-0.872-14.744-3.127c-3.377-1.896-6.036-4.343-10.047-4.551\n  \t\t\tc-0.053-2.154,0.73-4.264,1.522-6.242c2.856-0.196,5.625,1.562,8.373,2.207c-1.902-3.396-4.443-1.787-6.958-3.262\n  \t\t\tc-1.93-1.131-2.791-4.14-3.428-6.387c2.562-5.18,2.385-8.321,8.211-6.008c4.11,1.634,7.451,3.273,11.835,3.698\n  \t\t\tc5.45,0.528,10.829-0.123,16.279,0.147c6.051,0.301,12.129,0.642,18.171,0.999c4.183,0.247,8.344,1.194,12.019,3.259\n  \t\t\tc3.104,1.745,6.68,4.148,6.743,8.127c0.037,2.27-0.794,4.444-1.517,6.562c-1.188,3.479-2.338,7.088-4.169,10.27\n  \t\t\tc-0.983,1.708-2.399,2.615-3.953,3.828c-0.875,0.684-4.484,2.356-3.578,3.932c1.64-0.633,3.252-1.927,4.744-2.905\n  \t\t\tc2.239-1.466,1.709-0.083,1.448,2.046c-0.326,2.674-0.502,5.422-0.685,8.108c-0.087,1.283-0.65,3.454,0.261,4.448\n  \t\t\tc1.564-2.394,0.931-6.387,1.116-9.117c0.15-2.209,0.379-4.436,0.989-6.562c0.611-2.126,1.233-4.645,2.407-6.542\n  \t\t\tc1.896-3.064,2.143,0.511,2.627,2.303c0.733,2.717,1.657,0.759,1.134-0.889c-0.204-0.643-0.896-1.094-1.146-1.741\n  \t\t\tc-0.296-0.765-0.189-1.914-0.201-2.723c-0.034-2.41,0.21-4.726,0.854-7.054c0.275-0.994,0.622-2.71,1.555-3.247\n  \t\t\tc-0.164,0.095,2.725,3.033,3.036,3.402c2.043,2.409,2.945,5.762,4.021,8.688c1.161,3.159,2.191,6.772,0.814,10.036\n  \t\t\tc-0.207,0.49-2.317,4.931-0.996,4.679c1.067-0.204,1.975-3.924,2.745-4.749c0.806,0.452,1.286,1.574,1.769,2.336\n  \t\t\tc1.204,1.907,2.459,3.878,3.581,5.85c0.916,1.608,3.029,6.697,5.09,6.917c-0.734-2.704-3.064-4.853-4.053-7.426\n  \t\t\tc1.125-0.658,3.713,0.568,5.119,0.493c0.164-1.838-4.101-2.043-5.345-2.76c-2.255-1.298-3.214-4.384-4.424-6.549\n  \t\t\tc-1.218-2.179-1.562-3.741-1.891-6.168c-0.132-0.971-0.907-2.812,0.494-2.755c0.628,0.025,2.188,2.145,2.764,2.539\n  \t\t\tc0.75,0.514,1.87,1.118,2.729,1.254c0.066-2.038-3.529-3.494-4.916-4.611c-0.58-0.467-2.846-2.14-1.932-3.117\n  \t\t\tc6.854,1.694,12.26,5.562,18.259,9.018c4.789,2.759,6.994,7.092,8.87,12.142c0.767,2.06,0.977,4.132,1.582,6.191\n  \t\t\tc0.286,0.97,0.61,2.137,1.865,2.051c0.674-1.19-1.13-3.011-1.526-4.14c-0.919-2.618-2.041-5.234-2.87-7.886\n  \t\t\tc-0.354-1.133-1.375-3.226-0.906-4.47c0.587-1.564,3.771-1.377,5.132-1.996c2.886-1.31,4.879-3.058,8.114-2.036\n  \t\t\tc2.735,0.863,5.059,2.444,7.854,3.174c-1.332-0.348-7.035-2.404-6.81-4.303c0.112-0.938,2.75-1.854,3.424-2.232\n  \t\t\tc1.104-0.62,3.542-1.585,3.763-2.901c-2.106-0.23-4.987,2.193-6.834,3.068c-1.285,0.609-3.123,2.121-4.646,1.515\n  \t\t\tc0.098-0.47,1.192-1.578,0.679-2.008c-0.607-0.508-1.417,1.297-1.59,1.522c-2.091,2.721-8.028,5.239-11.24,3.35\n  \t\t\tc-2.514-1.479-5.162-2.834-7.631-4.5c-2.44-1.646-5.013-3.139-7.585-4.566c-1.889-1.047-4.375-1.277-5.953-2.911\n  \t\t\tc1.147-1.586,4.39-1.101,6.093-1c1.24,0.074,2.566,0.309,3.779,0.641c1.059,0.289,2.541,1.2,3.597,0.524\n  \t\t\tc-1.65-1.535-4.513-0.851-6.162-2.369c0.954-0.916,3.243-1.132,4.529-1.506c1.83-0.531,3.646-0.77,5.513-1.064\n  \t\t\tc1.445-0.228,2.285-0.446,3.607,0.12c0.896,0.384,1.89,1.31,2.871,0.743c-0.402-1.13-1.691-0.761-2.281-1.518\n  \t\t\tc-0.655-0.84-0.175-0.394,0.05-1.242c0.103-0.388,1.184-1.434-0.159-1.576c-0.596-0.063-1.067,1-1.518,1.274\n  \t\t\tc-0.944,0.577-1.734,0.445-2.957,0.664c-3.88,0.697-7.763,1.991-11.505,3.206c-2.722,0.883-6.976,3.011-9.657,1.025\n  \t\t\tc-3.212-2.379-5.557-7.407-7.009-11.028c-1.297-3.235,22.29-2.616,23.979-2.61c4.508,0.017,7.146,1.982,10.693,4.571\n  \t\t\tc2.559,1.868,5.315,3.961,7.564,6.195c1.17,1.162,2.411,5.149,4.335,4.476c2.956-1.035-2.695-4.292-3.613-5.033\n  \t\t\tc-1.222-0.985-3.32-2.198-3.769-3.755c0.857-0.85,4.149-0.109,4.601-1.229c0.697-1.741-2.261-0.553-2.726-0.438\n  \t\t\tc-2.273,0.559-8.573-1.764-7.887-4.848c0.777-3.486,9.101-3.706,11.818-4.355c2.584-0.618,4.979-0.646,7.614-0.301\n  \t\t\tc3.093,0.404,5.499,2.046,8.19,3.446c0.688,0.359,4.092,1.714,3.493-0.175c-0.457-1.445-4.548-1.935-5.693-2.193\n  \t\t\tc-2.172-0.489-4.193-1.282-6.234-2.073c-0.993-0.385-2.965-0.597-3.052-1.926c-0.046-0.707,1.009-1.564,1.441-2.044\n  \t\t\tc3.908-4.331,9.109-7.705,14.633-9.417c8.234-2.554,17.216-4.027,25.044-7.4c3.706-1.597,9.329-2.655,12.345-5.534\n  \t\t\tc-6.52,0.824-14.135,4.747-20.466,6.906c-2.077,0.708-4.354,0.902-6.341,1.709c-2.081,0.845-4.013,2.263-6.337,2.345\n  \t\t\tc0.088-1.764,3.4-4.354,4.489-5.782c0.471-0.615,2.045-1.87,1.69-2.794c-0.454-1.181-1.01-0.14-1.395,0.343\n  \t\t\tc-1.605,2.026-2.306,4.472-4.303,6.367c-1.55,1.471-3.67,2.705-5.694,3.44c-1.443,0.523-2.891,0.915-4.31,1.501\n  \t\t\tc-0.745,0.308-2.582,1.386-3.371,1.292c-1.521-0.181,1.844-2.216,1.019-3.493c-1.167-1.804-3.589,2.871-3.977,3.58\n  \t\t\tc-1.427,2.612-3.345,4.813-5.169,7.142c-0.711,0.908-1.049,1.568-2.089,2.049c-2.021,0.935-4.197,1.149-6.216,2.158\n  \t\t\tc-2.385,1.192-5.567,1.489-8.189,2.057c-0.757,0.165-1.701,0.742-2.149-0.052c0.132,0.233,2.729-1.019,2.702-1.725\n  \t\t\tc-0.043-1.126-2.177-1.247-3.021-1.033c-1.461,0.37-2.673,1.544-4.18,1.954c-1.706,0.463-3.492,0.53-5.235,0.775\n  \t\t\tc-4.243,0.597-8.678,1.543-12.95,1.185c-4.261-0.356-8.604-0.392-12.89-0.392c-5.327,0-10.487,0.231-15.44-1.014\n  \t\t\tc-4.956-1.247-11.659-1.343-16.031-3.367c4.364-0.026,8.102-4.408,12.46-5.131c2.498-0.414,5.563,0.738,7.981,0.01\n  \t\t\tc1.19-0.359,1.725-0.913,2.677-1.606c1.196-0.871,2.325-0.956,3.7-1.302c4.034-1.017,7.964-1.582,12.076-2.219\n  \t\t\tc5.294-0.82,10.506-1.737,15.812-2.332c3.447-0.386,6.279-0.279,9.539,0.775c2.792,0.902,6.238,1.943,9.061,0.873\n  \t\t\tc-0.103-1.857-6.816-0.946-8.37-1.472c-1.043-0.352-2.597-1.144-1.285-1.98c0.655-0.419,1.841-0.027,2.621-0.312\n  \t\t\tc0.83-0.303,2.004-1.37,0.82-2.362c-0.706-0.594-2.46,0.029-3.229,0.265c-3.576,1.098-7.203,2.085-10.916,2.594\n  \t\t\tc-3.48,0.477-6.807,0.081-10.299,0.077c8.277,0.049,14.74-4.482,20.823-9.353c4.796-3.84,9.475-8.408,15.522-8.145\n  \t\t\tc3.318,0.145,6.697,1.462,9.905,0.502c-7.612,0.744-11.882-3.089-18.999,0.962c-5.297,3.015-10.189,6.527-15.262,9.898\n  \t\t\tc-2.721,1.809-7.013,5.64-10.561,5.06c-0.355-2.513,0.233-4.892,0.972-7.28c-1.531,2.62-2.473,6.906-5.047,8.391\n  \t\t\tc-3.564,2.056-10.959,1.735-15.044,2.604c-3.874,0.823-5.194,3.284-8.99,4.398c-2.854,0.837-6.133,0.351-8.974,1.452\n  \t\t\tc-3.299,1.278-5.971,4.504-9.479,5.434c-3.406,0.902-8.692-0.089-12.522-0.31c-4.117-0.237-5.473,0.027-8.627-1.986\n  \t\t\tc-1.479-0.944-2.558-2.338-4.195-3.14c8.849-1.036,6.523-6.005,12.369-10.42c4.715-3.56,13.137-1.984,17.434-6.865\n  \t\t\tc-4.758,1.618-9.655,2.76-14.396,4.434c-8.764,3.096-15.312,11.599-25.269,12.841c-5.371,0.67-11.886-3.991-14.405-8.507\n  \t\t\tc5.418,0.058,9.316-3.889,14.071-5.783c3.615-1.44,9.021-0.923,12.027-3.64c4.4-5.487,2.129-13.135,9.455-17.445\n  \t\t\tc6.146-3.615,11.932-0.92,18.471,0.399c9.877,1.993,18.737,1.799,26.693,8.897c-4.673-3.912-12.929-4.529-18.693-7.7\n  \t\t\tc-3.769-2.071-9.08-6.137-12.993-4.094c0.055,0.062-1.629-1.107-1.602-1.104c4.488-1.834,9.151-4.786,13.646-6.777\n  \t\t\tc4.374-1.938,9.137-1.466,13.464-3.43c0.796-0.361,1.514-0.632,2.354-0.895c3.168-0.992,6.335-2.06,9.649-2.565\n  \t\t\tc2.088-0.318,3.33,0.074,4.887,1.421c0.888,0.768,3.193,4.504,4.381,3.769c0.405-1.989-4.146-4.784-5.386-5.947\n  \t\t\tc0.465-0.695,1.867-0.822,2.64-0.878c1.521-0.111,2.888-0.27,4.368-0.718c0.462-0.14,4.149-1.172,3.954-2.054\n  \t\t\tc-0.17-0.765-1.336-0.334-1.759-0.183c-4.668,1.676-9.269,2.493-14.264,2.352c-0.366-2.652,2.803-5.747,4.961-6.679\n  \t\t\tc0.747-0.323,3.803-0.878,3.885-1.58c0.028-0.243-2.51,0.835-2.682,0.921c-0.869,0.438-1.785,1.001-2.796,0.772\n  \t\t\tc0.191-0.497,0.508-0.974,0.826-1.424c0.857-1.208,1.543-2.489,2.353-3.705c0.797-1.198,2.063-1.984,3.054-3.003\n  \t\t\tc0.688-0.71,0.948-1.63-0.41-1.119c-1.396,0.526-2.406,3.222-3.23,4.301c-0.927,1.211-4.773,7.399-6.236,7.119\n  \t\t\tc-0.386-2.602,0.361-5.415,0.838-7.965c0.093-0.494,0.752-4.434-0.447-3.207c-0.389,0.398-0.135,1.85-0.135,2.327\n  \t\t\tc0,1.311,0.06,2.639-0.033,3.945c-0.101,1.449-0.264,3.122-0.688,4.52c-0.861,2.836-3.101,5.606-5.622,7.128\n  \t\t\tc-2.534,1.529-5.378,0.982-8.197,1.502c-6.572,1.212-8.268,4.001-13.776,7.326c-17.872,10.786-2.675-15.125-1.373-21.991\n  \t\t\tc-5.432,6.276-5.899,17.219-11.601,22.514c-12.717,11.812-20.12-2.85-29.188-9.392c7.367,5.314,13.72,9.644,12.32,19.517\n  \t\t\tc-1.518,10.706-16.005,14.942-24.634,18.425c-3.611,1.457-4.251-0.409-7.984-2.696c-5.49-3.363-7.343-5.211-9.785-10.818\n  \t\t\tc-1.521-3.495-2.76-3.584-0.715-7.981c1.619-3.481,4.329-5.023,6.534-7.185c1.438-1.409,3.803-4.916,6-5.884\n  \t\t\tc3.716-1.636,10.364,1.52,14.479,1.084c-3.438-1.53-8.108-2.423-11.039-4.67c3.236-8.882,21.664-11.926,29.521-13.896\n  \t\t\tc5.383-1.35,10.84-2.626,15.925-4.907c5.655-2.537,8.758-6.548,13.483-10.095c-1.082,0.812-16.915,8.91-16.812,8.511\n  \t\t\tc1.365-5.3,5.94-9.528,9.516-13.956c-6.534,3.438-8.938,11.593-15.196,15.625c-6.787,4.374-15.653,5.136-23.474,6.595\n  \t\t\tc-4.745,0.886-4.932-0.677-10,2.98c-0.334,0.241-10.735,9.275-10.828,7.79c-0.878-14.113,1.724-25.588,9.823-37.61\n  \t\t\tc-10.994,9.373-9.828,24.193-13.175,36.945c-2.311,8.807-17.2,18.464-16.596,3.228c0.381-9.599,14.033-16.359,20.774-21.186\n  \t\t\tc10.159-7.271,21.633-13.217,28.673-24.142c-11.076,8.371-20.431,19.069-31.945,27.023c-4.278,2.955-15.24,11.867-16.723,3.893\n  \t\t\tc-0.775-4.168,5.996-11.095,7.616-14.92c-2.797,2.698-9.004,9.824-10.168,13.671c-1.37,4.52,2.893,7.696-0.858,12.561\n  \t\t\tc-2.678,3.471-9.42,8.652-13.272,4.201c-1.184-1.367-1.758-4.202-2.127-5.632c-1.128-4.38-2.354-8.611-2.121-13.39\n  \t\t\tc0.663-13.603,1.414-27.389,2.877-40.949c1.194-11.092,2.386-22.058,6.385-32.538c0,0-8.419-0.033-12.659,0.074\n  \t\t\tc2.646,14.565-3.137,30.967-5.2,45.538c-1.611,11.376-3.506,22.909-5.375,33.964c-1.062,6.281,1.269,14.781-3.062,20.138\n  \t\t\tc-2.938,3.635-19.775,3.694-18.284-0.999c1.631-5.137,5.365-10.531,7.718-15.409c-3.01,4.397-6.177,8.56-8.599,13.337\n  \t\t\tc-8.438-6.073-13.582-14.352-11.225-24.34c-0.9,2.863-2.014,5.642-3.897,7.972c3.937,5.988,8.947,12.633,11.968,19.352\n  \t\t\tc-6.622-3.253-14.884-4.028-22.123-3.575c-2.515,0.157-4.737-0.249-7.223-0.554c-2.045-0.251-4.153-0.201-6.199-0.51\n  \t\t\tc-2.499-0.378-6.29-0.546-7.112-3.182c-1.033-3.31-1.646-6.813-2.882-10.041c-0.886-2.314-2.17-3.695-3.849-5.242\n  \t\t\tc-1.751-1.613-2.953-3.341-3.404-5.773c-0.503-2.708-0.533-5.419-1.651-7.892c-0.95-2.1-3.108-5.002-2.599-7.207\n  \t\t\tc0.449-1.943,0.701-4.452,1.638-6.236c-0.488,1.684-0.781,3.539-1.638,5.108c-0.653,1.197-0.635,1.187-1.595,0.671\n  \t\t\tc-1.173-0.631-2.147-1.748-3.286-2.431c-1.147-0.688-2.283-1.204-3.321-2.056c1.991,1.69,3.987,3.118,5.625,5.135\n  \t\t\tc1.396,1.721,2.637,3.623,3.881,5.506c2.998,4.54,2.084,10.227,4.634,14.901c-1.674-0.176-3.307-1.417-4.904-1.804\n  \t\t\tc2.615,1.524,6.005,2.841,7.677,5.502c1.53,2.435,2.414,5.67,3.128,8.441c0.322,1.249,0.585,2.38-0.369,3.372\n  \t\t\tc-2.004-0.953-3.726-1.065-5.958-1.473c-2.834-0.518-3.899-1.571-6.015-3.195c-1.419-1.089-3.391-2.213-4.487-3.625\n  \t\t\tc-0.841-1.083-1.42-2.351-2.237-3.502c-2.572-3.626-5.948-6.686-9.062-9.829c1.728,2.144,3.278,4.323,4.839,6.597\n  \t\t\tc0.85,1.239,4.179,4.145,3.829,5.763c-2.469-1.027-5.049-2.272-7.589-2.982c-2.867-0.802-4.891,0.499-7.598,1.092\n  \t\t\tc-3.418,0.749-6.641,0.798-10.179,0.985c-2.493,0.132-4.831-0.04-7.271-0.596c2.416,2.661,7.957,0.808,10.938,0.773\n  \t\t\tc0.26,3.1-2.667,5.977-3.519,8.719c2.256-2.467,2.853-7.376,6.608-7.812c2.183-0.253,4.424-0.835,6.645-0.769\n  \t\t\tc1.814,0.054,3.031,1.136,4.711,1.473c0.643,0.129,1.462-0.031,2.117-0.015c1.426,0.034,2.708,0.492,4.064,0.971\n  \t\t\tc2.865,1.014,5.839,2.79,8.151,4.765c1.843,1.575,3.761,3.148,5.708,4.592c1.582,1.173,3.245,1.238,5.079,1.774\n  \t\t\tc1.351,0.396,2.619,1.003,3.98,1.374c2.231,0.608,4.543,0.758,6.834,0.988c2.07,0.207,4.181,0.924,6.212,0.893\n  \t\t\tc2.907-0.045,5.837-0.88,8.751-0.368c1.52,0.267,2.759,0.931,1.177,2.115c-2.267,1.697-4.628,3.182-6.793,5.051\n  \t\t\tc-1.806,1.559-3.61,3.185-5.167,4.998c-2.018,2.35-3.002,4.903-4.343,7.656c-0.728,1.494-1.09,3.066-1.732,4.569\n  \t\t\tc-0.958,2.242-2.213,4.784-5.067,4.051c-1.304-0.334-1.308-1.283-2.382-1.987c-1.821-1.196-5.051-2.103-7.222-2.104\n  \t\t\tc-4.191-0.001-8.207,2.646-12.366,0.146c2.125,1.57,5.479,1.048,7.887,0.631c0.697-0.121,1.34-0.201,2.065-0.288\n  \t\t\tc0.627-0.075,1.423-0.497,1.987-0.502c1.486-0.013,3.451,1.466,4.849,2.085c0.693,0.307,2.102,0.452,2.602,1.044\n  \t\t\tc0.531,0.627,0.125,1.404,0.471,2.068c0.281,0.538,1.107,0.65,1.144,1.295c0.044,0.783-1.551,1.61-2.1,1.975\n  \t\t\tc-0.904,0.6-1.715,1.021-2.713,1.264c-1.439,0.35-3.598,0.011-4.754,1.123c-1.143,1.098-2.123,2.964-3.189,4.22\n  \t\t\tc-0.867,1.02-1.986,3.012-3.267,3.403c-1.028,0.314-2.444-0.184-3.501-0.165c-1.281,0.023-2.72,0.049-3.955,0.356\n  \t\t\tc-1.281,0.318-2.317,1.089-3.519,1.598c1.037-0.194,2.088-0.713,3.144-0.978c0.757-0.19,1.344-0.409,2.156-0.34\n  \t\t\tc0.817,0.069,1.537-0.009,2.284,0.035c0.86,0.051,1.685,0.433,2.573,0.502c1.41,0.11,1.465-0.356,2.54-1.449\n  \t\t\tc1.149-1.169,5.556-7.476,7.499-6.212c1.131,0.736,0.24,3.916,0.016,4.974c0.609-1.446,0.173-3.162,0.746-4.479\n  \t\t\tc0.461-1.062,1.725-1.293,2.757-1.58c0.527-0.147,1.563-0.128,1.985-0.408c0.536-0.354,1.052-1.536,1.599-2.048\n  \t\t\tc1.45-1.358,3.468-3.031,5.534-3.087c1.646-0.045,1.812,0.704,2.566,1.978c0.825,1.394,1.89,3.105,3.092,4.144\n  \t\t\tc1.252,1.081,2.348,1.754,3.036,3.442c0.885,2.171,0.758,4.692,1.484,6.882c1.501-1.307-0.069-4.185-0.517-5.559\n  \t\t\tc-0.57-1.75-0.907-3.396-2.255-4.688c-1.854-1.778-4.075-3.777-5.124-6.201c-1.037-2.395,0.358-5.38,1.595-7.426\n  \t\t\tc0.599-0.99,1.896-2.724,3.104-2.465c0.347,0.074,1.243,0.968,1.576,1.185c0.895,0.583,1.804,1.106,2.759,1.586\n  \t\t\tc1.792,0.902,4.236,1.653,5.851,2.743c0.663,0.447,1.298,1.244,1.874,1.812c1.128,1.113,4.033,3.556,3.915,5.344\n  \t\t\tc-0.07,1.065-1.407,2.491-1.795,3.517c-0.737,1.95-1.747,4.318-1.587,6.456c0.453-2.94,2.415-6.466,4.578-8.513\n  \t\t\tc2.663,0.805,5.275,2.585,8.212,2.372c1.732-0.126,3.077-1.074,4.641,0.011c-1.89-1.822-4.14-1.247-6.387-1.958\n  \t\t\tc-1.146-0.362-2.251-1.25-3.253-1.896c-2.17-1.397-4.521-2.974-6.138-5.021c-1.067-1.35-1.708-2.951-3.062-4.056\n  \t\t\tc-1.699-1.387-4.072-1.71-5.892-2.967c-1.601-1.106-1.685-1.428-1.798-3.3c-0.11-1.825-0.479-4.439,0.871-5.915\n  \t\t\tc1.521-1.663,4.666-2.31,6.651-3.303c1.618,1.487,2.63,3.766,4.308,5.113c0.254-1.819-1.354-3.282-1.282-5.119\n  \t\t\tc0.138-3.461,5.229-4.332,7.851-4.274c2.123,0.047,4.164,0.425,6.172,1.115c0.85,0.292,6.762,2.395,6.741,3.232\n  \t\t\tc-0.136,5.547,3.636,12.577,6.241,17.539c-1.186-4.058-3.167-7.998-3.818-12.201c-1.398-9.038,9.297-4.906,12.729-1.149\n  \t\t\tc4.658,5.1,7.043,14.372,3.565,20.683c-1.727,3.136-4.992,4.875-6.655,7.851c-1.346,2.407-1.301,4.581-4.391,5.135\n  \t\t\tc-4.729,0.848-9.439-4.708-14-5.035c-3.309-0.237-9.3,1.479-12.083,1.523c3.346,0,8.007-0.836,10.996,0.587\n  \t\t\tc0.466,2.285-2.247,4.152-3.773,5.797c1.316-1.999,2.876-3.655,4.499-5.307c2.719,1.294,4.571,3.17,7.387,3.95\n  \t\t\tc1.74,0.482,5.703,0.952,7.935,1.046c-1.651,2.89-2.26,3.802-5.06,4.9c-4.448,1.745-9.184,1.404-13.41,4.161\n  \t\t\tc-2.77,1.807-4.455,5.742-7.49,6.902c-2.012,0.769-8.077,1.274-9.837,0.425c2.165,1.113,9.37,0.641,11.835-0.354\n  \t\t\tc3.052-1.229,4.048-5.145,7.926-5.543c0.119,2.777,0.7,5.454,0.563,8.303c0.781-2.944-0.202-6.499,1.002-9.166\n  \t\t\tc2.893,0.792,6.706-2.021,9.51-3.052c3.906-1.436,5.219-0.983,9.295,0.647c-2.313-3.595-2.704-3.301-1.158-7.286\n  \t\t\tc1.055-2.716,2.041-5.661,4.002-7.972c3.104,3.13,3.642,8.521,5.896,12.299c-0.852-4.157-5.551-11.949,0.242-12.838\n  \t\t\tc4.471-0.686,10.313,5.111,11.194,9.283c1.349,6.373-4.961,7.344-8.82,11.17c-2.319,2.299-4.604,8.773-7.626,9.583\n  \t\t\tc-1.549,0.415-4.954-1.753-6.498-2.176c-1.197-0.329-3.197-1.224-4.44-0.982c-1.862,0.362-0.614,0.219-2.214,1.123\n  \t\t\tc-3.092,1.747-6.239,5.765-9.334,8.01c-2.188,1.586-4.89,2.317-6.874,4.022c3.665-0.435,7.101-4.612,10.25-6.448\n  \t\t\tc2.414-1.407,4.86-2.45,6.994-4.044c-0.359,2.175-0.253,4.636-0.836,6.804c1.543-2.406,1.473-5.415,3.051-7.797\n  \t\t\tc2.976,1.628,7.373,3.479,10.823,4.041c0.199,2.858-1.824,9.055-4.544,10.785c-3.191,2.03-7.133,1.161-10.631,1.78\n  \t\t\tc1.104,0.663,2.469,1.476,3.459,2.25c-5.856,3.38-8.41,10.382-14.379,13.584c-6.52,3.487-16.533,6.451-23.736,8.062\n  \t\t\tc5.538-1.238,11.073-3.296,16.504-4.924c3.1-0.929,7.068-2.678,10.303-2.049c0.276,2.449-0.103,4.727-0.959,7.052\n  \t\t\tc3.271-8.881,9.457-15.724,17.182-21.462c0.842,2.418,2.276,5.027,3.165,7.293c-1.839-1.551-3.274-6.042-3.234-8.385\n  \t\t\tc7.604-0.995,7.108-8.997,10.034-14.571c1.119-2.133,2.456-6.09,5.244-5.791c0.473,4.837,0.297,9.899-0.133,14.744\n  \t\t\tc0.457-5.152,0.825-11.313,2.674-16.174c0.854-2.25,2.524-5.808,4.955-6.787c2.819-1.07,5.45-2.35,7.979-3.38L420.78,152.599z\"/>\n  \t</g>\n  \t\n  \t<rect proxy-tap='reset' class='tapcatcher' x='0' y='0' width='819.18' height='596.441'/>\n\n  \t<g id=\"Layer_1\">\n  \t\t<g id=\"schwann_x5F_cells_x5F_back\">\n  \t\t\t<path fill=\"#00A0C6\" d=\"M758.238,133.569c-2.157-1.842-5.012-3.797-4.923-6.143c0.062,1.43,1.354,1.927,2.461,1.382\n  \t\t\t\tc-0.209-0.631-0.334-1.206-0.411-1.914c2.398-0.336,2.55-4.602,1.252-6.13c1.538,0.083,3.29,1.659,4.6,2.449\n  \t\t\t\tc1.813,1.093,3.544,2.303,5.284,3.505c2.31,1.594,4.232,3.967,6.287,5.851c1.825,1.674,4.337,3.547,4.499,6.244\n  \t\t\t\tc0.153,2.545-3.692,3.832-5.784,4.318c-2.978,0.692-6.17,0.138-7.993-2.524c-1.169-1.707-2.254-3.536-3.5-5.25\n  \t\t\t\tc-0.439-0.59-1.08-1.18-1.779-1.79L758.238,133.569z\"/>\n  \t\t\t<path fill=\"#00A0C6\" d=\"M775.328,162.049c-0.318-2.695-1.155-6.244-2.533-8.597c-1.334-2.278-3.969-4.614-3.914-7.454\n  \t\t\t\tc0.853,0.529,2.265,4.395,3.528,3.48c1.148-0.832-1.517-2.621-0.086-3.878c1.327,1.35,3.852,4.065,5.919,3.759\n  \t\t\t\tc1.791-0.265,2.771-2.592,1.654-3.935c1.349-0.712,0.693-2.443-0.06-3.456c3.957,2.824,5.487,9.532,7.849,13.559\n  \t\t\t\tc1.245,2.124,2.978,5.408,3.415,7.851c0.992,5.523-8.633,5.953-12.223,5.741c-4.156-0.246-4.216-0.502-3.575-4.654\n  \t\t\t\tc0.13-0.79,0.13-1.61,0.03-2.41L775.328,162.049z\"/>\n  \t\t\t<path fill=\"#00A0C6\" d=\"M773.038,198.779c-1.053-1.173-1.617-2.563-1.249-4.73c0.552-3.252,2.686-6.041,3.228-9.277\n  \t\t\t\tc0.399-2.389,0.546-4.771,0.546-7.257c0-1.625-0.629-5.085,0.529-6.227c0.495,0.553,0.831,3.614,1.972,2.808\n  \t\t\t\tc0.881-0.624-0.326-2.96-0.369-3.75c2.13,1.705,1.605,4.178,5.186,4.222c2.303,0.028,6.008-1.242,5.637-4\n  \t\t\t\tc1.421-0.611,1.412,1.324,1.909,2.245c0.483-0.938,0.543-2.035,0.512-3.058c0.241,0.002,0.479-0.017,0.729,0.001\n  \t\t\t\tc1.66,0.12,2.277,18.433,2.446,20.201c0.393,4.112,1.938,11.935-2.401,14.159c-4.854,2.488-11.248,0.578-15.29-2.538\n  \t\t\t\tc-1.3-0.98-2.51-1.8-3.39-2.78L773.038,198.779z\"/>\n  \t\t\t<path fill=\"#00A0C6\" d=\"M746.599,243.519c-2.63-2.987-3.739-6.39-3.115-11.076c0.365-2.74,1.571-4.022,3.701-5.426\n  \t\t\t\tc4.23-2.788,7.636-6.404,10.982-10.342c3.02-3.551,5.743-7.34,8.272-11.252c1.208-1.869,2.84-8.504,5.342-8.688\n  \t\t\t\tc-0.036,2.042-2.436,4.385-1.63,6.623c1.205,3.354,4.109,0.684,5.772-0.546c0.552,0.906,1.049,1.864,1.568,2.797\n  \t\t\t\tc2.761-0.696,5.396-1.212,6.932,1.737c0.751,1.441-0.266,6.196,0.718,6.963c3.367,2.623,5.136-7.741,5.081-9.194\n  \t\t\t\tc0.064,1.724,0.801,3.058,0.487,5.063c-0.424,2.714-1.57,5.32-2.796,7.756c-2.531,5.033-5.087,10.041-8.432,14.71\n  \t\t\t\tc-3.041,4.246-6.154,8.829-9.65,12.797c-5.321,6.041-13.697,5.901-20.021,1.026c-1.23-0.95-2.301-1.93-3.2-2.95L746.599,243.519z\"\n  \t\t\t\t/>\n  \t\t\t<path fill=\"#00A0C6\" d=\"M742.979,235.608c-0.135,3.624-3.812,6.221-3.974,9.76c-0.118,2.618,2.012,6.311,3.563,8.474\n  \t\t\t\tc5.132,7.152,11.715,4.68,16.85-1.244c-5.187,10.371-18.591,16.151-28.581,21.413c-7.342,3.866-14.531,7.18-21.252,12.127\n  \t\t\t\tc-6.285,4.629-14.014,6.877-19.61-0.114c-3.856-4.817-5.809-13.088-4.361-19.101c2.178-9.037,13.444-10.937,20.701-13.709\n  \t\t\t\tc5.229-1.999,10.688-4.385,15.407-7.507c3.776-2.499,7.335-8.658,11.722-9.764c0.188-0.163,0.18-0.176-0.025-0.039\n  \t\t\t\tc-2.706,1.824-0.574,3.113,1.339,3.39c3.141,0.45,5.24-3.3,8.22-3.69L742.979,235.608z\"/>\n  \t\t\t<path fill=\"#00A0C6\" d=\"M579.76,295.917c-3.367-8.104-5.116-25.668,5.815-30.999c10.935-5.333,25.831,1.194,37.423,1.422\n  \t\t\t\tc13.859,0.274,26.481-2.503,39.354-5.123c5.034-1.024,10.139-2.081,14.55,1.142c4.961,3.624,1.468,5.152-3.351,6.925\n  \t\t\t\tc-4.776,1.758-14.878,4.544-14.625,9.743c0.199,4.115,7.87,7.23,12.573,6.939c-1.595,0.099-6.864,2.423-6.447,4.654\n  \t\t\t\tc0.377,2.017,5.073,1.926,6.623,1.938c5.562,0.042,11.532-2.057,15.205-6.369c-0.021,7.159-8.317,8.118-13.558,8.85\n  \t\t\t\tc-7.604,1.06-14.621,3.268-22.026,4.931c-7.369,1.655-15.15,2.077-22.615,3.896c-10.278,2.502-18.684,3.975-29.35,4.633\n  \t\t\t\tc-10.27,0.639-16.46-5.121-19.55-12.57L579.76,295.917z\"/>\n  \t\t\t<path fill=\"#00A0C6\" d=\"M456.82,290.818c-5.479-13.823-2.242-37.429,20.763-38.572c10.852-0.539,21.694,1.194,32.312,2.153\n  \t\t\t\tc7.789,0.703,15.663,1.227,23.417,2.118c10.073,1.157,18.441-2.259,28.422-0.377c9.323,1.757,13.099,6.063,17.247,12.239\n  \t\t\t\tc-3.154-4.695-9.001-10.79-16.384-5.748c-3.11,2.124-1.529,3.755-2.833,6.33c-2.646,5.224-12.95-0.82-18.431,2.272\n  \t\t\t\tc-5.173,2.919-6.91,9.775-7.371,14.51c-0.942,9.672,8.219,2.592,13.636,7.582c2.749,2.532,1.876,5.731,6.313,7.824\n  \t\t\t\tc7.894,3.725,15.434-2.97,20.58-7.214c-8.694,17.575-48.064,6.845-64.598,7.892c-11.143,0.707-22.484,1.471-33.5,2.182\n  \t\t\t\tc-10.301,0.681-16.49-5.359-19.58-13.18L456.82,290.818z\"/>\n  \t\t</g>\n  \t\t<path id=\"neuron\" proxy-tap='showCloseUp:neuron' fill=\"#A01515\" d=\"M0.503,76.729c2.83-0.528,7.563-0.355,10.36,0.316c2.041,0.49,5.254,3.469,7.163,1.379\n  \t\t\tc1.417-1.552-0.201-4.639-0.342-6.341c-0.217-2.626,0.175-4.025,0.81-6.636c1.501-6.179,1.587-12.623,3.01-18.824\n  \t\t\tc1.499-6.535,1-10.119-2.478-15.973C17.155,27.5,5.17,12.767,10.916,10.068c-0.265,4.166,1.679,8.245,3.589,11.974\n  \t\t\tc2.728,5.325,10.155,10.943,10.924,16.951c0.391,3.05-1.581,7.212-2.539,9.978c-1.948,5.618-3.463,11.247-4.01,17.181\n  \t\t\tc-0.912,9.901,5.565,24.481,16.868,25.637c6.733,0.689,11.099-2.934,17.944-2.215c8.463,0.888,16.479,4.034,24.897,4.067\n  \t\t\tc-0.233-7.639,4.102-14.592,1.897-21.626c-2.393-7.633-8.875-12.996-13.113-19.538C62.957,45.66,57.115,41.909,50.614,37.03\n  \t\t\tc-3.147-2.362-12.075-6.247-12.562-10.398c3.268-2.127,9.315,5.119,12.075,6.776c2.642,1.586,8.421,7.431,11.878,6.199\n  \t\t\tc2.605-0.928,3.333-11.702,3.934-14.815c1.613-8.358-0.073-16.387-0.205-24.762l3.917,0.003c3.075,9.774-1.412,28.742-0.911,36.755\n  \t\t\tc0.282,4.492-1.417,7.626,0.407,12.243c1.682,4.26,4.634,7.979,7.351,11.616c3.284,4.397,4.9,7.018,8.569,1.579\n  \t\t\tc2.7-4.002,4.522-8.214,5.122-13.082c0.685-5.564-2.877-18.03,2.188-22.038c3.429,5.169,0.027,11.866,2.212,17.347\n  \t\t\tc4.294,0.473,7.935-3.497,11.836-4.375c0.372,2.98-2.408,3.22-4.409,4.576c-2.396,1.623-3.881,3.466-5.514,5.863\n  \t\t\tc-8.563,12.564-14.195,28.369-5.029,42.524c9.263,14.305,33.753,18.285,49.248,16.801c5.006-0.479,23.447-1.957,20.184-9.939\n  \t\t\tc-1.376-3.366-4.544-6.281,1.198-7.273c5.329-0.921,4.647,3.771,6.29,7.299c3.203,6.88,12.026,8.347,18.895,6.487\n  \t\t\tc3.92-1.061,7.209-3.6,9.68-6.773c1.762-2.263,3.013-4.688,4.204-7.292c1.148-2.512,2.475-4.768,2.821-7.509\n  \t\t\tc0.381-3.009,1.358-5.882,1.574-8.947c0.188-2.674,0.17-5.252,0.103-7.922c-0.037-1.494,0.062-3.003-0.174-4.486\n  \t\t\tc-0.244-1.532-1.146-2.315-1.658-3.656c-0.644-1.683-1.272-3.34-1.991-4.992c-2.104-4.838-5.215-9.277-8.328-13.502\n  \t\t\tc-2.021-2.744-4.806-4.95-6.591-7.763c-0.961-1.514-0.024-4.405,2.265-3.808c1.667,0.435,2.253,3.416,2.841,4.683\n  \t\t\tc1.136,2.449,2.753,4.649,4.062,7.002c0.56,1.005,1.538,3.594,2.534,4.231c1.013,0.646,1.057-0.423,1.372-1.42\n  \t\t\tc0.401-1.272,0.591-3.092,1.609-4.062c0.675-0.643,1.349-0.808,1.771,0.173c0.531,1.234-0.599,1.842-1.239,2.68\n  \t\t\tc-2.166,2.837,0.095,7.892,1.384,10.688c0.669,1.453,1.94,5.797,3.696,6.162c1.664,0.346,2.835-3.83,3.358-4.868\n  \t\t\tc1.03-2.043,2.229-4.061,3.229-6.121c2.636-5.421,6.202-10.524,9.468-15.552c3.193-4.917,5.618-11.147,3.363-16.938\n  \t\t\tc-1.998-5.131-6.801-12.011-10.093-16.389l2.649-0.008c1.609,3.171,5.171,8.856,7.114,11.834c0.77,1.179,0.808,2.729,2.198,3.263\n  \t\t\tc1.535,0.589,1.637,0.407,2.071-0.818c1.353-3.812,2.624-7.604,4.267-11.339c1.549-3.523-0.334,0.685,0.967-2.94h4.606\n  \t\t\tc-2.87,6.265-3.47,8.852-6.035,15.246c-1.705,4.249-3.243,8.562-4.794,12.871c-0.958,2.66-2.153,5.207-3.504,7.663\n  \t\t\tc-0.639,1.162-2.806,4.368-1.862,5.733c1.103,1.596,4.255-1.091,5.151-1.782c1.512-1.167,3.512-2.381,4.749-3.98\n  \t\t\tc0.665-0.861,2.017-7.916,4.325-4c0.716,1.215,0.125,2.755,1.169,4.068c0.694,0.872,3.229,1.697,2.541,3.246\n  \t\t\tc-0.602,1.352-3.327,0.637-4.423,0.687c-4.098,0.186-6.506,3.839-9.412,6.219c-3.179,2.604-6.031,5.624-8.15,9.162\n  \t\t\tc-6.447,10.763-8.521,23.718-10.696,35.873c-4.805,26.846,8.92,43.36,23.314,63.531c8.11,11.364,20.716,18.297,29.12,29.302\n  \t\t\tc11.949,15.647,33.03,28.834,53.23,25.803c8.198-1.23,16.54-4.608,24.79-6.073c13.394-2.378,14.98,11.814,21.608,21.356\n  \t\t\tc7.682,11.057,17.008,19.007,28.354,26.248c18.278,11.666,34.826,13.344,56.168,14.144c33.899,1.271,67.854,3.351,101.729,4.299\n  \t\t\tc26.807,0.75,54.309,5.553,81.12,5.356c29.802-0.218,60.561-5.654,87.328-19.171c21.387-10.799,42.46-27.206,54.558-48.226\n  \t\t\tc9.204-15.992,11.03-37.414,4.089-54.578c-1.006-2.486-2.637-5.568-4.727-8.818c-7.569-11.772-21.159-25.759-32.853-21.709\n  \t\t\tc-2.891,1.001-6.179,6.719-8.132,9.185c-2.631,3.322-5.148,6.401-7.999,9.514c-2.128,2.322-4.138,5.984-6.517,7.731\n  \t\t\tc-0.184-0.288-0.707-1.018-0.916-1.232c4.968-6.813,14.079-12.44,17.347-20.566c-3.686-0.82-6.429,1.834-9.878,0.42\n  \t\t\tc1.727-2.28,4.188-1.327,6.611-2.521c13.503-6.655-4.695-16.19-7.783-7.56c-1.084,3.029,0.472,9.036-3.895,9.219\n  \t\t\tc0.537-2.178,1.602-4.191,1.912-6.566c0.1-0.757,0.455-4.309,0.051-4.86c-0.278-0.379-0.658-1.03-1.157-1.159\n  \t\t\tc-0.511-0.132-1.262,0.229-1.684,0.486c-1.044,0.635-1.747,1.731-2.276,2.803c-0.105,0.216-0.708,1.675-1.111,1.252\n  \t\t\tc-0.352-0.368,0.969-1.971,1.116-2.229c0.266-0.462,0.928-1.507,0.063-1.7c-0.639-0.141-1.996,0.624-2.585,0.876\n  \t\t\tc-2.421,1.04-4.729,2.178-7.032,3.492c-1.271,0.726-3.222,1.462-4.141,2.648c-0.66,0.852-1.083,1.683-2.104,2.188\n  \t\t\tc-1.126,0.556-2.076-0.025-2.583-1.145c-0.388-0.857-0.125-1.755,0.767-2.166c0.902-0.416,1.966-0.355,2.92-0.561\n  \t\t\tc1.673-0.362,3.461-0.989,4.99-1.779c1.683-0.87,3.437-1.602,5.138-2.439c1.92-0.945,5.306-2.858,3.911-5.505\n  \t\t\tc-0.741-1.407-2.27-2.379-3.606-3.142c-1.889-1.077-3.936-1.884-6.005-2.541c-2.098-0.666-4.258-1.181-6.444-1.451\n  \t\t\tc-1.585-0.195-3.336-0.346-4.891,0.119c-2.016,0.603-12.426,4.793-9.379-1.865c1.059-2.311,5.553-0.758,7.528-0.641\n  \t\t\tc1.771,0.105,3.571,0.045,5.335,0.193c1.976,0.166,4.105,1.147,6.08,0.497c-1.13,0.087-5.681-6.793-6.482-7.727\n  \t\t\tc-1.549-1.803-9.265-6.574-3.732-8.304c4.038-1.262,3.862,4.278,5.188,6.569c1.839,3.173,4.324,5.975,7.105,8.351\n  \t\t\tc1.555,1.326,6.021,4.97,8.191,3.922c-0.579-1.684-1.836-3.637-2.642-5.295c1.886,0.641,3.331,3.908,4.46,5.527\n  \t\t\tc2.32,3.333,6.713,4.946,10.573,5.642c2.701,0.487,9.271,2.318,11.006-0.708c1.779-3.104-3.023-7.478-4.898-9.349\n  \t\t\tc-2.849-2.841-6.042-6.312-10.485-5.84c-1.081,0.115-4.395,1.581-4.211-0.464c1.91-0.134,5.42,0.56,4.904-1.787\n  \t\t\tc-0.323-1.47-2.283-2.977-3.2-4.069c-2.186-2.604-5.028-5.808-8.187-7.242c-1.739-0.79-6.051-2.053-3.192-4.671\n  \t\t\tc3.862-3.54,5.328,2.76,6.816,4.789c3.279,4.471,7.908,8.535,11.908,12.36c0.698,0.668,1.871,2.044,2.871,2.051\n  \t\t\tc0.313-2.016-1.143-3.761-1.173-5.679c0.221-0.005,0.452,0.002,0.669,0.006c1.044,2.774,1.562,6.133,3.7,8.34\n  \t\t\tc0.604,0.625,6.263,4.427,6.479,3.438c1.354-6.162-4.564-10.534-8.619-14.06c-0.717-0.624-1.524-1.238-2.148-1.958\n  \t\t\tc-0.904-1.042-1.71-2.161-2.703-3.146c-0.481-0.479-1.135-0.642-1.623-1.079c-1.407-1.262,1.606-3.346,2.551-2.282\n  \t\t\tc0.446,0.504,0.017,0.963,0.017,1.503c-0.002,0.933,0.991,1.979,1.502,2.681c0.207,0.284,1.619,2.483,2.077,2.302\n  \t\t\tc0.348-0.138-0.312-1.935-0.264-2.362c0.284,0.123,0.445,0.453,0.53,0.733c0.158,0.522,0.272,1.024,0.472,1.559\n  \t\t\tc0.336,0.902,0.694,1.417,1.331,2.099c0.794,0.851,1.692,1.613,2.586,2.352c0.763,0.629,1.688,1.665,2.679,1.874\n  \t\t\tc1.406,0.296,1.28-2.447,1.283-3.344c0.003-0.75-0.228-1.461-0.522-2.155c-0.161-0.378-1.22-1.785-0.746-2.103\n  \t\t\tc0.37,0.453,0.796,1.38,1.353,1.612c0.431-0.487,0.201-1.978,0.201-2.617c0-0.711-0.079-1.133-0.355-1.764\n  \t\t\tc-0.216-0.492-0.562-1.29-0.053-1.746c0.522-0.469,1.577-0.142,1.845,0.462c0.283,0.641-0.167,1.04-0.424,1.554\n  \t\t\tc-0.353,0.706-0.359,1.719-0.457,2.505c-0.157,1.261-0.246,2.626-0.15,3.902c0.035,0.462,0.074,1.376,0.594,1.592\n  \t\t\tc0.339-0.627,0.761-1.221,1.162-1.813c0.37-0.545,0.783-1.658,1.405-1.936c0.209,1.302-1.453,2.639-1.943,3.712\n  \t\t\tc-0.28,0.613-0.574,1.219-0.787,1.86c-0.225,0.676-0.104,1.283,0.037,1.979c0.144,0.701,0.412,1.367,0.529,2.078\n  \t\t\tc0.239,1.454,0.482,2.911,0.824,4.346c0.298,1.257,0.514,2.534,0.894,3.766c0.135,0.439,0.265,0.879,0.389,1.323\n  \t\t\tc0.68,2.418,1.478,4.812,2.809,6.967c1.47,2.38,3.439,4.387,5.614,6.129c3.741,2.996,7.961,5.358,11.979,7.952\n  \t\t\tc23.899,15.43,33.046,43.722,29.779,71.336c-3.518,29.748-30.077,52.975-53.933,68.224c-22.604,14.45-48.559,25.165-75.123,29.401\n  \t\t\tc-41.776,6.662-86.562,5.332-128.439,0.548c-34.321-3.921-73.198-8.301-105.089,8.255c-18.029,9.36-28.513,25.862-32.102,45.55\n  \t\t\tc-1.764,9.672-2.051,19.566-1.897,29.373c0.078,5.014-7.673,30.193-3.883,32.039c4.81,2.34,3.527-2.645,4.669-4.844\n  \t\t\tc1.123-2.162,3.326-6.508,4.709-1.367c0.588,2.186-2.225,5.676-2.595,7.881c2.342,1.672,5.611,0.277,7.914-0.162\n  \t\t\tc3.89-4.016,6.878-8.943,10.468-13.219c3.248-3.865,9.737-8.523,10.514-13.873c0.785-5.412-6.771-9.879-4.34-15.145\n  \t\t\tc1.521-3.295,5.357-3.369,5.928,0.566c-3.87,2.543-0.954,10.467,2.749,12.045c4.944-4.521,8.804-10.916,12.701-16.615\n  \t\t\tc3.146-4.6,3.282-10.061,5.952-14.129c1.536-2.342,3.537-4.498,6.023-2.012c3.126,3.123-0.96,4.723-2.71,7.309\n  \t\t\tc-2.888,4.268-5.788,10.074-7.93,14.65c4.024-1.736,8.812-2.867,12.79-4.746c3.023-1.428,5.572-4.154,9.123-3.785\n  \t\t\tc3.67,10.711-10.81,7.814-16.101,10.066c-8.498,3.617-13.003,10.078-18.67,17.168c-3.784,4.732-19.739,20.621-6.761,22.689\n  \t\t\tc7.633,1.217,20.546-0.354,27.372-3.977c7.632-4.051,2.767-11.693,3.559-18.049c0.585-4.695,7.343-13.369,13.215-11.881\n  \t\t\tc1.954,7.902-7.33,6.096-9.765,9.365c-1.93,2.59,0.327,10.59,1.961,13.197c3.082,4.916,7.392,2.938,11.724,4.803\n  \t\t\tc5.104,2.195,9.35,7.875,13.96,11.229c-4.552,0.25-8.882-5.092-12.965-6.844c-4.993-2.143-8.819-0.395-14.138,0.684\n  \t\t\tc-6.625,1.342-13.497,2.381-20.144,3.596c-3.597,0.658-10.316,1.064-12.948,3.371c8.423,7.312,10.293,29.719,25.095,27.18\n  \t\t\tc3.89-0.668,11.504-6.584,13.368,0.799c1.805,7.15-5.74,5.752-9.382,5.004c-3.267-0.668-8.029,0.209-10.666-0.455\n  \t\t\tc-8.537-2.148-13.312-14.607-17.188-21.363c-1.21-2.104-2.248-6.416-5.379-3.865c3.823,7.262-5.557,11.447-3.45,1.184\n  \t\t\tc0.688-3.357,3.267-2.369,0-6.002c-4.357-4.848-18.604-0.795-20.941,4.771c-3.308,7.873,2.711,23.541,6.107,30.613\n  \t\t\tc3.231,6.732,6.866,13.268,10.185,19.98c2.013,4.072,7.974,11.488,7.196,15.945c-4.138-3.516-7.211-11.078-9.719-15.916\n  \t\t\tc-5.414-10.441-8.72-21.918-15.342-31.709c-3.888,7.201-2.052,26.037-11.384,29.609c0.829-8.061,5.905-16.502,7.928-24.68\n  \t\t\tc2.911-11.768-3.873-29.959-15.011-35.623c-4.482-2.277-18.555-2.279-14.866,6.219c1.141,2.627,5.403,3.535,7.064,5.639\n  \t\t\tc3.58,4.531,2.721,10.764-3.867,11.182c-6.947,0.441-5.194-6.045-9.32-9.479c-9.016-7.508-20.579,1.875-22.63,11.377\n  \t\t\tc-2.861,13.256,7.973,26.297,16.104,35.467c9.026,10.178,16.288,22.479,28.893,28.711c12.007,5.936,27.942-0.561,40.299-3.424\n  \t\t\tc11.044-2.561,24.736-5.436,34.65-11.15c2.104-1.213,5.045-3.178,6-5.52c1.191-2.924-1.594-5.822-0.712-8.029\n  \t\t\tc0.943-2.363,4.062-3.213,6.082-2c3.167,1.906,1.774,6.396,1.401,9.266c6.343,1.234,15.309-3.414,21.243-5.381\n  \t\t\tc10.688-3.543,21.29-8.455,31.804-12.666c6.138-2.459,14.232-3.689,18.884-8.67c3.245-3.475,5.03-14.418,9.229-15.094\n  \t\t\tc-4.682,6.553-3.274,16.629-10.734,21.412c-10.885,6.979-24.613,9.961-36.545,14.648c-4.436,1.744-23.915,5.799-25.224,10.756\n  \t\t\tc-1.519,5.748,13.155,9.139,17.105,9.76c8.143,1.281,17.311-1.895,25.946-1.998c-10.346,1.127-18.556,5.209-29.311,3.311\n  \t\t\tc-7.614-1.344-14.418-6.133-22.205-6.709c-7.895-0.586-15.154,3.52-22.833,4.605c-7.614,1.076-14.393,5.025-21.646,7.312\n  \t\t\tc-6.031,1.898-16.267,4.531-13.372,11.914c2.479,6.33,12.271,11.959,17.788,15.35c10.963,6.74,19.678,15.613,29.909,23.562\n  \t\t\tc7.251,5.633,17.424,16.451,26.508,18.654c3.884,0.941,5.949-1.242,9.348-0.666c8.287,1.408,2.945,10.07-3.892,6.1\n  \t\t\tc7.126,4.141,13.985,11.084,20.357,16.432c-8.896,0.877-12.069-0.729-18.636-6.502c-10.271-9.035-21.319-21.678-33.863-27.51\n  \t\t\tc-10.139-4.713-2.22,6.73,0.701,10.797c5.876,8.184,11.962,16.906,20.465,22.531c-10.918,3.355-12.66-3.264-18.465-11.367\n  \t\t\tc-10.857-15.158-22.837-28.836-36.284-41.691c-6.417-6.137-10.273-3.789-8.622,5.307c1.247,6.873,4.306,13.273,6.407,19.896\n  \t\t\tc1.928,6.07,3.937,12.062,5.313,18.156c0.814,3.605,1.665,8.768,4.434,11.084c-1.53-0.725-3.988-0.703-5.963-0.148\n  \t\t\tc0.107-5.293-2.269-11.766-3.415-17.031c-0.884-4.055-1.774-14.836-5.69-17.551c-5.651-3.918-6.57,4.352-8.014,8.199\n  \t\t\tc-0.836,2.229-1.984,4.381-2.648,6.668c-0.411,1.42-0.195,4.684-0.838,5.963c-2.848,5.672-7.727,2.305-4.68-3.365\n  \t\t\tc1.931-3.596,4.322-7.1,6.133-11.236c3.019-6.896,7.567-15.842,4.363-23.381c-1.438-3.385-4.664-6.461-7.115-9.332\n  \t\t\tc-1.74-2.039-17.825-20.984-21.854-15.771c-6.849,8.855-4.669,23.725-5.85,34.186c-1.641,14.537-6.041,28.656-9.564,42.514H363.4\n  \t\t\tc2.066-11.465,6.946-23.908,1.87-33.055c-6.477-11.67-26.02-11.619-35.983-15.014c14.477-1.873,24.196,7.67,37.093,7.199\n  \t\t\tc5.042-9.398,7.259-20.809,4.097-31.061c-1.348-4.371-3.812-20.398-9.987-11.641c-2.748,3.898-4.384,12.045-10.18,4.627\n  \t\t\tc-1.512-1.938-2.993-6.471-0.983-8.531c1.504-1.541,4.535-0.633,6.46-1.506c8.417-3.812-2.62-15.537-6.259-19.34\n  \t\t\tc-5.105-5.334-11.023-9.9-16.239-15.143c-3.28-3.295-9.841-9.672-7.298-0.281c1.209,4.469,6.987,10.943-2.167,11.518\n  \t\t\tc-4.706,0.295-11.66-4.701-10.032-10.082c0.544-1.799,3.223-3.098,4.043-4.633c4.32-8.09-3.828-17.803-10.972-20.824\n  \t\t\tc-7.611-3.217-16.275-3.037-24.356-3.824c-12.899-1.256-26.976,0.314-38.661,6.092c-7.871,3.895-14.725,6.658-23.354,8.391\n  \t\t\tc-9.225,1.85-22.465,4.229-28.203,12.729c-4.85,7.188-8.379,21.064-7.212,29.516c8.424,5.053,20.944,12.238,31.117,10.713\n  \t\t\tc9.79-1.469,21.157-2.668,30.209-7.014c5.01-2.406,8.87-5.043,13.079-8.404c5.023-4.014,12.27-8.049,17.546-1.73\n  \t\t\tc7.196,8.619-9.145,5.719-11.342,6.055c-7.044,1.082-12.081,7.547-18.438,10.271c-9.471,4.061-20.008,4.855-29.605,8.574\n  \t\t\tc4.142,1.709,7.308,5.023,11.661,6.312c3.902,1.156,6.306,1.775,9.782,4.482c6.43,5.008,14.961,7.125,22.371,10.221\n  \t\t\tc5.022,2.096,9.795,3.148,14.564,5.715c6.123,3.295,12.744,5.773,19.368,7.768c6.231,1.875,11.431,6.047,17.195,9.146\n  \t\t\tc7.29,3.92,12.768,10.291,20.406,13.869c3.25,1.521,10.346,4.004,8.387,9.387c-1.719,4.725-6.033,0.359-7.875-1.764\n  \t\t\tc-4.476-5.16-7.954-9.559-13.878-13.4c-11.804-7.652-25.189-12.822-38.623-16.748c-8.979-2.625-18.137-4.633-27.021-7.576\n  \t\t\tc-4.434-1.469-8.806-3.146-12.987-5.238c-3.41-1.703-6.854-4.711-10.921-3.975c0.16,2.988,3.221,5.762,1.365,8.797\n  \t\t\tc-3.954,6.463-7.865-0.869-8.444-4.373c-0.739-4.465-0.232-7.471-3.868-10.607c-4.726-4.078-10.05-6.494-15.797-8.416\n  \t\t\tc-6.518-2.182-12.196-6.389-18.74-8.598c-2.631-0.889-7.106-2.732-9.635-0.512c-2.045,1.797-1.35,6.574-1.339,8.998\n  \t\t\tc0.016,3.881-0.218,8.271,0.864,12.174c1.319,4.76,4.742,9.291,8.098,12.561c4.428,4.314,8.758,8.16,13.014,12.777\n  \t\t\tc5.184,5.625,11.378,8.91,17.023,13.602c4.99,4.146,1.253,15.193-4.633,10.549c-1.55-1.225-1.693-3.824-2.492-5.523\n  \t\t\tc-1.222-2.6-3.099-4.869-4.887-7.137c-2.994-3.803-6.579-7.891-10.685-10.51c-2.119-1.354-4.893-2.611-7.06-3.74\n  \t\t\tc-1.342-0.699-2.542-2.076-4.253-2c-6.836,0.307-3.386,13.754-2.481,17.367c2.275,9.094,9.352,16.367,16.016,22.793\n  \t\t\tc-6.696,0-15.699,2.637-22.039-0.107c-4.373-1.893-5.147-6.359-6.845-10.359c-0.791-1.863-2.415-6.971-4.557-7.656\n  \t\t\tc-2.506-0.807-2.053,0.693-3.869,2.027c-3.139,2.309-11.086,4.252-10.887-2.566c0.073-2.494,2.922-4.248,4.562-5.611\n  \t\t\tc4.618-3.84,7.067-6.395,8.375-12.504c0.98-4.574,6.247-31.764-4.442-24.996c-7.341,4.648-13.573,10.793-19.896,16.693\n  \t\t\tc-11.625,10.848-24.838,19.371-36.215,30.809c-1.873,1.883-12.315,13.344-10.686,4.633c0.774-4.137,10.642-9.33,13.665-11.951\n  \t\t\tc7.66-6.646,14.182-14.477,21.767-21.199c7.264-6.439,15.498-10.574,22.018-18.057c3.536-4.059,6.703-8.674,9.412-13.314\n  \t\t\tc5.625-9.637,9.05-19.943,11.438-31.01c-7.499-2.084-6.422,11.762-12.923,7.271c-2.585-1.785-3.006-6.373-1.065-8.887\n  \t\t\tc1.85-2.396,5.604-2.121,8.012-3.477c8.56-4.82,14.501-18.438,17.163-27.4c1.556-5.24,3.127-11.098,2.861-16.586\n  \t\t\tc-0.776-16.027-17.236-23.85-31.26-25.818c-11.785-1.656-30.985-0.047-42,5.85c-26.681,14.287-28.336,43.348-35.758,69.311\n  \t\t\tc-2.969,10.385-7.119,20.344-9.831,30.816c-0.909,3.514-0.643,15.691-3.483,17.85c-6.717,5.104-4.409-7.184-3.183-10.166\n  \t\t\tc4.445-10.812,7.749-21.871,11.316-33.033c4.579-14.33,10.163-30.277,9.854-45.475c-0.526-25.963-33.372,3.082-40.909,10.402\n  \t\t\tc-4.443,4.316-7.646,9.992-12.562,13.492c-3.962,2.818-7.773,0.578-11.548,2.85c-2.591,1.561-5.317,3.369-8.136,5.389l0.002-4.412\n  \t\t\tc8.104-7.867,14.79-15.949,15.974-22.969c-4.633-1.889-10.127-2.846-15.975-3.502v-13.047\n  \t\t\tc25.033-2.232,49.473-10.428,70.772-24.262c27.407-17.799,78.291-63.844,41.012-95.807c-10.274-8.805-26.978-3.092-38.552-0.484\n  \t\t\tc-15.024,3.381-29.739,7.777-44.169,13.701c-6.727,2.762-18.619,11.506-25.774,11.119c-1.134-0.061-2.229-0.393-3.289-0.893\n  \t\t\tv-16.434c1.08,0.484,2.159,0.912,3.24,1.254c5.978,1.896,12.162,0.045,17.829-2.242c2.849-1.15,4.953-3.164,8.096-3.777\n  \t\t\tc3.831-0.744,8.304,0.975,12.075-0.123c4.561-1.328,11.237-7.006,15.002-10.053c2.75-2.223,16.004-9.229,17.061-11.973\n  \t\t\tc1.602-4.162-12.471-16.037-16.92-18.098c-6.961-3.226-16.333-2.645-24.203-4.952c-9.489-2.782-21.333-6.51-29.219-12.63\n  \t\t\tc-0.92,0.714-2.07,0.995-2.964,1.753v-10.81c12.899,12.756,36.05,23.441,53.237,14.308c3.23,1.659,9.214,2.631,12.016,4.749\n  \t\t\tc3.523,2.663,4.813,6.961,9.242,9.826c21.1,13.647,58.99,5.905,73.404-14.465c4.607-6.512,7.308-14.583,7.252-24.848\n  \t\t\tc-0.042-7.704-2.546-13.529,5.098-18.493c13.371-8.682,29.192-12.809,42.055-22.393c13.601-10.134,11.356-22.135,6.943-37.539\n  \t\t\tc-2.794-9.753-7.361-17.344-11.999-26c-3.149-5.879-5.727-15.992-10.979-20.271c-10.022-8.166-34.752,1.782-47.133,1.232\n  \t\t\tc-12.055-0.536-22.971-0.784-34.747,1.518c-6.878,1.344-14.236,3.861-20.502,7.083c-2.09,1.075-15.872,16.501-17.422,7.415\n  \t\t\tc-0.655-3.836,5.417-5.044,7.937-5.917c5.405-1.87,11.229-3.714,16.621-6.083c3.534-1.553,11.498-3.487,13.987-6.364\n  \t\t\tc3.735-4.32-17.491-12.336-20.532-13.656c-11.474-4.981-23.653-8.045-36.237-7.238c-7.757,0.5-17.254,7.794-23.013,12.697\n  \t\t\tc-1.846,1.571-13.329,13.67-16.1,10.935c-2.64-2.606,15.854-14.144,17.619-16.532c3.282-4.438,1.792-7.341-2.463-10.278\n  \t\t\tC17.122,88.293,10.277,79.08,0.46,77.739\"/>\n  \t\t<g id=\"schwann_x5F_cell_x5F_nuclei\">\n  \t\t\t<ellipse fill=\"#FFBF00\" cx=\"541.17\" cy=\"263.358\" rx=\"8\" ry=\"3\"/>\n  \t\t\t<ellipse fill=\"#FFBF00\" cx=\"658.499\" cy=\"268.528\" rx=\"6\" ry=\"2.167\"/>\n  \t\t\t\n  \t\t\t\t<ellipse transform=\"matrix(-0.4208 -0.9072 0.9072 -0.4208 821.4044 1011.2043)\" fill=\"#FFBF00\" cx=\"733.53\" cy=\"243.368\" rx=\"1.968\" ry=\"5.451\"/>\n  \t\t\t\n  \t\t\t\t<ellipse transform=\"matrix(-0.8317 -0.5552 0.5552 -0.8317 1281.4614 861.1868)\" fill=\"#FFBF00\" cx=\"771.25\" cy=\"236.378\" rx=\"1.629\" ry=\"4.51\"/>\n  \t\t\t\n  \t\t\t\t<ellipse transform=\"matrix(-0.8488 -0.5287 0.5287 -0.8488 1338.469 758.0218)\" fill=\"#FFBF00\" cx=\"777.612\" cy=\"187.645\" rx=\"1.419\" ry=\"3.927\"/>\n  \t\t</g>\n  \t\t<g id=\"schwann_x5F_cells_x5F_front\">\n  \t\t\t<path opacity=\"0.57\" fill=\"#00A0C6\" d=\"M779.428,141.759c-3.35-2.189-7.526-2.153-10.062,1.92\n  \t\t\t\tc-1.787,2.871,0.409,4.948,1.968,7.195c2.296,3.31,4.715,8.291,4.528,12.396c-0.144,3.114-1.634,5.201,2.295,5.783\n  \t\t\t\tc-0.317-0.047,3.143-3.893,3.806-4.21c0.941-0.452,1.963-0.706,3.013-0.633c1.346,0.093,2.351,1.324,3.463,1.464\n  \t\t\t\tc5.071,0.644,0.046-7.603-0.774-9.412c-1.991-4.396-2.756-9.028-6.115-12.691c-0.659-0.71-1.37-1.32-2.13-1.82L779.428,141.759z\"\n  \t\t\t\t/>\n  \t\t\t<path opacity=\"0.57\" fill=\"#00A0C6\" d=\"M769.028,128.839c-0.962-0.757-1.929-1.505-2.859-2.264\n  \t\t\t\tc-2.813-2.293-10.685-8.917-12.849-2.546c-1.361,4.008,1.184,5.462,3.868,7.563c2.539,1.987,4.214,4.549,5.725,7.328\n  \t\t\t\tc0.6,1.102,1.05,1.992,2.088,2.791c0.308,0.237,4.354,1.83,4.212,1.281c-0.845-3.266,4.817-5.336,6.787-2.663\n  \t\t\t\tc0.159,0.215,0.373-3.079,0.185-3.6c-0.651-1.801-2.022-3.457-3.406-4.746c-1.19-1.09-2.47-2.12-3.761-3.14L769.028,128.839z\"/>\n  \t\t\t<path opacity=\"0.57\" fill=\"#00A0C6\" d=\"M501.45,254.388c-7.274-0.558-13.604-2.118-20.983-1.74\n  \t\t\t\tc-6.055,0.311-15.454-0.279-18.903,4.875c-3.031,4.528,1.17,8.634,6.229,9.306c5.78,0.768,8.914-0.355,12.13,5.24\n  \t\t\t\tc2.205,3.837,2.595,8.979,0.685,13.05c-0.886,1.884-2.311,4.075-4.035,5.386c-2.279,1.731-5.333,1.073-7.329,2.266\n  \t\t\t\tc-5.302,3.168,0.073,8.966,4.481,10.679c4.18,1.624,8.209,0.429,12.653,0.104c8.512-0.616,17.034-1.285,25.561-1.721\n  \t\t\t\tc8.741-0.445,14.903,0.349,23.153,1.604c10.73,1.634,29.025,2.971,37.169-3.367c10.564-8.226,14.27-25.689,5.681-35.542\n  \t\t\t\tc-6.718-7.708-19.896-10.245-30.773-8.989c-15.178,1.752-30.301-0.023-45.441-1.129c-0.09,0-0.189-0.01-0.279-0.02L501.45,254.388\n  \t\t\t\tz\"/>\n  \t\t\t<path opacity=\"0.57\" fill=\"#00A0C6\" d=\"M622.289,265.858c-7.555-0.089-15.043-0.811-22.593-1.176\n  \t\t\t\tc-3.637-0.176-7.964-0.314-11.514,0.28c-1.726,0.289-2.616-0.204-4.134,1.265c-0.355,0.343-2.075,4.229-1.532,4.242\n  \t\t\t\tc10.759,0.257,10.891,11.57,8.995,19.553c-1.132,4.76-3.997,6.75-6.571,10.503c1.716,2.04,7.247,5.49,9.723,6.408\n  \t\t\t\tc4.18,1.551,8.209,0.408,12.653,0.102c8.998-0.623,17.646-3.312,26.568-4.396c8.661-1.052,16.757-5.299,25.565-6.116\n  \t\t\t\tc4.541-0.421,8.973-0.635,13.523-0.979c9.597-0.725,16.097-2.417,16.054-13.396c-0.044-11.183-1.765-20.23-17.852-22.091\n  \t\t\t\tc-13.101-1.515-27.895,4.888-41.497,5.651c-2.47,0.18-4.93,0.21-7.39,0.18V265.858z\"/>\n  \t\t\t<path opacity=\"0.57\" fill=\"#00A0C6\" d=\"M738.219,231.458c-6.482,1.409-7.755,6.719-12.23,10.543\n  \t\t\t\tc-2.889,2.468-6.376,4.153-9.682,5.97c-5.684,3.124-11.905,4.859-18.055,6.792c-2.914,0.917-14.226,6.882-8.203,10.917\n  \t\t\t\tc1.457,0.976,4.395,0.455,6.188,1.38c3.095,1.595,5.102,4.847,6.127,8.031c0.645,1.994,0.837,4.642,0.04,6.556\n  \t\t\t\tc-0.776,1.868-3.701,2.438-4.29,3.674c-2.927,6.136,6.741,4.28,9.408,2.666c11.203-6.777,23.301-12.348,33.996-19.771\n  \t\t\t\tc5.969-4.143,16.876-10.258,18.086-17.855c1.29-8.091-7.43-16.105-14.309-18.375c-2.739-0.89-5.04-0.97-7.1-0.52L738.219,231.458z\n  \t\t\t\t\"/>\n  \t\t\t<path opacity=\"0.57\" fill=\"#00A0C6\" d=\"M782.938,197.549c-3.182-1.658-6.816-2.502-9.509-1.922\n  \t\t\t\tc-5.769,1.243-6.899,8.121-9.323,12.381c-1.921,3.375-4.426,6.638-6.943,9.7c-2.624,3.191-5.443,6.366-8.658,8.917\n  \t\t\t\tc-2.303,1.828-4.715,2.855-2.341,5.325c2.493,2.594,3.345,0.602,6.008,0.066c3.681-0.74,7.442,2.223,9.425,5.008\n  \t\t\t\tc1.625,2.284,1.459,4.792,0.505,7.265c-0.428,1.106-2.859,3.444-2.225,4.708c0.779,1.55,5.263,0.201,6.532-0.338\n  \t\t\t\tc4.854-2.06,7.509-7.583,9.854-11.961c3.042-5.678,6.837-10.482,9.308-16.26c2.354-5.508,6.542-9.938,4.032-16.423\n  \t\t\t\tc-0.979-2.56-3.619-4.9-6.659-6.48L782.938,197.549z\"/>\n  \t\t\t<path opacity=\"0.57\" fill=\"#00A0C6\" d=\"M792.338,170.619c-0.087-0.224-0.183-0.439-0.29-0.646\n  \t\t\t\tc-2.459-4.774-8.919-5.307-12.913-2.675c-5.105,3.364-3.289,8.178-3.841,13.122c-0.287,2.567-0.852,4.856-1.621,7.325\n  \t\t\t\tc-0.583,1.871-3.989,12.867,1.037,12.058c0.629-1.304,0.538-2.765,1.594-3.792c2.416-2.35,7.211-1.151,9.651,0.509\n  \t\t\t\tc1.188,0.808,2.546,2.046,2.898,3.506c0.069,0.285-0.244,3.546-0.807,3.059c0.078,0.068,0.153,0.14,0.223,0.218\n  \t\t\t\tc0.676-0.311,1.027-0.097,1.779,0.094c-0.062,0.354,0.123,0.814,0.021,1.197c4.363-1.209,3.31-7.629,3.519-11.093\n  \t\t\t\tc0.26-4.304,0.237-8.5-0.263-12.81c-0.34-2.95,0.13-7.18-0.99-10.08L792.338,170.619z\"/>\n  \t\t</g>\n  \t\t<g id=\"other_x5F_neurons\">\n  \t\t\t<path fill=\"#F9C193\" d=\"M263.821,24.185c0.468,2.588,0.705,5.719,0.723,6.556c0.099,4.777-1.665,9.978-3.959,14.113\n  \t\t\t\tc-2.801,5.047-16.523,15.518-15.963,20.756c2.479-0.533,4.5-2.955,7.127-3.846c0.105,6.246-10.287,15.376-14.082,19.767\n  \t\t\t\tc-5.158,5.968-10.563,11.687-15.829,17.497c-6.839,7.546-26.218,11.013-18.518,24.02c2.483,4.194,9.529,7.542,13.732,3.819\n  \t\t\t\tc1.916-1.697,1.24-3.575,2.133-5.834c4.641-11.745,13.118-29.756,25.831-34.566c3.396,4.76-0.646,12.604,0.838,17.626\n  \t\t\t\tc3.475-5.283,1.947-13.15,3.817-19.026c1.935-6.08,5.866-14.509,10.866-18.719c8.738-7.357,13.833,7.193,15.718,13.451\n  \t\t\t\tc3.486,11.568,10.399,24.613,9.707,36.956c-0.631,11.255-8.76,21.021-14.111,30.424c-1.158,2.035-12.013,22.877-4.151,21.701\n  \t\t\t\tc2.905-0.435,2.307-3.854,2.818-5.847c1.123-4.379,2.174-7.754,4.63-11.947c2.905-4.958,6.031-11.659,10.532-15.329\n  \t\t\t\tc2.472-2.016,2.876-3.168,5.244-1.282c3.033,2.417,3.994,18.556,5.046,22.678c4.347,17.037,9.27,36.317,7.176,53.905\n  \t\t\t\tc-0.307,2.576-1.663,6.152-1.313,8.632c1.069,7.588,10.648,8.43,16.68,7.299c7.786-1.46,17.435-7.281,9.791-14.612\n  \t\t\t\tc-7.278-6.98-12.813-10.931-15.79-21.352c-3.42-11.973-4.007-24.233-6.998-36.026c-3.731-14.712-6.51-29.638-9.688-44.474\n  \t\t\t\tc-1.984-9.26-3.208-19.01-6.43-27.922c-3.903-10.795-4.358-20.415-6.362-31.533c-0.467-2.593-4.162-13.667-2.047-15.566\n  \t\t\t\tc8.407-7.548,28.974,43.459,34.91,34.228c2.385-3.709-8.061-12.644-10.032-15.2c-4.979-6.457-9.986-12.862-14.683-19.521\n  \t\t\t\tc-5.958-8.447-13.856-17.652-14.795-28.305c-0.609-6.913-0.501-6.674-7.878-6.673c-0.8,0-10.996,0.354-11.071,0\n  \t\t\t\tc0.55,2.613,2.772,4.896,3.221,7.529c1.181,6.93-3.909,12.453-9.42,15.971c-2.205,1.407-4.24,3.879-6.826,4.588\n  \t\t\t\tc-1.99,0.546-3.657-0.132-4.544,2.353c-0.66,1.846-0.117,4.219,1.312,5.568c2.439,2.305,4.537,0.842,6.042-1.572\n  \t\t\t\tc0.708-1.137,1.061-2.559,1.841-3.63c1.043-1.431,2.802-2.65,4.106-3.849c1.929-1.773,3.777-3.683,5.975-5.135\n  \t\t\t\tc0.731-0.483,2.296-1.705,3.277-1.363c0.57,0.197,1.03,1.797,1.38,3.687L263.821,24.185z\"/>\n  \t\t\t<path fill=\"#FCA454\" d=\"M245.501,596.027c5.648-7.199,1.861-15.207-2.433-21.967c-3.887-6.119-7.271-14.811-12.855-19.25\n  \t\t\t\tc-3.857-3.068-7.996-5.777-3.747-10.781c2.142-2.521,6.725-2.83,9.045-0.512c2.622,2.619,0.563,4.59,0.59,7.133\n  \t\t\t\tc0.056,5.273,4.872,11.115,7.415,15.766c2.807,5.133,6.665,12.707,11.987,15.67c3.154-3.094,4.872-7.598,7.334-11.133\n  \t\t\t\tc2.786-4.002,4.792-8.295,7.019-12.613c5.201-10.09,9.1-20.848,10.627-32.133c1.29-9.527-2.447-17.484-8.163-25.033\n  \t\t\t\tc-6.722-8.877,6.317-12.656,8.079-5.613c-3.908,2.84-0.982,12.596-0.017,16.154c0.83,3.059,2.565,6.086,2.975,9.191\n  \t\t\t\tc0.417,3.166-1.777,7.297,0.961,10.018c6.35-5.264,10.829-17.186,15.479-23.916c5.45-7.893,8.419-13.857,10.185-23.166\n  \t\t\t\tc1.345-7.092,6.727-16.094,14.518-8.164c3.899,3.969,3.103,7.445-0.665,10.512c-9.091,7.4-14.229,14.268-20.668,23.988\n  \t\t\t\tc-13.439,20.289-25.813,41.455-36.146,63.344c-2.063,4.369-7.63,12.117-7.039,16.986c1.095,9.016,17.835,0.094,22.542-2.172\n  \t\t\t\tc16.321-7.863,33.386-15.967,48.125-26.496c1.75-1.25,4.128-2.033,5.183-4.115c1.192-2.354-0.57-6.914,1.14-8.748\n  \t\t\t\tc3.634-3.896,12.321,3.188,12.193,7.383c-0.162,5.309-7.8,6.51-11.998,8.502c-17.403,8.26-37.542,17.562-52,30.441\"/>\n  \t\t\t<path fill=\"#FCA454\" d=\"M0.503,505.527c4.076-5.777,7.161-12.514,9.889-19c1.907-4.533,2.3-9.072,3.711-13.512\n  \t\t\t\tc2.725-8.568,17.383-10.914,14.898,0.012c-0.812,3.568-5.41,7.516-7.623,10.363c-2.665,3.428-5.196,7.301-7.487,11.111\n  \t\t\t\tc-3.638,6.061-11.346,14.971-10.388,22.529c1.145,9.033,16.218-0.875,20.488-2.875c12.246-5.734,24.694-11.209,36.547-17.486\n  \t\t\t\tc12.705-6.73,26.847-13.83,38.602-22.014c10.627-7.398,20.688-15.074,29.361-24.539c2.688-2.934,11.083-7.91,12.012-0.475\n  \t\t\t\tc0.699,5.598-8.318,7.396-12.024,9.252c-8.188,4.1-14.896,11.51-22.488,16.639c-9.009,6.086-17.934,12.078-26.51,18.496\n  \t\t\t\tc-3.876,2.902-13.672,10.17-2.622,10.016c9.8-0.141,21.197-3.9,30.606-6.5c7.501-2.074,14.853-3.994,22.113-6.375\n  \t\t\t\tc5.084-1.668,9.93-5.078,14.915-6.537c12.177-3.564,12.488,13.955,2.889,13.021c-2.053-0.197-3.806-1.398-5.889-1.623\n  \t\t\t\tc-2.96-0.316-5.704,0.539-8.513,1.363c-8.801,2.586-17.411,5.676-26.487,7.512c-16.561,3.352-33.115,5.605-49.5,7.623\n  \t\t\t\tc-17.873,2.203-36.618,10.457-52,19.115c-1.39,0.783-4.582,2.537-5,2.887\"/>\n  \t\t\t<path fill=\"#FF7F00\" d=\"M0.003,24.53c6.92,5.014,11.97,12.581,15.111,20.502c0.541,1.364,1.603,8.532,3.391,8.545\n  \t\t\t\tc3.742,0.027-0.013-6.245-0.854-7.549c-4.025-6.244-7.283-13.04-11.011-19.498c-0.892-1.544-4.686-7.127-3.536-9.01\n  \t\t\t\tc1.945-3.184,7.06,2.76,9.045,3.821c1.84-3.847-3.855-4.971-6.147-6.812c-2.368-1.902-4.134-4.398-5.5-7\"/>\n  \t\t\t<path fill=\"#FF7F00\" d=\"M42.503,0.53c0,7.172-0.979,13.606-2.635,20.536c-0.747,3.121,0.845,9.464,3.147,3.964\n  \t\t\t\tc2.078-4.965-2.618-22.028,6.6-21.398c5.527,0.377,10.071,8.551,12.512,12.536c0.459,0.75,1.969,4.611,2.988,4.773\n  \t\t\t\tc3.112,0.496,1.037-3.323,0.375-4.311c-2.223-3.314-6.75-5.748-9.472-9.1c-1.814-2.233-4.609-5.316-5.015-7.5\"/>\n  \t\t\t<path fill=\"#FCA454\" d=\"M819.178,84.779c-4.373,0.565-9.609,3.88-13.512,5.818c-2.521,1.253-5.73,2.441-7.744,4.37\n  \t\t\t\tc-2.876,2.756-6.245,5.363-10.499,3.961c-0.312-0.103-7.99-3.987-7.73-2.093c0.356,2.619,6.677,1.996,8.453,3.499\n  \t\t\t\tc-0.866,1.421-5.521,1.936-7.225,2.513c-4.167,1.414-8.281,2.6-12.505,3.792c-4.596,1.297-9.437,1.224-14.202,2.065\n  \t\t\t\tc-3.101,0.547-6.323,1.357-9.334,1.255c-1.504-0.051-2.572-0.291-3.913,0.62c0.556,3.059,5.413,1.481,7.494,1.211\n  \t\t\t\tc5.526-0.717,11.33-2.263,16.877-2.274c-2.656,2.145-7.168,3.042-10.372,4.074c-1.293,0.416-2.514,1.036-3.789,1.451\n  \t\t\t\tc-1.846,0.599-4.952,0.1-4.013,3.027c0.654,2.04,2.675,1.799,4.195,0.641c1.524-1.162,2.83-1.923,4.568-2.681\n  \t\t\t\tc5.208-2.268,10.465-4.41,15.705-6.599c1.114-0.466,3.908-2.278,4.374-0.292c0.273,1.166-2.166,3.309-2.83,4.084\n  \t\t\t\tc-0.793,0.926-4.204,5.242-0.514,3.506c1.583-0.745,2.603-4.166,3.764-5.699c1.705-2.251,4.005-4.25,6.438-5.569\n  \t\t\t\tc2.289-1.242,5.188-1.772,4.523,2.007c-0.637,3.627-3.341,7.083-4.656,10.493c-0.549,1.419-0.832,5.226,1.263,2.631\n  \t\t\t\tc1.129-1.398,1.118-4.685,1.995-6.487c1.705,1.817,1.836,4.47,1.941,6.889c0.063,1.414-0.734,5.071,0.75,5.766\n  \t\t\t\tc1.803-2.335,0.133-6.925-0.506-9.481c-0.703-2.813-0.767-4.313,0.257-7.048c0.886-2.369,1.718-5.107,3.55-6.95\n  \t\t\t\tc1.391-1.399,4.274-4.27,6.442-3.958c1.146,0.165,1.354,0.897,2.752,0.768c2.433-0.226,4.989-1.586,7.235-2.506\n  \t\t\t\tc1.979-0.811,3.887-1.809,5.818-2.743c1.253-0.605,4.577-1.182,4.944-2.563\"/>\n  \t\t</g>\n  \t</g>\n\n  \t<rect proxy-tap='reset' class='tapcatcher' pointer-events='{{( showLabels ? \"none\" : \"normal\" )}}' x='0' y='0' width='819.18' height='596.441'/>\n\n  \t<g id=\"cutaway\" class='detail {{( closeup === \"neuron\" ? \"visible\" : \"hidden\" )}}'>\n  \t\t<g>\n  \t\t\t<path fill=\"#2F80A8\" d=\"M115.703,415.027c-5.621,1.029-25.052,8.281-29.133,1.807c-2.904-4.604,5.93-13.555,8.313-16.977\n  \t\t\t\tc5.936-8.52,12.771-16.387,20.304-23.529c4.813-4.562,11.244-9.41,13.353-16.115c1.729-5.496-0.654-10.441-2.032-15.799\n  \t\t\t\tc-1.765-6.859-2.904-13.736-4.148-20.688c-1.841-10.283-9.245-20.176-1.037-28.714c6.118-6.364,15.558-7.3,21.22-14.152\n  \t\t\t\tc7.901-9.561,16.106-20.014,15.313-33.181c-0.404-6.72-0.27-13.096,4.801-18.667c3.657-4.016,9.652-5.713,14.602-7.802\n  \t\t\t\tc12.239-5.165,24.333-8.71,37.449-10.716c9.168-1.402,19.179-2.798,28.477-2.167c5.046,0.343,4.808,0.497,8.789-1.8\n  \t\t\t\tc3.319-1.915,4.128-3.335,8.388-2.864c7.894,0.873,15.492,7.377,21.297,12.054c11.453,9.226,23.889,17.472,34.716,27.447\n  \t\t\t\tc12.287,11.321,26.448,23.808,34.31,38.68c6.554,12.398,9.318,25.573,12.339,39.153c3.922,17.629,2.021,33.91-1.034,51.293\n  \t\t\t\tc-2.457,13.979-10.379,36.018-24.999,40.887c-14.258,4.748-30.307,8.189-45.182,10.531c-12.678,1.994-26.244,2.084-38.668,5.453\n  \t\t\t\tc-8.468,2.295-17.271,6.512-25.318,10.016c-8.724,3.797-20.066,7.336-27.545,13.314c-3.141,2.512-14.598,17.664-20.335,11.25\n  \t\t\t\tc-2.449-2.736,3.183-16.027,3.232-20.01c0.164-13.102-5.66-18.283-16.653-24.186c-14.66-7.859-34.76-7.449-50.82-4.51\n  \t\t\t\tL115.703,415.027z\"/>\n  \t\t\t<g id=\"golgi\">\n  \t\t\t\t<path fill=\"#96841E\" d=\"M160.702,288.058c-1.808,0.385-5.335,3.132-6.525,4.047c-2.525,1.941-5.177,4.425-7.426,6.834\n  \t\t\t\t\tc-1.045,1.119-2.425,2.504-2.591,4.091c-0.2,1.911,1.778,5.897,2.594,7.663c1.368,2.959,2.532,5.766,4.681,8.361\n  \t\t\t\t\tc1.934,2.336,4.646,6.217,7.375,7.65c3.815,2.004,13.156-3.527,16.055-6.016c2.694-2.312,1.639-4.678,2.231-7.328\n  \t\t\t\t\tc0.418-1.875,1.792-2.613,2.747-4.24c0.927-1.58,0.549-3.861,1.56-5.188c0.372-0.487,1.297-0.314,1.84-0.891\n  \t\t\t\t\tc1.115-1.182,1.616-2.049,2.251-3.633c2.905-7.23,3.38-15.583,3.951-23.28c0.24-3.232,0.608-7.5-1.026-10.441\n  \t\t\t\t\tc-1.407-2.532-3.285-2.124-6.2-1.648c-4.621,0.753-9.075,2.371-13.388,4.149c-2.29,0.944-3.73,1.346-4.29,3.894\n  \t\t\t\t\tc-0.457,2.081-1.064,7.798,0.469,9.457c1.985,2.147,4.219-0.823,6.45,0.207c2.587,1.195,1.062,9.487-0.283,11.124\n  \t\t\t\t\tc-5.771,7.026-6.476-4.665-10.025-4.857c-0.12,0.01-0.27,0.02-0.44,0.06L160.702,288.058z\"/>\n  \t\t\t\t<path fill=\"#B2991D\" d=\"M143.902,310.789c2.868-2.447,3.764,0.223,5.192,2.572c0.762,1.254,2.526,5.357,4.165,3.352\n  \t\t\t\t\tc1.432-1.756-1.594-4.914-2.674-6.1c-1.979-2.176-3.366-2.854-2.074-5.602c1.162-2.473,3.377-4.959,5.326-6.909\n  \t\t\t\t\tc3.435-3.438,8.884-8.271,13.607-9.798c-0.131-2.515,0.199-5.636,0.466-8.201c0.278-2.677,0.475-5.337,0.595-8.075\n  \t\t\t\t\tc0.128-2.922,1.06-7.215,4.241-8.249c1.032-0.335,2.327-0.251,3.416-0.25c3.9,0.004,8.056,0.192,11.933-0.241\n  \t\t\t\t\tc4.05-0.452,8.378-0.587,12.666-0.593c1.738-0.002,3.03-0.355,4.167,0.988c2.899,3.432,1.106,10.659,0.127,14.495\n  \t\t\t\t\tc-0.663,2.6-1.52,4.483-1.583,7.142c-0.093,3.957-0.254,7.617-1.712,11.368c-2.761,7.104-5.86,13.302-11.341,18.599\n  \t\t\t\t\tc-5.459,5.275-8.979,9.859-11.999,16.768c-0.653,1.494-1.164,3.107-2.584,3.973c-1.583,0.967-2.373,0.059-3.941,0.244\n  \t\t\t\t\tc-1.966,0.236-4.46,0.947-6.719,1.1c-4.3,0.285-5.083-1.303-8.09-3.926c-2.381-2.076-4.973-3.809-7.25-6.084\n  \t\t\t\t\tc-4.12-4.08-12.87-10.68-5.97-16.57L143.902,310.789z\"/>\n  \t\t\t\t<path fill=\"#D3B32D\" d=\"M162.212,302.007c-2.769,2.223-5.355,4.637-7.968,7.238c-2.379,2.369-4.443,4.895-5.494,8.158\n  \t\t\t\t\tc-0.288,0.893-0.421,1.674-0.375,2.621c0.071,1.463,1.732,3.486,2.799,4.428c1.57,1.381,3.701,2.424,3.684,4.908\n  \t\t\t\t\tc-0.015,2.262-2.208,4.08-1.698,6.666c0.309,1.572,1.608,2.492,2.749,3.576c2.238,2.129,4.053,4.609,6.25,6.766\n  \t\t\t\t\tc3.28,3.217,7.041,5.406,11.417,3.408c4.245-1.938,6.518-6.084,8.641-10c2.196-4.051,2.459-8.084,0.883-12.432\n  \t\t\t\t\tc-2.513-6.93-10.725-10.109-13.181-16.994c-1.972-5.525,7.784-12.06,12.572-9.721c2.648,1.297,4.095,5.289,5.78,7.529\n  \t\t\t\t\tc4.143,5.512,8.366-0.334,11.963-3.451c3.527-3.058,4.115-6.208,4.609-10.704c0.094-0.853-0.012-1.778,0.026-2.632\n  \t\t\t\t\tc2.665,0.885,2.761,0.958,3.623-1.372c0.735-1.988,0-4.873,1.404-6.543c1.575-1.875,4.343-1.079,5.823-3.088\n  \t\t\t\t\tc1.062-1.441,3.131-4.962,3.128-6.811c-0.003-2.148-1.02-2.238-3.011-2.932c-3.099-1.079-5.912-2.761-8.987-3.925\n  \t\t\t\t\tc-4.693-1.777-9.307-3.785-14.121-5.227c-3.689-1.105-6.871-1.921-10.71-1.066c-1.103,0.246-1.647,0.579-2.385,1.491\n  \t\t\t\t\tc-1.499,1.853-1.725,4.123-2.101,6.403c-0.446,2.708-0.535,5.414-0.899,8.128c-0.243,1.806-0.386,3.636-0.382,5.471\n  \t\t\t\t\tc0.003,1.415,0.275,2.873,0.081,4.283c-0.18,1.301-0.335,2.138-0.157,3.509c0.191,1.475,0.104,3.417-0.446,4.815\n  \t\t\t\t\tc-2.312,0.379-5.007,1.655-7.016,2.894c-2.3,1.41-4.44,2.94-6.479,4.58L162.212,302.007z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_1_\" gradientUnits=\"userSpaceOnUse\" x1=\"-102.7822\" y1=\"337.5386\" x2=\"-96.8672\" y2=\"337.5386\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#CE9F0B\"/>\n  \t\t\t\t\t<stop  offset=\"0.1694\" style=\"stop-color:#CC9610\"/>\n  \t\t\t\t\t<stop  offset=\"0.4459\" style=\"stop-color:#C77D1E\"/>\n  \t\t\t\t\t<stop  offset=\"0.7191\" style=\"stop-color:#C15F2F\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#774721\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_1_)\" stroke=\"#FFFF00\" stroke-width=\"0.5\" d=\"M146.782,312.058c0.528-0.961,0.625-2.791-0.86-2.727\n  \t\t\t\t\tc-0.9,0.039-2.002,1.035-2.534,1.686c-1.193,1.455-2.354,3.941-2.143,5.877c0.177,1.617,1.345,2.156,2.252,0.826\n  \t\t\t\t\tc1.18-1.74,2.26-3.801,3.28-5.66L146.782,312.058z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_2_\" gradientUnits=\"userSpaceOnUse\" x1=\"-74.4521\" y1=\"346.9956\" x2=\"-61.2529\" y2=\"346.9956\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#CE9F0B\"/>\n  \t\t\t\t\t<stop  offset=\"0.1694\" style=\"stop-color:#CC9610\"/>\n  \t\t\t\t\t<stop  offset=\"0.4459\" style=\"stop-color:#C77D1E\"/>\n  \t\t\t\t\t<stop  offset=\"0.7191\" style=\"stop-color:#C15F2F\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#774721\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_2_)\" stroke=\"#FFFF00\" stroke-width=\"0.5\" d=\"M182.722,301.158c0.357-1.818-2.964-0.83-3.669-0.537\n  \t\t\t\t\tc-1.487,0.621-2.839,1.534-4.183,2.412c-1.67,1.092-3.146,2.279-4.525,3.719c-1.807,1.887-0.223,2.635,1.644,1.537\n  \t\t\t\t\tc2.969-1.744,5.792-3.756,8.662-5.631c0.57-0.359,1.94-0.75,2.08-1.5H182.722z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_3_\" gradientUnits=\"userSpaceOnUse\" x1=\"-99.6958\" y1=\"355.144\" x2=\"-81.8281\" y2=\"355.144\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#CE9F0B\"/>\n  \t\t\t\t\t<stop  offset=\"0.1694\" style=\"stop-color:#CC9610\"/>\n  \t\t\t\t\t<stop  offset=\"0.4459\" style=\"stop-color:#C77D1E\"/>\n  \t\t\t\t\t<stop  offset=\"0.7191\" style=\"stop-color:#C15F2F\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#774721\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_3_)\" stroke=\"#FFFF00\" stroke-width=\"0.5\" d=\"M157.102,289.778c-2.526,1.866-4.957,3.864-7.241,6.021\n  \t\t\t\t\tc-1.871,1.766-4.417,3.947-5.271,6.443c-0.193,0.565-0.754,3.002,0.569,2.416c0.773-0.342,1.351-1.496,1.844-2.127\n  \t\t\t\t\tc1.004-1.283,2.073-2.535,3.159-3.75c1.756-1.965,3.704-3.828,5.74-5.5c1.609-1.322,3.501-2.206,5.127-3.5\n  \t\t\t\t\tc0.847-0.674,1.835-1.51,0.467-1.869c-1.54-0.4-3.2,0.98-4.4,1.87L157.102,289.778z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_4_\" gradientUnits=\"userSpaceOnUse\" x1=\"-95.6567\" y1=\"359.8247\" x2=\"-60.5464\" y2=\"359.8247\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#CE9F0B\"/>\n  \t\t\t\t\t<stop  offset=\"0.1694\" style=\"stop-color:#CC9610\"/>\n  \t\t\t\t\t<stop  offset=\"0.4459\" style=\"stop-color:#C77D1E\"/>\n  \t\t\t\t\t<stop  offset=\"0.7191\" style=\"stop-color:#C15F2F\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#774721\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_4_)\" stroke=\"#FFFF00\" stroke-width=\"0.5\" d=\"M158.642,312.597c2.644-3.158,5.802-6.262,9.138-8.573\n  \t\t\t\t\tc2.803-1.94,6.013-3.823,9.219-4.998c0.881-0.323,1.771-0.481,2.587-0.912c0.452-0.239,1.875-0.654,2.113-1.11\n  \t\t\t\t\tc0.082-0.157-0.072-1.137-0.072-1.33c0-4.843-0.194-9.719,0.104-14.542c0.307-4.966,0.362-10.21,1.271-15.108\n  \t\t\t\t\tc0.232-1.252,0.833-3.272,0.103-4.5c-0.539-0.906-1.784-1.126-2.627-0.566c-1.717,1.141-2.434,4.442-2.753,6.326\n  \t\t\t\t\tc-0.476,2.805-0.547,5.7-0.928,8.527c-0.412,3.054-0.677,6.134-0.607,9.217c0.021,0.925,0.439,9.139-0.332,9.355\n  \t\t\t\t\tc-9.025,2.498-17.13,8.957-22.823,16.297c-1.863,2.402-4.396,5.15-4.676,8.324c-0.12,1.355,0.552,3.758,2.352,3.562\n  \t\t\t\t\tc1.768-0.191,2.741-2.904,3.566-4.162c1.065-1.621,2.27-3.205,3.481-4.725c0.29-0.381,0.59-0.74,0.89-1.1L158.642,312.597z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_5_\" gradientUnits=\"userSpaceOnUse\" x1=\"-95.5308\" y1=\"365.1841\" x2=\"-69.6079\" y2=\"365.1841\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#CE9F0B\"/>\n  \t\t\t\t\t<stop  offset=\"0.1694\" style=\"stop-color:#CC9610\"/>\n  \t\t\t\t\t<stop  offset=\"0.4459\" style=\"stop-color:#C77D1E\"/>\n  \t\t\t\t\t<stop  offset=\"0.7191\" style=\"stop-color:#C15F2F\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#774721\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_5_)\" stroke=\"#FFFF00\" stroke-width=\"0.5\" d=\"M164.282,290.428c-1.589,0.817-3.079,1.923-4.497,3.01\n  \t\t\t\t\tc-3.16,2.423-6.457,4.666-8.937,7.838c-1.12,1.433-2.592,3.335-2.35,5.282c0.171,1.379,1.283,2.311,2.503,1.475\n  \t\t\t\t\tc0.729-0.5,1.1-1.422,1.591-2.123c0.745-1.062,1.505-2.144,2.378-3.101c2.199-2.409,4.956-4.173,7.506-6.152\n  \t\t\t\t\tc1.597-1.24,3.315-2.319,5.104-3.26c1.213-0.639,2.696-1.277,3.806-2.055c0.996-0.698,0.692-3.344,0.571-4.43\n  \t\t\t\t\tc-0.243-2.182-0.062-4.299,0.165-6.477c0.274-2.642,0.607-5.293,1.128-7.906c0.364-1.828,0.752-3.692,1.094-5.495\n  \t\t\t\t\tc0.352-1.858-1.21-3.72-3.007-2.467c-1.874,1.308-2.185,4.169-2.358,6.23c-0.233,2.777-0.204,5.465-0.51,8.237\n  \t\t\t\t\tc-0.178,1.619-0.246,3.256-0.344,4.881c-0.021,0.354,0.046,4.818-0.396,4.848c-1.12,0.09-2.44,1.16-3.44,1.68L164.282,290.428z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_6_\" gradientUnits=\"userSpaceOnUse\" x1=\"-79.3501\" y1=\"375.2456\" x2=\"-77.2901\" y2=\"375.2456\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#CE9F0B\"/>\n  \t\t\t\t\t<stop  offset=\"0.1694\" style=\"stop-color:#CC9610\"/>\n  \t\t\t\t\t<stop  offset=\"0.4459\" style=\"stop-color:#C77D1E\"/>\n  \t\t\t\t\t<stop  offset=\"0.7191\" style=\"stop-color:#C15F2F\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#774721\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_6_)\" stroke=\"#FFFF00\" stroke-width=\"0.5\" d=\"M164.652,277.278c0.089,1.332-0.031,2.898,0.469,4.156\n  \t\t\t\t\tc1.053,2.651,1.444-2.727,1.497-3.505c0.142-2.077,0.125-4.111-0.125-6.152c-0.063-0.511,0.05-0.973-0.367-1.377\n  \t\t\t\t\tc-1.48-1.43-1.51,6.34-1.48,6.87L164.652,277.278z\"/>\n  \t\t\t</g>\n  \t\t\t<path fill=\"#301051\" d=\"M164.112,336.308c0.797,2.018,1.536,3.842,2.334,4.031c0.402-2.092-0.46-3.836,0.115-5.916\n  \t\t\t\tc0.896-0.5,1.611-0.244,2.209,0.59c-1.49-2.072,0.188-8.707,0.714-11.119c-0.224,0.398-0.545,0.725-0.791,1.104\n  \t\t\t\tc-0.173-3.492,3.828-7.873,6.073-10.178c1.65-1.693,3.412-3.742,5.555-4.766c2.43-1.16,4.72-2.602,7.188-3.68\n  \t\t\t\tc1.563-0.684,3.433-1.236,4.875-2.095c1.252-0.743,1.15-2.495,1.585-3.879c0.614-1.954,1.893-3.595,2.524-5.489\n  \t\t\t\tc0.731-2.193,1.59-4.349,2.772-6.351c2.216-3.754,4.69-8.005,9.412-8.281c0.025-0.33-0.103-1.102-0.26-1.42\n  \t\t\t\tc-2.576-0.809,2.604-3.896,3.361-4.595c2.664-2.458,4.697-5.52,7.5-7.948c3.828-3.316,7.337-6.264,11.626-8.999\n  \t\t\t\tc3.798-2.423,9.244-5.694,14.056-5.014c10.758,1.521,20.7,3.366,31.216,6.375c7.637,2.185,17.361,5.54,23.142,11.227\n  \t\t\t\tc2.499,2.458,4.22,4.411,7.322,6.287c3.418,2.066,6.726,4.38,9.075,7.673c4.107,5.758,5.506,12.392,6.842,19.189\n  \t\t\t\tc1.302,6.62,4.257,13.116,4.984,19.854c0.421,3.896,0.61,7.824,0.636,11.74c0.036,5.439,0.049,10.705-0.925,16.068\n  \t\t\t\tc-1.393,7.674-2.944,15.258-7.074,21.977c-8.085,13.152-19.223,21.439-32.668,28.674c-4.934,2.656-11.057,5.189-16.3,7\n  \t\t\t\tc-3.641,1.258-8.827,1.707-12.125,0.342c-1.693-0.697-0.868-1.229-3.495-1.035c-3.293,0.242-6.377,0.463-9.681,0.334\n  \t\t\t\tc-2.968-0.115-5.605-0.299-8.505-0.973c-1.409-0.328-2.265-0.992-3.877-0.607c2.543,4.75-6.646,2.355-8.1,2.023\n  \t\t\t\tc-3.576-0.812-7.594-0.422-11.35-0.992c-4.86-0.736-9.633-2.145-13.991-4.416c-8.172-4.256-15.185-11.697-20.583-18.998\n  \t\t\t\tc-9.783-13.23-15.918-28.037-19.928-43.943c-0.493-1.957-2.367-6.207-1.073-8.088c2.52-3.66,4.16,0.639,5.61,4.311L164.112,336.308\n  \t\t\t\tz\"/>\n  \t\t\t<path fill=\"#967939\" d=\"M321.841,307.029c2.193,4.855,7.609,18.682,15.28,14.574c5.762-3.082,4.896-11.387,2.718-16.193\n  \t\t\t\tc-2.737-6.046-4.434-13.864-8.538-19.327c-2.665-3.547-6.855-7.184-11.474-7.285c-5.829-0.129-10.834,5.072-10.579,10.846\n  \t\t\t\tc0.241,5.46,5.105,6.846,8.485,10.391c1.58,1.659,2.85,4.219,4.1,6.99L321.841,307.029z\"/>\n  \t\t\t<path fill=\"none\" stroke=\"#3ACFE8\" d=\"M156.882,374.738c-7.029,2.73-13.979,7.615-20.403,11.568\n  \t\t\t\tc-5.45,3.354-11.133,6.201-16.462,9.746c-6.681,4.443-13.448,8.859-20.293,12.982c-5.658,3.408-11.716,6.992-16.552,11.523\n  \t\t\t\tc-1.607,1.504-4.203,2.93-4.246,5.355c1.393,0.348,2.284-1.025,3.236-1.834c2.321-1.973,4.766-3.922,7.317-5.607\n  \t\t\t\tc4.813-3.18,9.67-6.354,14.477-9.736c6.703-4.721,14.324-8.381,21.721-11.848c11.97-5.611,25.759-13.383,37.549-16.748\n  \t\t\t\t M91.835,305.698c15.139,2.681,28.742,8.847,42,16.001 M227.172,176.359c-4.448,25.768-23.607,49.727-40,69.333 M151.482,358.527\n  \t\t\t\tc-3.354,1.816-5.981,4.801-8.864,7.271c-10.205,8.742-20.072,17.934-30.542,26.322c-5.1,4.086-9.965,8.162-15.33,11.93\n  \t\t\t\tc-2.789,1.957-5.663,3.709-8.252,5.908c-1.787,1.518-3.574,2.721-5.656,3.764c-1.506,0.754-3.472,2.516-5.096,2.561\n  \t\t\t\tc0.882-2.852,4.662-3.865,6.983-5.146c3.201-1.766,6.49-4.176,9.258-6.562c2.99-2.58,6.157-4.953,9.152-7.512\n  \t\t\t\tc6.241-5.332,12.239-10.857,18.278-16.445c7.451-6.896,13.637-15.248,19.794-23.277c1.601-2.088,2.694-4.352,4.108-6.562\n  \t\t\t\tc1.156-1.809,2.753-3.398,3.581-5.402 M83.836,298.358c6.244,1.791,13.146,1.194,19.479,2.948c5.831,1.613,11.294,3.921,17.2,5.234\n  \t\t\t\tc6.209,1.381,11.796,3.982,17.987,5.816 M173.172,494.357c13.208-27.949,27.371-53.156,49.333-75.332 M77.836,431.697\n  \t\t\t\tc21.59-21.312,51.195-32.004,77.332-45.334 M173.172,485.027c7.485-13.037,13.292-27.416,20.632-40.537\n  \t\t\t\tc5.005-8.947,11.156-17.422,16.701-26.129 M97.169,419.697c13.542-9.047,29.781-14.869,44.695-21.365\n  \t\t\t\tc6.214-2.707,12.8-5.473,19.305-7.301 M207.172,236.358c5.503-8.815,8.097-19.725,12-29.333c3.367-8.288,6.358-16.96,10-25.333\n  \t\t\t\t M225.832,156.359c7.894,9.888,11.229,22.429,10.232,34.811c-1.16,14.419,3.912,28.947,2.434,43.188 M171.832,480.357\n  \t\t\t\tc3.784-11.098,8.508-21.576,13.331-32.15c4.367-9.574,5.329-22.633,11.335-31.182 M171.582,393.927\n  \t\t\t\tc0.086-0.082,0.185-0.146,0.295-0.188c-2.92,0.383-5.702,1.564-8.586,2.258c-7.296,1.752-14.477,4.385-21.581,6.787\n  \t\t\t\tc-5.401,1.826-10.937,3.188-16.136,5.547c-1.162,0.527-4.713,1.521-5.008,2.926c2.491,0.082,5.516-1.221,7.916-1.871\n  \t\t\t\tc5.147-1.396,10.188-2.877,15.454-3.713c5.097-0.809,10.256-1.412,15.269-2.676c5.191-1.307,10.824-1.234,15.966-2.633\n  \t\t\t\t M116.502,317.029c5.974,5.383,15.923,13.143,23.333,15.998 M112.502,307.699c5.125,1.281,16.733,9.855,20.667,8.666\n  \t\t\t\t M113.833,298.358c4.931,2.202,16.803,8.642,21.333,6.667 M229.832,194.359c-3.837,14.092-8.935,30.777-9.333,45.333\n  \t\t\t\t M241.832,193.029c-0.487,10.349,1.35,21.16,1.965,31.5c0.316,5.308-0.364,12.741,1.368,17.834 M249.171,185.029\n  \t\t\t\tc8.034,13.754,8.15,29.957,13.333,44.831c1.975,5.667,3.445,11.464,5.333,17.169 M183.172,438.357\n  \t\t\t\tc3.691-6.609,1.325-15.807,4-22.666 M187.832,451.027c4.854-8.549,6.793-19.451,11.333-27.332 M85.23,408.337\n  \t\t\t\tc0.683-0.57,1.372-1.137,2.065-1.693c2.367-1.908,4.936-3.533,7.373-5.346c2.423-1.801,4.38-4.131,6.464-6.32\n  \t\t\t\tc4.006-4.213,7.907-8.58,12.489-12.188c7.331-5.771,13.045-13.611,19.016-20.697c3.115-3.697,5.185-7.928,7.804-11.969\n  \t\t\t\tc1.892-2.92,3.815-5.91,5.398-8.975 M247.171,191.699c2.75,9.101,4.533,18.537,6.501,27.835c1.602,7.569,2.321,18.087,6.165,24.832\n  \t\t\t\t M261.832,195.029c2.493,7.981,4.82,16.12,7.987,23.85c2.544,6.21,7.667,12.912,8.68,19.484 M127.833,301.028\n  \t\t\t\tc3.602,2.334,8.589,1.31,12.667,1.333 M192.502,466.357c8.142-11.473,18.185-21.424,26.665-32.531\n  \t\t\t\tc3.559-4.66,7.328-9.215,11.335-13.469 M133.833,410.357c9.234-2.209,18.913-3.498,28.385-4.033\n  \t\t\t\tc6.537-0.371,13.222,0.703,19.615,0.033 M158.992,370.517c-3.065-0.039-7.983,3.773-10.77,5.389\n  \t\t\t\tc-8.75,5.074-17.386,10.072-25.868,15.611c-7.503,4.9-14.694,10.342-22.354,14.973c-4.398,2.658-9.235,4.879-13.422,7.9\n  \t\t\t\tc-1.989,1.434-4.058,2.752-5.985,4.281c-1.526,1.211-3.5,3.785-5.44,3.965c0.174-1.484,2.181-2.576,3.303-3.479\n  \t\t\t\tc2.545-2.045,5.343-3.686,7.964-5.598c3.151-2.303,6.237-4.74,9.544-6.812c7.066-4.43,12.964-10.053,19.574-15.139\n  \t\t\t\tc6.507-5.006,13.441-9.457,19.961-14.516c3.305-2.562,6.806-5.178,9.867-8.033c1.82-1.697,3.348-3.594,5.341-4.932\n  \t\t\t\tc2.503-1.682,5.385-3.674,7.581-5.826 M231.172,202.358c-2.851,9.944-2.262,22.313-3.497,32.699\n  \t\t\t\tc-0.645,5.421-2.146,10.659-3.17,15.968 M173.832,251.028c6.936-5.737,13.844-14.352,19.368-21.333\n  \t\t\t\tc6.406-8.096,13.969-16.716,18.632-26 M267.171,198.359c1.452,7.36,7.131,14.563,9.852,21.703\n  \t\t\t\tc2.135,5.601,4.902,10.873,7.333,16.332c4.081,9.164,9.044,16.798,15.482,24.632 M321.831,431.697\n  \t\t\t\tc8.681-16.299,11.085-35.463,19.333-52\"/>\n  \t\t\t<path fill=\"#042C44\" d=\"M249.122,428.126\"/>\n  \t\t\t<path fill=\"#042C44\" d=\"M341.691,397.238\"/>\n  \t\t\t<ellipse fill=\"#EA9206\" cx=\"237.981\" cy=\"330.178\" rx=\"45.237\" ry=\"45.001\"/>\n  \t\t\t<path fill=\"#301051\" d=\"M250.832,284.098c1.91,2.458,4.619,4.726,6.233,7.359c1.542,2.515,1.8,5.634,3.351,8.242\n  \t\t\t\tc3.54,5.948,13.412,0.744,18.081,3.983c1.986,1.38,0.871,6.101,1.003,8.608c0.18,3.393-0.288,6.604-0.31,9.941\n  \t\t\t\tc-1.68-0.561-2.566,0.568-4.007,0.824c-1.318,0.236-3.271-0.008-4.505-0.074c-1.919,3.326-1.583,9.877-1.844,13.715\n  \t\t\t\tc-0.185,2.717-0.525,5.281-0.91,7.945c-0.29,2,0.109,4.176-0.804,6.061c-1.714,3.535-6.392,4.736-9.871,5.58\n  \t\t\t\tc-6.691,1.623-13.608,2.264-20.49,2.666c-3.74,0.219-7.117,0.229-10.6-1.178c-3.071-1.238-5.638-2.613-8.992-2.822\n  \t\t\t\tc-2.955-0.184-4.421,0.283-5.676,2.738c-0.762,1.49-2.581,5.812-3.99,1.668c-0.884-2.604,1.805-5.291,0.35-7.406\n  \t\t\t\tc-1.252-1.82-5.349-3.076-7.269-4.01c-2.287-1.109-4.634-1.789-6.822-3.168c-2.178-1.371-3.749-3.002-5.26-5.082\n  \t\t\t\tc-1.032-1.42-2.315-6.641-3.408-7.258c-3.944-2.229-3.952,16.939-3.933,18.592c0.108,9.445,2.073,25.816,10.334,31.967\n  \t\t\t\tc2.921,2.176,8.039,4.594,11.756,4.723c6.009,0.211,12.355-0.729,18.252-0.107c7.72,0.814,16.332,0.678,24.014-0.566\n  \t\t\t\tc10.474-1.693,22.444-3.725,31.64-9.016c2.896-1.666,5.811-2.496,8.92-3.65c11.07-4.107,16.507-12.562,20.211-23.35\n  \t\t\t\tc3.363-9.797,1.878-20.273,2.204-30.434c0.252-7.865,1.433-15.928-1.068-23.581c-1.654-5.062-4.473-8.952-7.347-13.327\n  \t\t\t\tc-2.07-3.151-3.897-6.944-6.821-9.35c-3.332-2.742-7.428-4.691-11.104-6.901c-2.984-1.794-5.935-3.655-8.985-5.167\n  \t\t\t\tc-2.863-1.419-5.75-2.68-8.742-0.922c-3.356,1.971-5.708,4.506-9.25,6.089c-3.205,1.432-10.548,5.365-9.933,9.592\n  \t\t\t\tc0.41,2.67,4.04,5.07,5.61,7.09L250.832,284.098z\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"304.101\" cy=\"389.687\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"312.071\" cy=\"377.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"187.122\" cy=\"301.417\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"270.171\" cy=\"398.697\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"296.831\" cy=\"389.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"254.001\" cy=\"402.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"236.422\" cy=\"403.107\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"299.571\" cy=\"383.527\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"257.671\" cy=\"405.197\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<ellipse fill=\"#2B2B2B\" cx=\"284.331\" cy=\"395.527\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t<path fill=\"#967939\" d=\"M221.222,260.048c1.403-11.43-13.552-6.911-18.542-3.343c-4.963,3.549-8.542,8.949-9.962,14.874\n  \t\t\t\tc-0.837,3.494-1.171,7.204-0.167,10.702c0.432,1.504,1.07,3.042,2.154,4.199c1.245,1.329,2.298,1.368,4.021,1.277\n  \t\t\t\tc-0.033,0.002,1.906-2.864,2.247-3.172c1.155-1.044,2.267-2.168,3.657-2.902c0.514-0.271,1.064-0.512,1.688-0.434\n  \t\t\t\tc1.061,0.132,2.386,2.851,3.4,1.899c0.802-0.752-0.139-1.634-0.625-2.218c-1.949-2.342,0.244-4.3,1.687-6.278\n  \t\t\t\tc1.952-2.675,4.094-5.26,6.444-7.594c2.01-2.01,3.64-4.11,3.99-7.02L221.222,260.048z\"/>\n  \t\t\t<g>\n  \t\t\t\t<path fill=\"#00542B\" d=\"M286.991,387.917c-1.584-2.014,1.969-9.32,0.506-12.219c-1.143-2.262-5.137-1.996-6.999-0.926\n  \t\t\t\t\tc-2.945,1.689-2.009,3.799-1.666,6.592c1.008,8.186-0.896,18.25-9.391,21.74c-7.417,3.045-14.427,1.506-21.985,0.16\n  \t\t\t\t\tc-5.255-0.936-13.165-2.141-17.532,1.85c-4.771,4.359,0.588,14.584,3.566,18.584c0.95,1.275,5.735,6.713,7.03,3.332\n  \t\t\t\t\tc0.77-2.008-4.265-7.695-5.105-9.584c-1.553-3.488-2.583-7.131,1.491-9.432c3.476-1.963,8.245,0.131,11.593,1.35\n  \t\t\t\t\tc3.792,1.379,8.885,4.082,10.016,8.334c0.368,1.383-0.921,5.725-0.047,6.43c2.186,1.764,5.821-3.346,6.297-4.854\n  \t\t\t\t\tc0.709-2.25,0.012-4.852,0.977-6.984c1.904-4.209,7.26-6.26,11.097-8.252c4.873-2.525,7.721-7.211,12.327-10.088\n  \t\t\t\t\tc1.732-1.082,3.938-1.971,4.934,0.414c0.839,2.01-1.106,3.428-0.883,5.283c2.078,0.295,3.347,1.297,4.958,2.35\n  \t\t\t\t\tc2.103-4.176,3.079-10.604,0.285-14.633c4.659-4.705,16.971-3.27,23.004-3.717c-0.498-2.99-5.652-4.664-8.199-4.951\n  \t\t\t\t\tc-5.637-0.635-12.759,0.58-17.805,3.258c-3.019,1.604-5.532,4.16-8.209,6.209c-0.12-0.08-0.2-0.158-0.28-0.25L286.991,387.917z\"/>\n  \t\t\t\t<path fill=\"#00362B\" d=\"M298.551,401.376c-6.75-0.52-11.561-5.965-5.716-11.359c1.262-1.164,5.39-3.16,4.939-5.242\n  \t\t\t\t\tc-0.46-2.123-4.977-1.539-6.607-1.414c-2.021,0.154-5.609,0.604-7.267,2.082c-1.473,1.314-2.016,3.467-3.669,4.666\n  \t\t\t\t\tc-5.145,3.73-14.358-4.705-20.399-4.186c-4.254,0.363-7.383,2.211-11.052,4.119c-2.443,1.271-5.456,1.781-7.022,4.303\n  \t\t\t\t\tc-0.446,0.719-2.584,7.914-2.866,7.973c1.694-0.359,4.558,0.178,6.557,0.584c0.028-2.854,2.367-5.752,5.385-4.551\n  \t\t\t\t\tc5.623,2.242,2.041,10.709,0.43,14.465c-0.628,1.465-1.907,5.688-4.213,4.811c-1.92-0.729-1.706-5.053-1.551-6.6\n  \t\t\t\t\tc0.202-2.023,0.701-2.797-1.667-3.602c-0.73-0.248-4.287-0.422-4.765,0.17c-1.02,1.262,1.461,8.332,1.43,10.438\n  \t\t\t\t\tc-0.038,2.543-2.363,7.57-1.364,9.627c2.673-0.709,6.431,0.758,8.975,1.322c0.878-5.529,4.372-8.799,7.139-13.281\n  \t\t\t\t\tc2.133-3.455,5.089-8.104,4.874-12.311c-0.107-2.1-3.433-6.721,0.377-7.104c1.598-0.162,1.962,1.676,3.674,1.412\n  \t\t\t\t\tc2.64-0.41,1.536-4.863,5.252-2.607c4.355,2.643-0.205,11.854-1.202,15.523c0.091,0.088,0.181,0.178,0.27,0.268\n  \t\t\t\t\tc3.274-1.73,3.45-2.145,4.755-5.846c1.086-3.08,2.418-5.553,5.905-5.039c4.452,0.656,9.037,3.664,13.302,5.148\n  \t\t\t\t\tc9.407,3.277,19.446,4.619,28.75,0.236c6.817-3.211,10.806-10.715,9.026-18.141c-0.735-3.066-2.201-6.191-5.134-7.602\n  \t\t\t\t\tc-1.983-0.953-6.362-1.994-7.883,0.301c1.965,2.174,4.289,2.264,5.589,5.119c1.286,2.824,1.529,6.086,0.076,8.895\n  \t\t\t\t\tc-1.939,3.748-6.733,8.361-11.338,7.678c1.206-5.191,3.731-12.562,2.571-17.889c-1.6-0.105-3.298-0.104-4.898-0.002\n  \t\t\t\t\tc-0.15,6.689-1.53,18.359-10.66,17.65L298.551,401.376z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_7_\" gradientUnits=\"userSpaceOnUse\" x1=\"35.0908\" y1=\"277.1216\" x2=\"42.3408\" y2=\"273.6216\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_7_)\" stroke=\"#FFFF00\" d=\"M286.501,374.527c-2.47-0.758-8.197-0.713-7.911,2.916\n  \t\t\t\t\tc3.285,1.527,6.521,1.535,9.335-1.039c-0.844-1.826-2.934-2.391-4.924-1.877\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_8_\" gradientUnits=\"userSpaceOnUse\" x1=\"6.5903\" y1=\"265.7798\" x2=\"15.0895\" y2=\"258.0306\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_8_)\" stroke=\"#FFFF00\" d=\"M260.562,386.648c-0.421-0.107-1.066-1.043-2.001-1.207\n  \t\t\t\t\tc-1.201-0.213-2.979,0.623-4.06,1.051c-1.543,0.609-2.841,1.391-4.227,2.318c-1.135,0.762-2.121,1.924-3.31,2.568\n  \t\t\t\t\tc-0.229,0.123-3.56,1.521-3.349,1.596c3.429,1.168,12.461,1.967,15.521-0.359c-1.75-1.947-6.905,0.492-7.94-1.936\n  \t\t\t\t\tc0.765-0.438,10.627-2.248,10.602-1.934c-0.215,2.643,6.04-0.211,5.321-1.648c-0.59-1.191-5.58-0.201-6.55-0.451L260.562,386.648z\n  \t\t\t\t\t\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_9_\" gradientUnits=\"userSpaceOnUse\" x1=\"40.9238\" y1=\"267.0078\" x2=\"49.4137\" y2=\"262.6779\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_9_)\" stroke=\"#FFFF00\" d=\"M289.461,387.417c-0.304,1.588-6.186,2.373-2.623,3.609\n  \t\t\t\t\tc2.151,0.746,5.057-1.383,6.658-2.416c2.095-1.354,5.194-3.363,1.668-4.574c-2.452-0.842-5.834-0.846-8.273,0.041\n  \t\t\t\t\tc-7.06,2.561,2.57,3.27,2.56,3.34H289.461z\"/>\n  \t\t\t\t<path fill=\"#46C16F\" d=\"M299.161,413.677c4.25-0.68,8.705-0.314,12.678-2.234c3.68-1.777,5.711-5.721,7.667-9.172\n  \t\t\t\t\tc1.512-2.67,2.93-6.059,5.401-7.91c2.315-1.736,6.792-4.162,1.673-5.748c-2.873-0.891-8.103-0.271-10.43,1.738\n  \t\t\t\t\tc-2.437,2.104-3.515,5.729-5.959,8.008c-1.633,1.523-6.537,4.873-7.032,0.693c-0.4-3.383,4.073-6.809,3.964-10.301\n  \t\t\t\t\tc-9.986-4.109-10.487,8.057-13.031,13.926c-1.89,4.357-3.595,7.549-8.675,6.023c-1.634-0.49-4.882-1.311-5.833-2.756\n  \t\t\t\t\tc-2.28-3.465,2.112-10.967-2.076-13.01c-0.993-0.484-2.894-0.979-4.007-0.584c-2.1,0.746-1.245,0.807-0.902,2.676\n  \t\t\t\t\tc0.312,1.697,2.534,5.934,0.251,6.674c-2.008,0.648-4.182-2.514-5.749-3.268c-2.315-1.113-5.794-0.996-7.944,0.594\n  \t\t\t\t\tc-3.372,2.492,1.063,2.645,3.278,4.084c4.06,2.631,9.608,6.488,9.073,11.916c-0.313,3.176-2.542,4.479-5.667,4.332\n  \t\t\t\t\tc-4.151-0.195-6.158-3.193-9.333-5.268c-2.238-1.463-5.237-2.73-7.919-3.084c-1.81-0.236-8.336-0.137-9.18,1.992\n  \t\t\t\t\tc-1.232,3.115,4.944,2.576,6.449,3.008c2.912,0.84,5.767,3.451,8.242,5.094c3.123,2.068,6.81,5.207,10.75,5.523\n  \t\t\t\t\tc3.923,0.316,8.928-2.643,11.323-5.523c2.018-2.43,2.595-6.004,6-6.416c5.147-0.619,9.269,1.133,14.376-0.42\n  \t\t\t\t\tc0.85-0.23,1.72-0.422,2.61-0.561L299.161,413.677z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_10_\" gradientUnits=\"userSpaceOnUse\" x1=\"-3.48\" y1=\"237.7358\" x2=\"3.27\" y2=\"238.4858\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_10_)\" stroke=\"#FFFF00\" d=\"M248.501,411.697c-0.93-0.291-10.213-0.396-8.948,2.352\n  \t\t\t\t\tc1.253,2.723,12.231-0.471,8.615-2.018\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_11_\" gradientUnits=\"userSpaceOnUse\" x1=\"14.4902\" y1=\"251.3936\" x2=\"23.2402\" y2=\"251.1436\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_11_)\" stroke=\"#FFFF00\" d=\"M266.501,398.357c-2.732-0.908-7.293,0.203-9.232,2.352\n  \t\t\t\t\tc1.75,1.357,5.513,0.203,7.767,0.373c-0.082,1.906,3.544,1.564,4.506,0.609c-0.793-1.045-2.531-2.637-3.707-3\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_12_\" gradientUnits=\"userSpaceOnUse\" x1=\"25.8672\" y1=\"275.0024\" x2=\"33.5383\" y2=\"252.9993\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_12_)\" stroke=\"#FFFF00\" d=\"M277.501,392.697c-1.757-0.578-3.838-0.604-5.299,0.65\n  \t\t\t\t\tc0.396,2.35,6.366,1.961,7.296,0.426c-0.708-0.355-1.538-0.516-2.331-0.41\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_13_\" gradientUnits=\"userSpaceOnUse\" x1=\"51.0596\" y1=\"283.7871\" x2=\"58.7283\" y2=\"261.7807\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_13_)\" stroke=\"#FFFF00\" d=\"M304.831,389.027c-1.782-0.723-4.304-0.143-5.963,0.732\n  \t\t\t\t\tc-0.122,0.199-0.125,0.404-0.009,0.617c2.058,0.893,6.472,1.209,7.928-0.934c-0.488-0.465-0.969-0.451-1.623-0.416\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_14_\" gradientUnits=\"userSpaceOnUse\" x1=\"68.2686\" y1=\"289.7739\" x2=\"75.9286\" y2=\"267.7739\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_14_)\" stroke=\"#FFFF00\" d=\"M327.171,389.357c-1.495-0.365-11.277-1.781-10.696,1.684\n  \t\t\t\t\tc0.364,2.168,10.58,1.076,11.935-0.342c-0.332-0.645-0.879-0.891-1.572-1.008\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_15_\" gradientUnits=\"userSpaceOnUse\" x1=\"56.9067\" y1=\"271.436\" x2=\"71.2659\" y2=\"270.8261\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#006B33\"/>\n  \t\t\t\t\t<stop  offset=\"0.1611\" style=\"stop-color:#00622F\"/>\n  \t\t\t\t\t<stop  offset=\"0.4252\" style=\"stop-color:#004923\"/>\n  \t\t\t\t\t<stop  offset=\"0.7572\" style=\"stop-color:#002210\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_15_)\" stroke=\"#FFFF00\" d=\"M314.431,382.027c5.888-0.748,1.228-3.385-2.142-3.582\n  \t\t\t\t\tc-3.844-0.225-7.77,0.811-11.399,1.973C300.86,382.968,312.06,382.328,314.431,382.027L314.431,382.027z\"/>\n  \t\t\t</g>\n  \t\t\t<path fill=\"#F4A45B\" d=\"M132.452,296.528c10.003-6.937,23.95-14.141,27.211-26.979c2.951-11.613,1.042-21.915,2.17-33.333\n  \t\t\t\tc0.708-7.168,6.227-6.801,12.15-9.299c9.974-4.206,20.633-11.884,31.847-11.899c17.989-0.025,52.922,15.775,62.636-9.071\n  \t\t\t\tc7.896,5.469,14.996,8.679,20.845,16.449c3.304,4.39,5.145,9.575,8.605,13.254c4.884,5.191,12.666,8.979,18.063,14.05\n  \t\t\t\tc6.201,5.826,11.881,12.767,16.552,19.963c7.998,12.32,15.415,25.141,18.798,39.536c5.229,22.252,9.11,52.795,0.353,74.5\n  \t\t\t\tc-4.293,10.643-4.689,16.049-16.017,17.498c-9.252,1.184-17.76,2.203-27.819,3.668c-11.721,1.707-26.918,0.277-36.685,7.502\n  \t\t\t\tc-6.93,5.125-16.118,10.393-21.965,16.582c-6.328-1.711-15.642-2.844-21.468,0.17c-10.302,5.326-19.061,14.037-29.293,19.773\n  \t\t\t\tc-2.516,1.41-9.247,6.971-12.116,5c-2.485-1.705-1.16-8.967-1.153-11.512c0.013-4.744-0.255-8.285-2.167-12.645\n  \t\t\t\tc-2.729-6.223-7.196-10.596-11.166-16.023c-5.461-7.469-8.391-9.59-17.516-11.314c-10.353-1.959-18.671-1.912-29.166,1.781\n  \t\t\t\tc-4.318,1.518-27.762,11.219-30.548,5.533c-2.153-4.393,13.017-17.766,15.751-20.666c6.17-6.545,12.436-13.115,18.92-19.352\n  \t\t\t\tc7.149-6.875,8.976-16.006,4.723-24.777c-6.84-14.131-18.06-36.92-1.53-48.38L132.452,296.528z M100.062,404.537\n  \t\t\t\tc-0.812,1.104-2.433,3.336-2.263,4.752c0.303,2.521,3.141,1.576,4.763,1.293c4.125-0.721,7.787-1.287,11.694-2.994\n  \t\t\t\tc2.048-0.895,4.332-1.117,6.46-1.912c2.52-0.941,4.95-2.139,7.552-2.852c6.425-1.76,12.007-3.23,18.708-2.91\n  \t\t\t\tc4.771,0.23,9.609,0.514,14.24,1.77c2.168,0.588,4.316,1.295,6.074,2.719c1.759,1.424,2.419,3.33,3.709,5.125\n  \t\t\t\tc2.006,2.791,3.982,5.629,5.993,8.438c3.094,4.32,7.904,8.545,9.77,13.562c1.907,5.129,1.244,11.168,0.994,16.498\n  \t\t\t\tc-0.101,2.145-0.27,4.346,2.39,4.215c4.012-0.197,8.501-5.494,11.759-7.537c2.478-1.553,4.756-3.248,7.193-4.768\n  \t\t\t\tc4.73-2.951,8.827-6.904,13.741-9.658c4.051-2.27,8.806-3.32,13.316-3.602c3.932-0.244,9.634-0.293,12.967,1.447\n  \t\t\t\tc0.133,0.119,0.125,0.125-0.025,0.018c-0.771-4.764,11.657-13.557,15.127-15.402c8.482-4.514,18.241-6.641,27.781-7.188\n  \t\t\t\tc6.553-0.373,13.558-1.938,20.123-2.996c5.907-0.953,11.834-1.768,17.74-2.727c3.721-0.604,9.182,0.668,11.831-2.592\n  \t\t\t\tc0.374,0.369,1.148,0.434,1.431,0.729c-1.763-1.846,0.054-2.645,1.115-4.266c2.341-3.574,3.176-8.658,4.583-12.688\n  \t\t\t\tc1.788-5.121,2.676-10.582,2.678-16.004c0.002-8.191,0.882-16.273,0.487-24.525c-0.542-11.344-2.985-22.057-6.531-32.758\n  \t\t\t\tc-1.51-4.557-3.522-8.998-5.719-13.253c-4.068-7.877-8.41-15.577-12.806-23.276c-4.871-8.531-11.175-16.995-18.877-23.114\n  \t\t\t\tc-3.319-2.637-7.066-5.472-10.75-7.5c-3.749-2.064-6.739-4.946-9.624-8.252c-3.535-4.05-6.202-8.822-9.612-12.999\n  \t\t\t\tc-1.449-1.775-5.308-6.945-8.013-6.248c-1.392,0.358-1.542,1.625-2.35,2.743c-3.28,4.539-8.733,5.496-13.947,6.446\n  \t\t\t\tc-5.792,1.055-11.721,1.23-17.564,0.504c-2.918-0.362-5.87-0.981-8.677-1.569c-1.818-0.381-3.709-0.306-5.524-0.73\n  \t\t\t\tc-2.124-0.497-4.291-1.682-6.507-1.635c-5.69,0.122-11.486-0.282-17.003,1.276c-5.143,1.453-9.055,4.916-13.982,6.797\n  \t\t\t\tc-4.51,1.723-9.395,2.426-14,4.124c-9.468,3.492-7.659,13.5-7.803,21.735c-0.181,10.341,1.522,20.465-6.166,28.984\n  \t\t\t\tc-4.355,4.826-9.375,8.837-14.536,12.712c-10.428,7.829-19.923,12.731-16.599,27.86c2.701,12.293,17.446,27.33,13,40.236\n  \t\t\t\tc-2.217,6.438-7.641,11.188-12.579,15.715c-3.153,2.895-6.493,5.637-9.631,8.559c-4.826,4.49-9.793,9.654-13.963,14.875\n  \t\t\t\tc-0.74,0.941-1.46,1.881-2.15,2.82L100.062,404.537z\"/>\n  \t\t\t\n  \t\t\t\t<radialGradient id=\"SVGID_16_\" cx=\"97.3701\" cy=\"316.23\" r=\"7.9057\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\" gradientUnits=\"userSpaceOnUse\">\n  \t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FFBF00\"/>\n  \t\t\t\t<stop  offset=\"0.4326\" style=\"stop-color:#C57B00\"/>\n  \t\t\t\t<stop  offset=\"1\" style=\"stop-color:#8F0000\"/>\n  \t\t\t</radialGradient>\n  \t\t\t<ellipse fill=\"url(#SVGID_16_)\" cx=\"343.121\" cy=\"336.698\" rx=\"4.25\" ry=\"4.499\"/>\n  \t\t\t\n  \t\t\t\t<radialGradient id=\"SVGID_17_\" cx=\"-46.25\" cy=\"414.9097\" r=\"7.9057\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\" gradientUnits=\"userSpaceOnUse\">\n  \t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FFBF00\"/>\n  \t\t\t\t<stop  offset=\"0.4326\" style=\"stop-color:#C57B00\"/>\n  \t\t\t\t<stop  offset=\"1\" style=\"stop-color:#8F0000\"/>\n  \t\t\t</radialGradient>\n  \t\t\t<ellipse fill=\"url(#SVGID_17_)\" cx=\"199.502\" cy=\"238.028\" rx=\"4.25\" ry=\"4.5\"/>\n  \t\t\t\n  \t\t\t\t<radialGradient id=\"SVGID_18_\" cx=\"90.75\" cy=\"297.4106\" r=\"7.9057\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\" gradientUnits=\"userSpaceOnUse\">\n  \t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FFBF00\"/>\n  \t\t\t\t<stop  offset=\"0.4326\" style=\"stop-color:#C57B00\"/>\n  \t\t\t\t<stop  offset=\"1\" style=\"stop-color:#8F0000\"/>\n  \t\t\t</radialGradient>\n  \t\t\t<ellipse fill=\"url(#SVGID_18_)\" cx=\"336.501\" cy=\"355.527\" rx=\"4.25\" ry=\"4.5\"/>\n  \t\t\t\n  \t\t\t\t<radialGradient id=\"SVGID_19_\" cx=\"2.4902\" cy=\"420.4097\" r=\"7.9057\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\" gradientUnits=\"userSpaceOnUse\">\n  \t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FFBF00\"/>\n  \t\t\t\t<stop  offset=\"0.4326\" style=\"stop-color:#C57B00\"/>\n  \t\t\t\t<stop  offset=\"1\" style=\"stop-color:#8F0000\"/>\n  \t\t\t</radialGradient>\n  \t\t\t<ellipse fill=\"url(#SVGID_19_)\" cx=\"248.242\" cy=\"232.528\" rx=\"4.25\" ry=\"4.5\"/>\n  \t\t\t\n  \t\t\t\t<radialGradient id=\"SVGID_20_\" cx=\"-40\" cy=\"411.4097\" r=\"7.9057\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\" gradientUnits=\"userSpaceOnUse\">\n  \t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FFBF00\"/>\n  \t\t\t\t<stop  offset=\"0.4326\" style=\"stop-color:#C57B00\"/>\n  \t\t\t\t<stop  offset=\"1\" style=\"stop-color:#8F0000\"/>\n  \t\t\t</radialGradient>\n  \t\t\t<ellipse fill=\"url(#SVGID_20_)\" cx=\"205.752\" cy=\"241.528\" rx=\"4.25\" ry=\"4.5\"/>\n  \t\t\t\n  \t\t\t\t<radialGradient id=\"SVGID_21_\" cx=\"-34.7402\" cy=\"234.6709\" r=\"7.9052\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\" gradientUnits=\"userSpaceOnUse\">\n  \t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FFBF00\"/>\n  \t\t\t\t<stop  offset=\"0.4326\" style=\"stop-color:#C57B00\"/>\n  \t\t\t\t<stop  offset=\"1\" style=\"stop-color:#8F0000\"/>\n  \t\t\t</radialGradient>\n  \t\t\t<ellipse fill=\"url(#SVGID_21_)\" cx=\"211.002\" cy=\"418.267\" rx=\"4.25\" ry=\"4.5\"/>\n  \t\t\t\n  \t\t\t\t<radialGradient id=\"SVGID_22_\" cx=\"-92.75\" cy=\"300.4106\" r=\"7.9057\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\" gradientUnits=\"userSpaceOnUse\">\n  \t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FFBF00\"/>\n  \t\t\t\t<stop  offset=\"0.4326\" style=\"stop-color:#C57B00\"/>\n  \t\t\t\t<stop  offset=\"1\" style=\"stop-color:#8F0000\"/>\n  \t\t\t</radialGradient>\n  \t\t\t<ellipse fill=\"url(#SVGID_22_)\" cx=\"153.002\" cy=\"352.527\" rx=\"4.25\" ry=\"4.5\"/>\n  \t\t\t<path fill=\"#301051\" d=\"M253.532,247.178c10.666,0.912,18.914,6.34,27.104,12.57c1.605,1.221,2.858,2.901,4.454,4.075\n  \t\t\t\tc1.593,1.171,2.721,2.706,3.963,4.221c0.314,0.383,0.585,0.808,0.905,1.185c0.324,0.382,0.515,0.349,0.929,0.596\n  \t\t\t\tc0.631,0.376,1.003,1.128,1.442,1.69c0.919,1.18,1.828,2.322,2.466,3.681c1.042,2.216,2.34,4.419,3.171,6.721\n  \t\t\t\tc0.301,0.833,0.712,1.415,1.175,2.169c0.63,1.028,1.076,2.17,1.479,3.302c1.093,3.071,1.616,6.298,2.027,9.521\n  \t\t\t\tc0.104,0.821,0.167,1.656,0.304,2.471c0.089,0.535,0.325,1.013,0.422,1.545c0.254,1.387,0.454,2.753,1.157,4.005\n  \t\t\t\tc0.66,1.177,2.069,2.415,3.526,2.144c0.354-0.066,0.694-0.189,1.053-0.32c0.768-0.281,1.493-0.666,2.214-1.047\n  \t\t\t\tc0.46-0.244,0.869-0.793,1.381-0.912c0.327,0.463,0.267,1.572,0.357,2.16c0.148,0.959,0.326,1.932,0.507,2.865\n  \t\t\t\tc0.266,1.377,0.507,2.762,0.853,4.135c0.195,0.773,0.409,1.561,0.658,2.322c0.327,0.994,0.744,2.701,2.096,2.35\n  \t\t\t\tc1.029-0.268,2.005-0.965,3.011-1.172c0.116,1.803,0.484,3.498,0.68,5.285c0.149,1.363,0.248,2.723,0.562,4.072\n  \t\t\t\tc0.169,0.729,0.401,1.441,0.539,2.18c0.121,0.643,0.093,1.307,0.327,1.92c0.326,0.855,0.852,1.672,1.829,1.695\n  \t\t\t\tc1.21,0.029,2.365-0.252,3.298-1.006c0.456,0.41,1.12,4.959,0.826,5.074c5.174-2.012,7.856-6.365,8.267-12.09\n  \t\t\t\tc0.843-11.754-0.357-25.534-7.383-35.419c-2.34-3.293-4.924-6.409-7.17-9.77c-3.939-5.896-9.751-11.466-14.601-16.667\n  \t\t\t\tc-5.308-5.693-10.543-10.527-17.091-14.748c-8.169-5.266-16.403-10.593-26.049-12.675c-0.863-0.186-1.717-0.345-2.559-0.59\n  \t\t\t\tc-0.785-0.229-1.661-0.1-2.469-0.026c-1.819,0.165-3.675,0.521-5.321,1.34c-0.71,0.354-1.779,0.773-2.299,1.394\n  \t\t\t\tc-0.493,0.588,0.339,0.989,0.709,1.352c0.421,0.413,0.729,0.909,1.194,1.282c0.977,0.783,2.237,1.187,3.437,1.479\n  \t\t\t\tc0.5,0.122,1.41,0.053,1.742,0.517c-3.158,0.241-6.372-0.072-9.51,0.457c-0.981,0.165-2.006,0.5-2.899,0.937\n  \t\t\t\tc-0.604,0.294-0.994,0.69-1.299,1.305c-0.468,0.941-0.746,2.162,0.539,2.448c1.222,0.272,2.5-0.035,3.727-0.097\n  \t\t\t\tc1.47-0.04,2.91-0.01,4.32,0.11L253.532,247.178z\"/>\n  \t\t\t<g id=\"floaty_x5F_bits\">\n  \t\t\t\t<g>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"165.492\" cy=\"366.527\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"168.492\" cy=\"310.558\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"181.512\" cy=\"325.539\" rx=\"1.168\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"173.412\" cy=\"319.308\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"167.412\" cy=\"321.138\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"170.162\" cy=\"357.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"260.172\" cy=\"388.857\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"242.172\" cy=\"387.857\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#666666\" cx=\"250.672\" cy=\"390.857\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3575 -0.9339 0.9339 0.3575 -116.8694 446.1812)\" fill=\"#666666\" cx=\"265.855\" cy=\"308.033\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3572 -0.934 0.934 0.3572 -96.0204 490.7058)\" fill=\"#666666\" cx=\"308.508\" cy=\"315.116\" rx=\"1.001\" ry=\"1.165\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3575 -0.9339 0.9339 0.3575 -144.0874 535.4483)\" fill=\"#666666\" cx=\"317.127\" cy=\"372.449\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.4919 -0.8706 0.8706 -0.4919 146.7155 742.5739)\" fill=\"#666666\" cx=\"290.027\" cy=\"328.478\" rx=\"1.001\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.4919 -0.8706 0.8706 -0.4919 139.6596 683.8313)\" fill=\"#666666\" cx=\"269.359\" cy=\"301.166\" rx=\"1.001\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3573 -0.934 0.934 0.3573 -74.2245 405.0237)\" fill=\"#666666\" cx=\"257.182\" cy=\"256.444\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3569 -0.9341 0.9341 0.3569 -40.514 430.2306)\" fill=\"#666666\" cx=\"292.229\" cy=\"244.542\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.8065 0.5913 -0.5913 -0.8065 669.222 318.305)\" fill=\"#666666\" cx=\"282.516\" cy=\"268.68\" rx=\"1.001\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.8065 0.5912 -0.5912 -0.8065 577.8707 312.2422)\" fill=\"#666666\" cx=\"237.842\" cy=\"250.681\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.8484 -0.5294 0.5294 0.8484 -85.9603 186.7482)\" fill=\"#666666\" cx=\"283.01\" cy=\"243.428\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.8483 -0.5295 0.5295 0.8483 -89.4972 149.688)\" fill=\"#666666\" cx=\"216.498\" cy=\"231.041\" rx=\"1.001\" ry=\"1.167\"/>\n  \t\t\t\t</g>\n  \t\t\t\t<g>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"291.002\" cy=\"370.027\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"288.002\" cy=\"377.027\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"223.832\" cy=\"391.697\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"237.172\" cy=\"379.357\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"180.172\" cy=\"371.357\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"221.832\" cy=\"400.697\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"246.172\" cy=\"400.357\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"218.822\" cy=\"385.367\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"156.502\" cy=\"345.527\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"161.652\" cy=\"351.248\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"282.172\" cy=\"381.027\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"235.892\" cy=\"368.228\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"196.422\" cy=\"358.947\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"214.252\" cy=\"279.278\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"193.502\" cy=\"367.697\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"225.332\" cy=\"367.527\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"157.252\" cy=\"336.777\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"273.002\" cy=\"377.027\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"275.502\" cy=\"383.527\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"269.672\" cy=\"387.527\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"191.832\" cy=\"419.347\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"205.172\" cy=\"407.017\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"186.822\" cy=\"413.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"129.652\" cy=\"378.908\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"170.492\" cy=\"395.738\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"152.622\" cy=\"391.308\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"193.332\" cy=\"395.187\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"138.672\" cy=\"326.027\" rx=\"1.168\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"202.962\" cy=\"428.818\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"133.662\" cy=\"319.708\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"325.501\" cy=\"362.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"340.421\" cy=\"364.787\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"337.501\" cy=\"373.527\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse fill=\"#3F3F3F\" cx=\"140.172\" cy=\"301.858\" rx=\"1.168\" ry=\"1\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3575 -0.9339 0.9339 0.3575 -96.3612 533.5353)\" fill=\"#3F3F3F\" cx=\"339.6\" cy=\"336.804\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3575 -0.9339 0.9339 0.3575 -98.3271 522.3651)\" fill=\"#3F3F3F\" cx=\"330.498\" cy=\"332.648\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.0395 -0.9992 0.9992 -0.0395 30.265 659.1844)\" fill=\"#3F3F3F\" cx=\"331.947\" cy=\"315.046\" rx=\"1.001\" ry=\"1.165\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3569 -0.9341 0.9341 0.3569 -70.8188 416.6509)\" fill=\"#3F3F3F\" cx=\"267.213\" cy=\"259.763\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.0391 -0.9992 0.9992 -0.0391 7.0084 685.772)\" fill=\"#3F3F3F\" cx=\"333.245\" cy=\"339.516\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.0396 -0.9992 0.9992 -0.0396 23.0336 676.8282)\" fill=\"#3F3F3F\" cx=\"336.798\" cy=\"327.344\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.8066 0.5911 -0.5911 -0.8066 620.9839 301.6716)\" fill=\"#3F3F3F\" cx=\"261.145\" cy=\"252.416\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.8065 0.5912 -0.5912 -0.8065 780.95 356.5874)\" fill=\"#3F3F3F\" cx=\"332.125\" cy=\"306.084\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.8066 0.5911 -0.5911 -0.8066 743.4888 352.4073)\" fill=\"#3F3F3F\" cx=\"314.098\" cy=\"297.823\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.8066 0.5911 -0.5911 -0.8066 677.7376 399.7458)\" fill=\"#3F3F3F\" cx=\"273.468\" cy=\"310.754\" rx=\"0.999\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3574 -0.934 0.934 0.3574 -68.3124 442.5216)\" fill=\"#3F3F3F\" cx=\"287.414\" cy=\"270.902\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.8066 0.5911 -0.5911 -0.8066 664.073 309.8362)\" fill=\"#3F3F3F\" cx=\"281.354\" cy=\"263.547\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(-0.6108 -0.7918 0.7918 -0.6108 299.7673 685.5835)\" fill=\"#3F3F3F\" cx=\"318.371\" cy=\"269.122\" rx=\"1\" ry=\"1.165\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3569 -0.9341 0.9341 0.3569 -113.2331 347.3808)\" fill=\"#3F3F3F\" cx=\"195.694\" cy=\"255.934\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3574 -0.934 0.934 0.3574 -116.61 335.7432)\" fill=\"#3F3F3F\" cx=\"185.672\" cy=\"252.609\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.8482 -0.5297 0.5297 0.8482 -101.273 139.9608)\" fill=\"#3F3F3F\" cx=\"193.538\" cy=\"246.66\" rx=\"1.001\" ry=\"1.168\"/>\n  \t\t\t\t</g>\n  \t\t\t\t<g>\n  \t\t\t\t\t<ellipse cx=\"329.001\" cy=\"348.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"320.501\" cy=\"345.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"287.502\" cy=\"389.027\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"300.001\" cy=\"398.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"164.612\" cy=\"359.318\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"285.502\" cy=\"396.527\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"249.172\" cy=\"411.027\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"222.572\" cy=\"407.027\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"186.502\" cy=\"403.527\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"312.001\" cy=\"389.498\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"196.502\" cy=\"393.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"174.162\" cy=\"374.138\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"186.002\" cy=\"389.498\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"210.572\" cy=\"402.957\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"275.002\" cy=\"395.527\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"273.002\" cy=\"403.027\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"146.202\" cy=\"371.298\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse cx=\"328.461\" cy=\"370.087\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t<ellipse transform=\"matrix(0.6033 -0.7975 0.7975 0.6033 -137.6582 408.9124)\" cx=\"342.188\" cy=\"342.823\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t<ellipse transform=\"matrix(-0.9002 -0.4355 0.4355 -0.9002 486.6154 673.244)\" cx=\"320.449\" cy=\"280.865\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t<ellipse transform=\"matrix(-0.9001 -0.4357 0.4357 -0.9001 498.2609 708.9236)\" cx=\"330.4\" cy=\"297.342\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t<ellipse transform=\"matrix(-0.8063 0.5914 -0.5914 -0.8063 675.4257 390.1939)\" cx=\"273.833\" cy=\"305.674\" rx=\"1\" ry=\"1.165\"/>\n  \t\t\t\t\t<ellipse transform=\"matrix(-0.9861 0.1662 -0.1662 -0.9861 651.901 456.6907)\" cx=\"306.84\" cy=\"255.625\" rx=\"1\" ry=\"1.167\"/>\n  \t\t\t\t\t<ellipse transform=\"matrix(0.3569 -0.9341 0.9341 0.3569 -129.17 332.3513)\" cx=\"176.809\" cy=\"259.995\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t<ellipse transform=\"matrix(0.3569 -0.9341 0.9341 0.3569 -110.1673 313.2073)\" cx=\"172.406\" cy=\"236.621\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t<ellipse transform=\"matrix(0.8481 -0.5299 0.5299 0.8481 -96.5937 158.3484)\" cx=\"227.821\" cy=\"247.608\" rx=\"1.001\" ry=\"1.167\"/>\n  \t\t\t\t</g>\n  \t\t\t\t<g>\n  \t\t\t\t\t<ellipse fill=\"#8C8C8C\" cx=\"257.672\" cy=\"378.857\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3574 -0.934 0.934 0.3574 -127.6844 317.9586)\" fill=\"#8C8C8C\" cx=\"167.211\" cy=\"251.765\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.3574 -0.934 0.934 0.3574 -94.9156 347.9759)\" fill=\"#8C8C8C\" cx=\"205.408\" cy=\"242.961\" rx=\"1\" ry=\"1.166\"/>\n  \t\t\t\t\t\n  \t\t\t\t\t\t<ellipse transform=\"matrix(0.8482 -0.5297 0.5297 0.8482 -101.6232 156.8899)\" fill=\"#8C8C8C\" cx=\"222.87\" cy=\"255.719\" rx=\"1.001\" ry=\"1.167\"/>\n  \t\t\t\t</g>\n  \t\t\t\t<g>\n  \t\t\t\t\t<g>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"166.053\" cy=\"374.968\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"163.442\" cy=\"374.728\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"164.492\" cy=\"376.888\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t</g>\n  \t\t\t\t\t<g>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"347.061\" cy=\"348.607\" rx=\"1.168\" ry=\"1\"/>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"344.461\" cy=\"348.378\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"345.501\" cy=\"350.527\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t</g>\n  \t\t\t\t\t<g>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"186.062\" cy=\"234.608\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"183.462\" cy=\"234.378\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"184.502\" cy=\"236.528\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t</g>\n  \t\t\t\t\t<g>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"176.732\" cy=\"404.107\" rx=\"1.166\" ry=\"1\"/>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"174.122\" cy=\"403.876\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t\t<ellipse stroke=\"#8F0000\" stroke-width=\"0.5\" cx=\"175.172\" cy=\"406.027\" rx=\"1.167\" ry=\"1\"/>\n  \t\t\t\t\t</g>\n  \t\t\t\t</g>\n  \t\t\t</g>\n  \t\t\t<path fill=\"#D1800B\" d=\"M252.932,296.518c5.306,5.694,8.444,13.108,11.312,20.192c2.384,5.891,3.863,12.172,4.516,18.488\n  \t\t\t\tc0.338,3.271,0.449,6.572,0.259,9.857c-0.134,2.32,0.303,5.439-0.193,7.611c-4.678-2.873-9.179-6.572-13.643-9.582\n  \t\t\t\tc-2.521-1.701-5.782-3.361-8.549-4.625c-4.478-2.045-7.937-5.391-12.514-7.381c-1.776-0.773-4.975-1.412-5.415-3.672\n  \t\t\t\tc-0.463-2.377,1.494-6.596,2.081-8.926c0.744-2.951,2.617-5.592,3.608-8.467c1.368-3.973,2.458-8.031,3.675-12.05\n  \t\t\t\tc0.753-2.487,0.971-9.382,3.879-9.281c3.89,0.13,8.52,5.2,10.97,7.82L252.932,296.518z\"/>\n  \t\t\t<path opacity=\"0.4\" fill=\"#13597C\" d=\"M156.452,281.928c7.688-8.519,5.985-18.643,6.166-28.984\n  \t\t\t\tc0.144-8.234-1.665-18.243,7.803-21.735c4.604-1.698,9.489-2.401,14-4.124c4.928-1.881,8.839-5.344,13.982-6.797\n  \t\t\t\tc5.518-1.559,11.313-1.155,17.003-1.276c2.217-0.047,4.384,1.138,6.507,1.635c1.815,0.425,3.707,0.349,5.524,0.73\n  \t\t\t\tc2.808,0.588,5.759,1.207,8.677,1.569c5.843,0.726,11.772,0.55,17.564-0.504c5.213-0.95,10.667-1.907,13.947-6.446\n  \t\t\t\tc0.808-1.118,0.958-2.385,2.35-2.743c2.705-0.697,6.562,4.473,8.013,6.248c3.411,4.177,6.077,8.949,9.612,12.999\n  \t\t\t\tc2.885,3.306,5.875,6.188,9.624,8.252c3.684,2.028,7.431,4.863,10.75,7.5c7.702,6.119,14.006,14.583,18.877,23.114\n  \t\t\t\tc4.396,7.7,8.738,15.399,12.806,23.276c2.197,4.255,4.209,8.695,5.719,13.254c3.546,10.699,5.988,21.414,6.531,32.756\n  \t\t\t\tc0.395,8.252-0.485,16.334-0.487,24.527c-0.001,5.422-0.89,10.881-2.678,16.004c-1.407,4.027-4.241,12.111-6.583,15.688\n  \t\t\t\tL156.459,281.911L156.452,281.928z\"/>\n  \t\t\t<path fill=\"none\" stroke=\"#D08BEA\" d=\"M199.482,373.978c-3.099-1.105-6.17-2.439-8.979-3.947\n  \t\t\t\tc-10.65-5.713-22.173-15.855-27.82-26.615c-0.972-1.854-5.451-12.117-1.855-12.324c2.718-0.154,3.839,5.273,4.665,6.914\n  \t\t\t\tc1.596,3.17,3.143,6.516,5.333,9.352c4.32,5.592,9.496,9.809,15.269,13.75c1.524,1.039,5.363,4.152,6.989,2.186\n  \t\t\t\tc2.874-3.479-9.666-11.035-11.766-13.283c-1.61-1.725-3.305-5.016-5.73-5.602c-1.451,1.885,1.492,4.277,2.881,5.291\n  \t\t\t\tc-1.979,3.035-10.786-9.883-11.391-12.357c-0.806-3.295,1.146-3.082,2.842-0.648c1.237,1.773,2.447,5.152,5.198,4.615\n  \t\t\t\tc0.016-1.992-2.396-3.072-1.898-5.23c1.348-0.188,2.333,0.465,3.266,1.342c1.735,1.631,9.77,12.846,12.041,10.207\n  \t\t\t\tc1.273-1.48-4.49-5.998-5.357-7.27c-2.323-3.398-4.309-7.279-5-11.312c-0.265-1.547-0.622-3.406-0.35-5.02\n  \t\t\t\tc0.251-1.492,1.46-2.627,1.775-3.99c0.446-1.934,0.099-2.555-2.099-1.674c-2.204,0.883-2.725,4.01-3.251,5.998\n  \t\t\t\tc-0.334,1.262-0.437,2.797-0.082,4c0.319,1.08,1.824,2.156,1.422,3.082c-1.351,3.119-4.811-1.174-5.339-2.805\n  \t\t\t\tc-2.563-7.92,5.446-15.656,11.575-19.277c2.825-1.668,5.919-2.672,8.87-4.064c2.403-1.136,3.072-2.295,3.779-4.769\n  \t\t\t\tc1.055-3.694,2.582-7.071,3.965-10.64c1.005-2.594,2.617-4.988,4.842-6.638c0.881-0.654,3.95-2.915,3.264-0.1\n  \t\t\t\tc-0.234,0.959-2.244,4.134-0.008,3.787c1.706-0.265,7.799-8.109,5.849-8.917c-0.963-0.399-2.553,1.817-3.358,0.761\n  \t\t\t\tc-0.638-0.836,1.322-2.857,1.731-3.412c2.322-3.151,5.059-5.897,7.774-8.685c6.318-6.486,13.866-11.748,22.957-13.245\n  \t\t\t\tc1.322-0.218,7.886-1.238,8.042,1.572c0.101,1.828-5.664,1.801-7.014,2.101c-4.237,0.941-8.593,2.374-12.351,4.575\n  \t\t\t\tc-3.412,1.999-16.382,10.5-13.266,15.95c2.726,0.405,5.984-4.07,8.176-5.6c2.452-1.71,7.012-3.224,8.648-5.766\n  \t\t\t\tc-1.72-1.499-3.874,0.968-5.846,0.707c0.527-2.636,6.556-4.704,8.896-5.614c2.552-0.993,5.932-1.729,8.714-1.278\n  \t\t\t\tc-1.288-0.209-8.534,4.412-7.626,6.377c0.506,1.092,3.969,0.42,4.962,0.557c2.021,0.285,3.584,0.765,5.434,1.665\n  \t\t\t\tc2.386,1.161,10.252,6.575,8.932,0.601c-0.473-2.138-2.62-4.304-4.425-5.525c-0.949-0.642-4.978-1.593-4.956-3.075\n  \t\t\t\tc0.036-2.448,8.99,1.241,10.015,1.677c19.186,8.161,26.47,27.701,26.684,47.421c0.087,8.027-1.076,15.322-2.335,23.203\n  \t\t\t\tc-0.808,5.057-1.709,10.096-2.591,15.139c-0.34,1.943-0.384,5.174-3.016,5.191c-0.661-1.291-0.354-3.221-0.393-4.619\n  \t\t\t\tc-0.092-3.342-0.073-6.326,0.587-9.682c1.651-8.393,2.924-16.73,3.088-25.32c0.129-6.754,0.246-14.498-2-20.944\n  \t\t\t\tc-1.802-5.169-6.06-9.525-10.007-13.156c-1.457-1.34-3.704-3.517-5.926-2.91c-2.789,0.762-1.127,1.895,0.512,3.251\n  \t\t\t\tc1.811,1.499,14.761,11.298,11.004,14.689c-2.788,2.516-10.415-7.877-11.667-9.283c-5.603-6.293-14.437-12.753-23.183-12.646\n  \t\t\t\tc-2.235,0.027-6.585,0.413-8.173,2.331c-1.521,1.838-0.297,1.533,1.431,1.333c3.665-0.424,6.382-1.797,10.325-1.081\n  \t\t\t\tc5.896,1.071,10.938,5.135,14.599,9.764c3.073,3.886,8.947,11.23,6.341,16.624c-3.211-1.475-4.85-7.455-6.599-10.389\n  \t\t\t\tc-1.945-3.264-3.619-5.888-6.741-8.159c-5.527-4.021-14.025-1.748-20.016,0.648c-6.949,2.779-10.687,9.965-13.835,16.351\n  \t\t\t\tc-1.25,2.535-2.172,5.161-3.074,7.842c-0.511,1.521-0.699,4.072-2.34,3.064c-2.216-1.359-0.529-7.207-0.085-8.99\n  \t\t\t\tc1.325-5.316,3.553-10.24,7.083-14.424c2.459-2.915,5.978-4.404,8.291-7.333c-4.041-4.629-13.098,7.958-14.698,10.702\n  \t\t\t\tc-0.679,1.164-6.077,10.252-6.602,5.047c-0.228-2.256,2.765-5.388,3.317-7.615c-5.621-0.626-7.438,8.863-8.551,12.622\n  \t\t\t\tc-0.917,3.099-1.075,4.546-3.824,5.903c-3.086,1.523-5.346,3.701-8.187,5.27c-1.202,0.662-5.937,1.164-4.17,3.578\n  \t\t\t\tc0.978,1.336,2.737,0.037,3.765-0.51c3.775-1.998,7.059-4.268,11.268-5.508c1.83-0.541,4.355-1.721,5.313,0.592\n  \t\t\t\tc0.762,1.844-0.754,2.484-2.224,3.262c-4.078,2.154-9.977,1.793-13.032,5.416c-4.743,5.625-4.371,13.312-1,19.322\n  \t\t\t\tc1.399,2.496,3.478,4.375,5.741,5.908c4.811,3.262,11.035,4.27,15.566,7.74c-0.952,5.289-13.289-3.689-15.636-2.34\n  \t\t\t\tc-1.485,0.854,5.913,6.566,7.135,7.297c4.336,2.59,9.243,4.379,14.11,5.66c2.939,0.775,9.449,1.941,12.04-0.348\n  \t\t\t\tc-2.029-1.982-6.723-1.949-9.625-2.668c-2.152-0.533-7.899-2.828-3.073-4.605c3.721-1.371,8.415,1.568,11.741,2.688\n  \t\t\t\tc7.441,2.502,16.106,1.41,23.673,0.094c4.127-0.717,17.739-2.211,19-8.076c0.764-3.553-0.37-8.562,0.01-12.352\n  \t\t\t\tc0.305-3.031,0.363-6.291,1.065-9.266c0.5-2.119,1.754-3.852,2.25-5.965c3.645,2.854,1.621,9.197,1.083,12.916\n  \t\t\t\tc-0.858,5.928-1.221,12.025-1.741,17.996c-0.389,4.469-3.17,4.604-7.426,5.652c-5.179,1.277-10.636,1.678-15.833,1.658\n  \t\t\t\tc-2.865-0.01-19.724-0.811-19.422,2.693c0.275,3.189,8.254,3.033,10.234,3.238c4.038,0.422,15.472,0.701,18.42-2.516\n  \t\t\t\tc-1.367-0.729-2.89-0.637-4.28-1.158c3.367-2.502,10.287-0.717,14.381-1.65c3.766-0.855,7.409-1.979,10.852-3.684\n  \t\t\t\tc3.902-1.93,4.629-6.137,5.757-10.309c0.388-1.438,1.039-15.691,4.667-14.631c3.386,0.99-2.121,17.119-2.683,19.355\n  \t\t\t\tc-0.583,2.318-1.175,5.223-2.352,7.334c-1.21,2.172-2.791,2.174-5.582,2.916c-5.125,1.363-11.186,0.906-16.091,2.74\n  \t\t\t\tc-1.07,0.4-2.738,0.898-2.656,2.342c0.148,2.609,5.258,0.713,6.665,0.426c6.247-1.275,14.156-2.223,19.765-5.426\n  \t\t\t\tc4.938-2.818,3.042-7.811,4.567-12.676c4.438-14.164,9.387-29.156,5.433-43.988c-0.301-1.129-0.569-4.538-2.433-3.941\n  \t\t\t\tc-1.77,0.565-0.284,6.848-0.292,7.934c-0.028,4.117-0.193,8.221-1.708,12.016c-0.938,2.348-1.48,4.242-2.909,1.35\n  \t\t\t\tc-2.054-4.158,0.038-11.938,0.259-16.438c0.301-6.129-1.325-11.63-3.351-17.333c-1.443-4.064-2.37-8.01-3.899-11.994\n  \t\t\t\tc-0.597-1.555-1.422-4.762,1.316-4.306c3.361,0.56,4.604,9.227,5.274,11.653c0.29,1.048,2.245,10.559,4.757,8.758\n  \t\t\t\tc2.632-1.887-3.939-11.964-1.454-13.313c3.51-1.906,6.64,13.807,7.005,15.292c2.54,10.329,4.427,20.499,4.025,31.239\n  \t\t\t\tc-0.39,10.424-1.825,18.996-5.356,28.838c-0.949,2.646-1.305,6.156-2.669,8.576c-0.849,1.506-1.191,1.611-2.993,2.41\n  \t\t\t\tc-11.461,5.082-24.135,7.174-36.583,7.844c-5.905,0.316-12.162,0.623-18.017,0.148c-6.488-0.525-12.924-3.406-19.056-5.398\n  \t\t\t\tc-3.155-1.027-6.329-2.008-9.549-2.812c-1.773-0.443-9.213-3.686-9.404-0.238c-0.103,1.857,3.548,3.072,4.797,3.578\n  \t\t\t\tc4.809,1.945,10.069,2.961,15.157,3.889c1.667,0.303,7.955,1.053,8.605,3.24c1.979,6.66-20.986-0.506-22.948-1.076\n  \t\t\t\tc-1.27-0.33-2.61-0.76-3.95-1.24L199.482,373.978z\"/>\n  \t\t\t<path fill=\"#D19D37\" d=\"M196.562,284.748c0.053-0.03,0.107-0.062,0.161-0.095c2.559-1.593,3.412-4.317,4.775-6.848\n  \t\t\t\tc2.344-4.352,4.514-8.195,8.656-11.158c1.321-0.945,2.653-1.779,3.723-2.997c2.088-2.379,3.214-5.845,2.999-9.012\n  \t\t\t\tc-0.263-3.865-7.738-2.583-9.925-1.7c-6.591,2.662-12.33,10.253-14.458,16.859c-1.129,3.504-1.507,7.437-0.705,11.056\n  \t\t\t\tc0.49,2.28,2.16,5.35,4.76,3.89L196.562,284.748z\"/>\n  \t\t\t<g>\n  \t\t\t\t<g>\n  \t\t\t\t\t<path fill=\"#967939\" d=\"M202.072,400.238c2.624,0.193,5.22-0.088,7.425-1.361c5.218-3.01,6.285-10.822,1.341-14.428\n  \t\t\t\t\t\tc-3.336-2.432-6.442-2.838-10.497-3.086c-7.589-0.467-12.381-3.051-18.125-8.061c-3.252-2.836-9.151-3.617-11.733,0.52\n  \t\t\t\t\t\tc-2.031,3.254-0.846,9.658,1.119,12.781c4.506,7.164,14.818,9.914,22.461,12.021c2.41,0.68,5.22,1.42,8,1.619L202.072,400.238z\"\n  \t\t\t\t\t\t/>\n  \t\t\t\t\t<path fill=\"#D19D37\" d=\"M202.362,395.818c1.338,0.174,2.686,0.27,4.032,0.27c2.816,0.004,6.96-0.111,7.534-3.658\n  \t\t\t\t\t\tc0.487-3.014-0.583-6.156-3.084-7.98c-3.336-2.432-6.443-2.838-10.497-3.086c-7.589-0.465-12.382-3.051-18.125-8.061\n  \t\t\t\t\t\tc-2.116-1.846-5.272-2.838-8.039-2.145c-3.105,0.777-5.072,3.904-4.069,7.055c2.482,7.781,11.699,11.496,18.614,14.162\n  \t\t\t\t\t\tc2.388,0.922,4.89,1.391,7.352,2.102c2.05,0.6,4.16,1.08,6.29,1.35L202.362,395.818z\"/>\n  \t\t\t\t\t<path fill=\"#F4C571\" d=\"M202.512,393.417c0.516,0.074,1.029,0.143,1.541,0.203c2.59,0.312,6.046,0.594,8.345-0.902\n  \t\t\t\t\t\tc3.187-2.076,0.606-6.506-1.688-8.197c-3.323-2.449-6.427-2.873-10.48-3.146c-6.619-0.441-13.146-3.285-18.101-7.691\n  \t\t\t\t\t\tc-2.34-2.08-4.698-3.465-8.004-2.656c-2.481,0.605-3.583,2.877-3.479,5.283c0.111,2.602,2.289,5.021,4.178,6.643\n  \t\t\t\t\t\tc2.153,1.846,4.697,3.125,7.246,4.328c6.33,3.01,13.49,5.15,20.43,6.15L202.512,393.417z\"/>\n  \t\t\t\t\t<path fill=\"#8B5C29\" d=\"M188.982,383.718c-0.219,0.271-0.395,0.508-0.487,0.602c-0.797,0.822-1.375,1.805-2.321,2.51\n  \t\t\t\t\t\tc-0.988,0.74-1.813,0.635-3.019,0.18c-0.747-0.283-5.375-2.516-4.701-3.402c0.857-1.127,2.343-1.588,3.43-2.578\n  \t\t\t\t\t\tc0.449-0.41,0.726-1.232-0.263-1.113c-0.465,0.059-1.051,0.443-1.417,0.693c-0.968,0.662-2.419,1.973-3.742,1.459\n  \t\t\t\t\t\tc-0.532-0.205-1.232-0.633-1.123-1.223c0.123-0.658,1.129-0.342,1.23-0.984c-0.777-0.371-1.214,0.24-1.964,0.229\n  \t\t\t\t\t\tc-0.56-0.012-1.013-0.445-1.303-0.891c-1.083-1.664,4.923-1.896,5.618-2.646c0.401-0.434,0.032-0.488-0.605-0.461\n  \t\t\t\t\t\tc-0.941,0.041-1.94,0.316-2.87,0.443c-0.662,0.092-1.28,0.312-1.952,0.365c-0.27,0.021-0.692,0.1-1.06,0.111\n  \t\t\t\t\t\tc-0.19,0.004-0.366-0.008-0.499-0.055c-0.882-0.309-0.698-1.545-0.648-2.162c0.042-0.51,0.235-0.877,0.533-1.287\n  \t\t\t\t\t\tc0.747-1.027,1.947-1.658,3.33-1.816c1.351-0.154,2.909-0.039,4.149,0.639c1.93,1.055-0.857,1.215-1.801,1.412\n  \t\t\t\t\t\tc-0.847,0.178-3.575,0.133-3.906,0.947c0.822,0.428,2.506,0.029,3.313-0.076c1.1-0.145,2.215-0.244,3.302-0.324\n  \t\t\t\t\t\tc1.849-0.137,2.611,0.938,4.022,1.951c-0.375,0.518-1.681,0.828-2.309,1.039c-0.661,0.223-2.764,0.514-2.854,1.26\n  \t\t\t\t\t\tc1.287,0.572,3.72-0.766,4.91-1.107c1.069-0.305,1.604-0.359,2.724,0.115c0.663,0.279,1.243,0.75,1.88,1.08\n  \t\t\t\t\t\tc0.515,0.268,1.238,0.393,0.998,0.982c-0.237,0.586-1.734,1.055-2.302,1.32c-0.436,0.205-1.429,0.77-1.871,0.281\n  \t\t\t\t\t\tc0.176-0.24,0.499-0.357,0.678-0.602c-0.422-0.223-0.939-0.076-1.339,0.064c-0.254,0.086-1.229,0.502-1.311,0.744\n  \t\t\t\t\t\tc-0.237,0.727,1.131,0.236,1.602,0.387c-0.189,0.461-0.9,0.77-1.12,1.229c1.169,0.275,2.306-0.537,3.237-0.996\n  \t\t\t\t\t\tc0.927-0.457,1.696-0.938,2.531-1.48c0.505-0.326,1.417-0.439,2.017-0.199c0.084,0.033,0.29,0.279,0.437,0.342\n  \t\t\t\t\t\tc0.361,0.154,0.76,0.18,1.143,0.256c0.634,0.127,1.338,0.203,1.939,0.445c-0.056,0.391-0.357,0.68-0.547,1.02\n  \t\t\t\t\t\tc-0.367,0.662-0.721,1.367-1.033,2.055c-0.226,0.498-0.389,1.037-0.375,1.604c0.009,0.357-0.242,0.594,0.297,0.449\n  \t\t\t\t\t\tc0.401-0.105,0.723-0.99,0.915-1.281c0.325-0.488,0.577-0.98,0.833-1.506c0.3-0.605,0.781-1.33,0.73-2.043\n  \t\t\t\t\t\tc1.003,0.406,2.063,0.336,3.096,0.377c0.619,0.023,2.1,0.072,2.361,0.771c0.388,1.047-1.106,2.523,0.196,3.426\n  \t\t\t\t\t\tc0.677-0.588,0.191-1.445,0.296-2.182c0.066-0.471,0.475-1.316,1.049-1.412c0.687-0.113,1.617,0.24,2.298,0.387\n  \t\t\t\t\t\tc0.464,0.102,1.054,0.096,1.485,0.268c0.664,0.266,0.548,0.957,0.732,1.455c0.257,0.697,0.56,1.357,0.775,2.074\n  \t\t\t\t\t\tc0.024,0.082,0.375-0.293,0.389-0.318c0.144-0.23,0.081-0.461,0.074-0.715c-0.019-0.684-0.271-1.359-0.268-2.045\n  \t\t\t\t\t\tc1.278,0.172,2.675,2.41,3.348,3.289c0.991,1.297,1.461,2.869,0.778,4.275c-0.252,0.52-1.698,2.004-2.133,1.049\n  \t\t\t\t\t\tc-0.237-0.52,0.301-4.539-0.464-4.662c-0.897-0.145-0.645,3.721-0.698,4.256c-0.12,1.24-1.39,1.402-2.698,1.447\n  \t\t\t\t\t\tc-0.547,0.018-1.687,0.174-2.08-0.248c-0.355-0.381-0.251-1.273-0.23-1.686c0.077-1.504,0.398-3.215,0.061-4.725\n  \t\t\t\t\t\tc-0.838,0.428-1.102,2.762-1.192,3.631c-0.058,0.553,0.055,1.838-0.703,2.119c-0.514,0.191-2.004-0.291-2.568-0.396\n  \t\t\t\t\t\tc-0.967-0.18-1.917-0.443-2.86-0.725c-0.464-0.139-1.258-0.258-1.653-0.576c-0.46-0.369-0.26-0.549,0.025-0.982\n  \t\t\t\t\t\tc0.489-0.75,1.204-1.518,1.59-2.281c0.151-0.299,0.729-2.045,0.289-2.328c-0.595-0.383-3.154,5.01-3.878,5.227\n  \t\t\t\t\t\tc-0.581,0.172-1.652-0.201-2.25-0.34c-1.099-0.254-2.517-0.748-3.401-1.424c-1.506-1.15,1.417-3.359,2.194-4.242\n  \t\t\t\t\t\tc0.267-0.301,1.593-1.594,0.833-1.957c-0.58-0.26-1.35,0.592-1.87,1.221L188.982,383.718z\"/>\n  \t\t\t\t</g>\n  \t\t\t\t<g>\n  \t\t\t\t\t<path fill=\"#967939\" d=\"M321.521,333.527c-0.535-2.574-1.52-4.994-3.349-6.766c-4.329-4.188-12.134-3.068-14.241,2.676\n  \t\t\t\t\t\tc-1.421,3.877-0.958,6.977-0.083,10.941c1.638,7.426,0.469,12.744-2.769,19.643c-1.833,3.906-0.963,9.793,3.725,11.139\n  \t\t\t\t\t\tc3.687,1.059,9.519-1.842,11.981-4.588c5.65-6.303,5.46-16.973,5.386-24.9c-0.03-2.5-0.09-5.41-0.65-8.139V333.527z\"/>\n  \t\t\t\t\t<path fill=\"#D19D37\" d=\"M317.191,334.468c-0.201-1.336-0.479-2.658-0.847-3.951c-0.772-2.709-2.021-6.662-5.59-6.238\n  \t\t\t\t\t\tc-3.03,0.359-5.758,2.252-6.824,5.158c-1.421,3.875-0.958,6.975-0.083,10.941c1.638,7.424,0.469,12.742-2.769,19.641\n  \t\t\t\t\t\tc-1.193,2.541-1.28,5.85,0.147,8.318c1.602,2.771,5.149,3.805,7.9,1.975c6.801-4.525,7.839-14.408,8.503-21.791\n  \t\t\t\t\t\tc0.229-2.549-0.007-5.084,0-7.645c0-2.121-0.13-4.281-0.44-6.4L317.191,334.468z\"/>\n  \t\t\t\t\t<path fill=\"#F4C571\" d=\"M314.831,334.978c-0.07-0.518-0.146-1.027-0.228-1.539c-0.412-2.574-1.091-5.977-3.162-7.773\n  \t\t\t\t\t\tc-2.872-2.494-6.421,1.205-7.417,3.875c-1.443,3.869-0.997,6.971-0.144,10.941c1.393,6.484,0.453,13.543-2.421,19.518\n  \t\t\t\t\t\tc-1.358,2.822-2.042,5.471-0.355,8.428c1.265,2.219,3.751,2.652,6.036,1.893c2.472-0.82,4.2-3.58,5.239-5.842\n  \t\t\t\t\t\tc1.183-2.578,1.714-5.375,2.171-8.156c1.14-6.91,1.23-14.381,0.28-21.34L314.831,334.978z\"/>\n  \t\t\t\t\t<path fill=\"#8B5C29\" d=\"M309.231,350.648c0.322,0.135,0.597,0.24,0.713,0.303c1.009,0.541,2.112,0.826,3.051,1.541\n  \t\t\t\t\t\tc0.982,0.746,1.107,1.568,1,2.855c-0.066,0.795-0.94,5.857-1.979,5.455c-1.32-0.516-2.172-1.816-3.423-2.59\n  \t\t\t\t\t\tc-0.517-0.318-1.384-0.359-0.997,0.559c0.183,0.432,0.715,0.889,1.057,1.172c0.901,0.75,2.561,1.785,2.431,3.197\n  \t\t\t\t\t\tc-0.052,0.568-0.271,1.359-0.867,1.416c-0.668,0.062-0.64-0.992-1.285-0.912c-0.143,0.85,0.564,1.102,0.757,1.826\n  \t\t\t\t\t\tc0.144,0.541-0.148,1.096-0.497,1.498c-1.301,1.498-3.177-4.213-4.088-4.676c-0.526-0.268-0.479,0.104-0.277,0.709\n  \t\t\t\t\t\tc0.298,0.895,0.839,1.777,1.216,2.639c0.269,0.611,0.652,1.145,0.888,1.775c0.095,0.254,0.286,0.639,0.397,0.988\n  \t\t\t\t\t\tc0.058,0.184,0.094,0.355,0.086,0.494c-0.055,0.934-1.294,1.096-1.902,1.219c-0.5,0.1-0.906,0.016-1.383-0.16\n  \t\t\t\t\t\tc-1.194-0.436-2.13-1.414-2.662-2.701c-0.519-1.256-0.836-2.785-0.525-4.164c0.483-2.146,1.403,0.49,1.853,1.344\n  \t\t\t\t\t\tc0.403,0.766,1.109,3.4,1.984,3.494c0.187-0.908-0.661-2.418-0.984-3.164c-0.441-1.02-0.842-2.064-1.218-3.086\n  \t\t\t\t\t\tc-0.641-1.74,0.183-2.77,0.771-4.404c0.599,0.219,1.257,1.389,1.633,1.936c0.395,0.572,1.252,2.516,1.995,2.396\n  \t\t\t\t\t\tc0.197-1.395-1.759-3.365-2.414-4.416c-0.588-0.943-0.787-1.443-0.638-2.65c0.088-0.715,0.379-1.4,0.521-2.104\n  \t\t\t\t\t\tc0.116-0.568,0.038-1.299,0.672-1.229c0.628,0.066,1.489,1.377,1.901,1.85c0.316,0.363,1.132,1.164,0.785,1.723\n  \t\t\t\t\t\tc-0.28-0.104-0.481-0.383-0.764-0.486c-0.099,0.467,0.185,0.924,0.428,1.27c0.154,0.221,0.821,1.045,1.077,1.057\n  \t\t\t\t\t\tc0.763,0.027-0.083-1.152-0.069-1.646c0.497,0.055,0.988,0.654,1.489,0.74c-0.057-1.201-1.148-2.07-1.847-2.84\n  \t\t\t\t\t\tc-0.694-0.766-1.368-1.373-2.119-2.027c-0.453-0.396-0.813-1.24-0.748-1.883c0.009-0.092,0.189-0.355,0.209-0.516\n  \t\t\t\t\t\tc0.049-0.391-0.037-0.779-0.068-1.17c-0.052-0.645-0.171-1.342-0.104-1.986c0.39-0.053,0.752,0.156,1.13,0.246\n  \t\t\t\t\t\tc0.738,0.172,1.512,0.316,2.258,0.43c0.542,0.08,1.104,0.088,1.646-0.082c0.341-0.105,0.639,0.07,0.352-0.408\n  \t\t\t\t\t\tc-0.213-0.355-1.152-0.424-1.483-0.527c-0.562-0.178-1.104-0.283-1.677-0.389c-0.666-0.121-1.495-0.385-2.165-0.141\n  \t\t\t\t\t\tc0.113-1.076-0.244-2.074-0.489-3.08c-0.146-0.602-0.507-2.039,0.093-2.482c0.899-0.658,2.73,0.371,3.239-1.129\n  \t\t\t\t\t\tc-0.75-0.49-1.441,0.213-2.178,0.314c-0.471,0.064-1.397-0.096-1.646-0.621c-0.299-0.629-0.214-1.621-0.26-2.316\n  \t\t\t\t\t\tc-0.031-0.473-0.198-1.039-0.151-1.5c0.071-0.711,0.77-0.791,1.198-1.104c0.599-0.439,1.15-0.912,1.781-1.316\n  \t\t\t\t\t\tc0.072-0.045-0.386-0.279-0.413-0.287c-0.262-0.072-0.465,0.051-0.708,0.127c-0.651,0.205-1.234,0.635-1.893,0.818\n  \t\t\t\t\t\tc-0.186-1.275,1.583-3.234,2.243-4.123c0.974-1.309,2.356-2.191,3.895-1.922c0.57,0.1,2.394,1.082,1.595,1.762\n  \t\t\t\t\t\tc-0.434,0.371-4.446,0.957-4.354,1.729c0.108,0.9,3.755-0.402,4.284-0.498c1.226-0.227,1.731,0.951,2.132,2.195\n  \t\t\t\t\t\tc0.167,0.521,0.631,1.574,0.333,2.066c-0.268,0.447-1.155,0.592-1.556,0.686c-1.467,0.34-3.202,0.502-4.56,1.24\n  \t\t\t\t\t\tc0.642,0.688,2.959,0.301,3.818,0.148c0.548-0.098,1.752-0.559,2.231,0.094c0.325,0.441,0.27,2.006,0.325,2.578\n  \t\t\t\t\t\tc0.094,0.979,0.1,1.965,0.089,2.949c-0.005,0.482,0.098,1.279-0.099,1.748c-0.229,0.543-0.456,0.398-0.952,0.246\n  \t\t\t\t\t\tc-0.855-0.266-1.789-0.74-2.631-0.902c-0.328-0.062-2.166-0.139-2.316,0.361c-0.205,0.678,5.682,1.656,6.089,2.293\n  \t\t\t\t\t\tc0.326,0.512,0.262,1.645,0.293,2.256c0.058,1.127-0.027,2.625-0.435,3.662c-0.693,1.766-3.62-0.439-4.681-0.943\n  \t\t\t\t\t\tc-0.363-0.174-1.97-1.094-2.11-0.264c-0.08,0.58,0.95,1.09,1.7,1.41L309.231,350.648z\"/>\n  \t\t\t\t</g>\n  \t\t\t</g>\n  \t\t\t<path fill=\"#FFC200\" d=\"M236.572,287.458c0.317,0.108,4.63,1.772,4.573,0.858c0.202,3.198,0.008,6.477-0.211,9.641\n  \t\t\t\tc-0.249,3.578-0.371,7.164-0.436,10.75c-0.055,3.059,0.707,7.209-0.033,10.145c-0.38,1.51-0.478,1.242-2.066,2.064\n  \t\t\t\tc-1.282,0.662-2.446,1.471-3.514,2.443c-1.907,1.736-3.485,3.908-4.536,6.266c-0.463,1.039-0.844,2.137-0.991,3.27\n  \t\t\t\tc-0.119,0.91,0.393,2.396,0.174,3.16c-0.58,2.027-5.545,2.562-7.565,3.271c-3.995,1.404-7.872,2.869-11.805,4.406\n  \t\t\t\tc-2.644,1.035-5.53,2.285-8.216,3.105c-1.466,0.445-2.533-0.064-3.666-0.914c-1.185-0.893-2.312-1.865-3.155-3.102\n  \t\t\t\tc-2.51-3.676-2.548-8.52-2.622-12.799c-0.245-14.352,6.823-28.372,19.029-36.512c5.859-3.907,13.033-7.617,20.296-6.966\n  \t\t\t\tc1.19,0.12,3.09,0.36,4.74,0.92L236.572,287.458z\"/>\n  \t\t\t\n  \t\t\t\t<radialGradient id=\"SVGID_23_\" cx=\"65.75\" cy=\"386.4087\" r=\"7.9062\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\" gradientUnits=\"userSpaceOnUse\">\n  \t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FFBF00\"/>\n  \t\t\t\t<stop  offset=\"0.4326\" style=\"stop-color:#C57B00\"/>\n  \t\t\t\t<stop  offset=\"1\" style=\"stop-color:#8F0000\"/>\n  \t\t\t</radialGradient>\n  \t\t\t<ellipse fill=\"url(#SVGID_23_)\" cx=\"311.501\" cy=\"266.528\" rx=\"4.25\" ry=\"4.5\"/>\n  \t\t\t<path fill=\"#FFA300\" d=\"M230.212,329.998c-0.884,2.139-0.335,4.963-0.821,7.24c-4.895,2.271-10.227,4.5-15.444,6.094\n  \t\t\t\tc-2.349,0.717-4.646,1.562-6.964,2.393c-0.901,0.324-5.18,1.158-5.636,2.014c-1.056-2.855,0.007-7.477,0.569-10.402\n  \t\t\t\tc0.71-3.697,1.792-7.322,3.179-10.822c2.798-7.062,6.836-13.682,11.935-19.318c3.993-4.416,7.844-8.312,12.745-11.752\n  \t\t\t\tc3.144-2.207,7.683-6.52,11.656-6.85c0.516,7.847-0.42,22.439-0.964,30.266c-0.095,1.369-2.051,1.514-2.937,2.143\n  \t\t\t\tc-1.668,1.186-3.307,2.732-4.629,4.305c-1.15,1.35-2.03,3.07-2.7,4.699L230.212,329.998z\"/>\n  \t\t\t<path fill=\"#117F36\" d=\"M247.602,325.798c-1.034-2.611-3.178-6.805-6.411-7.01c-1.78-0.111-3.903,1.414-5.208,2.502\n  \t\t\t\tc-1.601,1.332-2.93,2.982-4.049,4.732c-1.259,1.969-1.889,4.184-2.463,6.424c-1.122,4.385-1.139,5.805,3.517,7.488\n  \t\t\t\tc3.618,1.311,7.557,1.307,11.349,1.086c2.853-0.164,5.458-0.023,5.681-3.605c0.21-3.5-1.14-8.371-2.42-11.611L247.602,325.798z\"/>\n  \t\t\t<path fill=\"none\" stroke=\"#D08BEA\" d=\"M295.871,277.208c2.732,5.122,4.556,10.408,6.01,16.036c0.662,2.562,1.451,5.122,2.09,7.667\n  \t\t\t\tc0.334,1.33,0.356,3.896,1.4,4.916c3.517,3.438,2.548-5.263,2.258-7.009c-0.813-4.902-2.539-9.983-4.416-14.519\n  \t\t\t\tc-1.672-4.041-3.059-8.416-5.509-12.074c-0.722-1.078-5.5-7.548-1.407-5.765c1.972,0.859,3.425,4.408,4.316,6.166\n  \t\t\t\tc2.429,4.792,5.528,9.274,7.608,14.248c3.463,8.282,4.679,16.359,6.15,25.025c0.318,1.873,0.712,8.418,3.259,5.322\n  \t\t\t\tc2.982-3.625-0.888-10.879-1.35-14.67c-0.132-1.08-0.68-2.986,1.009-3.27c2.288-0.382,1.929,2.854,2.083,4.18\n  \t\t\t\tc0.964,8.287,0.361,17.492,2.674,25.51c2.021,7.004,3.039,0.256,3.268-3.748c0.337-5.875-0.234-12.506-1.426-18.26\n  \t\t\t\tc-1.084-5.235-3.319-10.498-5.25-15.488c-1.12-2.894-3.453-9.388-6.292-10.891c-0.329,5.042,4.054,9.549,3.226,14.521\n  \t\t\t\tc-3.416-2.36-4.565-10.39-5.942-14.231c-2.113-5.898-5.322-10.224-8.992-15.299c-2.075-2.869-3.969-6.312-6.893-8.392\n  \t\t\t\tc-1.334-0.949-6.3-4.576-6.861-2.062c-0.363,1.627,1.959,2.582,2.886,3.457c0.09,0.085,2.987,4.035,1.441,3.596\n  \t\t\t\tc-3.211-0.913-7.252-5.073-9.916-7.19c-1.439-1.144-3.434-2.549-3.405-4.685c0.054-4.067,4.251,0.942,5.067,1.512\n  \t\t\t\tc0.839,0.586,3.212,2.629,3.697,0.432c0.336-1.526-2.471-2.651-3.365-3.359c-1.206-0.955-2.072-1.762-3.327-2.399\n  \t\t\t\tc-5.094-2.587-10.625-4.395-15.924-6.592c-2.423-1.005-7.396-3.413-10.016-2.941c-3.092,0.558-2.316,1.529-0.649,2.692\n  \t\t\t\tc3.496,2.439,8.424,2.468,12,4.175c1.761,0.84,14.514,3.324,9.257,7.366c-5.053-2.417-10.142-5.064-15.74-6.365\n  \t\t\t\tc-2.729-0.634-15.786-4.426-14.209,2.023c2.879,0.189,5.76,0.003,8.607,0.392c1.623,0.222,3.397,0.343,5.002,0.725\n  \t\t\t\tc7.497,1.781,14.289,6.432,20.674,10.526c3.08,1.975,5.835,4.313,8.341,7.074c3.49,3.84,6.1,7.03,8.56,11.63L295.871,277.208z\"/>\n  \t\t\t<path id=\"mask\" fill=\"#A01515\" d=\"M261.915,183.866c-8.404-11.005-21.01-17.938-29.12-29.302c-1.664-2.331-3.317-4.612-4.935-6.868\n  \t\t\t\tl-20.691,9.989c0.957,2.339,1.828,4.765,2.567,7.348c4.413,15.404,6.658,27.404-6.943,37.539\n  \t\t\t\tc-12.863,9.584-28.684,13.711-42.055,22.393c-7.644,4.964-5.14,10.789-5.098,18.493c0.056,10.265-2.645,18.336-7.252,24.848\n  \t\t\t\tc-13.61,19.233-48.14,27.198-69.714,16.541l-0.477,32.13c11.105-2.724,25.064-6.171,34.077,1.553\n  \t\t\t\tc37.279,31.963-13.605,78.008-41.012,95.807c-3.761,2.442-7.625,4.7-11.568,6.79l25.077,19.322\n  \t\t\t\tc4.513-7.723,10.741-14.422,19.957-19.356c11.015-5.896,30.214-7.506,42-5.85c14.024,1.969,30.484,9.791,31.26,25.818\n  \t\t\t\tc0.266,5.488-1.305,11.346-2.861,16.586c-2.662,8.963-8.603,22.58-17.163,27.4c-0.331,0.186-0.688,0.34-1.061,0.476l-2.579,12.576\n  \t\t\t\tc3.126-1.43,3.732-9.595,9.615-7.96c-0.913,4.229-1.98,8.344-3.26,12.355l24.312-2.92c-0.833-8.506,2.609-21.696,7.299-28.646\n  \t\t\t\tc5.738-8.5,18.978-10.879,28.203-12.729c8.629-1.732,15.483-4.496,23.354-8.391c11.685-5.777,25.761-7.348,38.661-6.092\n  \t\t\t\tc8.081,0.787,16.745,0.607,24.356,3.824l86.828-69c0-0.007,0-0.017,0-0.023c-0.154-9.807,0.133-19.701,1.897-29.373\n  \t\t\t\tc1.937-10.625,5.902-20.309,11.958-28.456l-99.288-110.604C290.284,209.669,272.509,197.74,261.915,183.866z M332.483,269.704\n  \t\t\t\tc7.997,12.32,15.415,25.141,18.798,39.536c5.231,22.252,9.111,52.795,0.353,74.5c-4.293,10.643-4.691,16.049-16.017,17.498\n  \t\t\t\tc-9.252,1.184-17.759,2.203-27.819,3.668c-11.721,1.707-26.918,0.277-36.685,7.502c-6.93,5.125-16.117,10.393-21.965,16.582\n  \t\t\t\tc-6.328-1.711-15.641-2.844-21.468,0.17c-10.301,5.326-19.061,14.037-29.294,19.773c-2.515,1.41-9.246,6.971-12.116,5\n  \t\t\t\tc-2.485-1.705-1.16-8.967-1.153-11.512c0.013-4.744-0.254-8.287-2.167-12.645c-2.73-6.221-7.196-10.596-11.166-16.023\n  \t\t\t\tc-5.461-7.467-8.391-9.588-17.516-11.314c-10.353-1.959-18.671-1.912-29.166,1.781c-4.318,1.518-27.761,11.219-30.548,5.533\n  \t\t\t\tc-2.153-4.393,13.017-17.766,15.751-20.666c6.17-6.547,12.436-13.117,18.92-19.352c7.149-6.875,8.976-16.006,4.723-24.777h-0.016\n  \t\t\t\tc-6.85-14.141-18.08-36.93-1.53-48.39c10.003-6.937,23.95-14.141,27.21-26.979c2.951-11.613,1.042-21.915,2.17-33.333\n  \t\t\t\tc0.708-7.169,6.227-6.801,12.15-9.299c9.973-4.206,20.633-11.883,31.847-11.899c17.99-0.025,52.922,15.775,62.636-9.071\n  \t\t\t\tc7.897,5.469,14.996,8.678,20.845,16.449c3.303,4.39,5.145,9.575,8.606,13.254c4.884,5.191,12.666,8.98,18.062,14.05\n  \t\t\t\tC322.132,255.567,327.812,262.508,332.483,269.704z\"/>\n  \t\t</g>\n  \t\t\n\n  \t\t<g id=\"labels\">\n  \t\t\t\n        <!-- Rough ER -->\n        <g class='label {{( info === \"rough_er\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:rough_er'>\n          <line x1=\"350\" y1=\"170\" x2=\"280\" y2=\"240\" class='outline'/>\n          <line x1=\"350\" y1=\"170\" x2=\"280\" y2=\"240\"/>\n\n          <g transform='translate(340, 130)'>\n            <rect class='label-bg' x='-9' y='-12' width='120' height='59' rx='5' ry='5'/>\n            <text>Rough ER</text>\n            <text x='15' y='24' class='small label'>(Nissl body)</text>\n          </g>\n        </g>\n\n        <!-- Ribosomes -->\n        <g class='label {{( info === \"ribosomes\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:ribosomes'>\n          <line class='no-arrow outline' x1=\"233\" y1=\"150\" x2=\"228\" y2=\"242\"/>\n          <ellipse class='outline' cx=\"228\" cy=\"248\" rx=\"7\" ry=\"7\"/>\n\n          <line class='no-arrow' x1=\"233\" y1=\"150\" x2=\"228\" y2=\"242\"/>\n          <ellipse cx=\"228\" cy=\"248\" rx=\"7\" ry=\"7\"/>\n\n          <g transform='translate(160, 130)'>\n            <rect class='label-bg' x='-9' y='-12' width='135' height='39' rx='5' ry='5'/>\n            <text>Ribosomes</text>\n          </g>\n        </g>\n\n        <!-- Polyribosomes -->\n        <g class='label {{( info === \"polyribosomes\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:polyribosomes'>\n          <line class='no-arrow outline' x1=\"200\" y1=\"200\" x2=\"184\" y2=\"227\"/>\n          <ellipse class='outline' cx=\"185\" cy=\"235\" rx=\"8\" ry=\"8\"/>\n\n          <line class='no-arrow' x1=\"200\" y1=\"200\" x2=\"184\" y2=\"227\"/>\n          <ellipse cx=\"185\" cy=\"235\" rx=\"8\" ry=\"8\"/>\n\n          <g transform='translate(50, 190)'>\n            <rect class='label-bg' x='-9' y='-12' width='175' height='39' rx='5' ry='5'/>\n            <text>Polyribosomes</text>\n          </g>\n        </g>\n\n        <!-- Golgi apparatus -->\n        <g class='label {{( info === \"golgi\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:golgi'>\n          <line x1=\"118\" y1=\"245\" x2=\"160\" y2=\"292\" class='outline'/>\n          <line x1=\"118\" y1=\"245\" x2=\"160\" y2=\"292\"/>\n\n          <g transform='translate(11, 255)'>\n            <rect class='label-bg' x='-9' y='-12' width='180' height='39' rx='5' ry='5'/>\n            <text>Golgi apparatus</text>\n          </g>\n        </g>\n\n        <!-- Nucleus -->\n        <g class='label {{( info === \"nucleus\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:nucleus'>\n          <line x1=\"86\" y1=\"320\" x2=\"207\" y2=\"311\" class='outline'/>\n          <line x1=\"86\" y1=\"320\" x2=\"207\" y2=\"311\"/>\n\n          <g transform=\"translate(25,310)\">\n            <rect class='label-bg' x='-9' y='-12' width='100' height='39' rx='5' ry='5'/>\n            <text>Nucleus</text>\n          </g>\n        </g>\n\n        <!-- Nucleolus -->\n        <g class='label {{( info === \"nucleolus\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:nucleolus'>\n          <line x1=\"85\" y1=\"390\" x2=\"230\" y2=\"333\" class='outline'/>\n          <line x1=\"85\" y1=\"390\" x2=\"230\" y2=\"333\"/>\n\n          <g transform=\"translate(25,370)\">\n            <rect class='label-bg' x='-9' y='-12' width='120' height='39' rx='5' ry='5'/>\n            <text>Nucleolus</text>\n          </g>\n        </g>\n\n        <!-- Membrane -->\n        <g class='label {{( info === \"membrane\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:membrane'>\n          <line x1=\"60\" y1=\"450\" x2=\"145\" y2=\"410\" class='outline'/>\n          <line x1=\"60\" y1=\"450\" x2=\"145\" y2=\"410\"/>\n\n          <g transform=\"translate(25,430)\">\n            <rect class='label-bg' x='-9' y='-12' width='125' height='39' rx='5' ry='5'/>\n            <text>Membrane</text>\n          </g>\n        </g>\n\n        <!-- Microtubule -->\n        <g class='label {{( info === \"microtubules\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:microtubules'>\n          <polyline points=\"190,430 210,490 220,440\" class='outline'/>\n          <polyline points=\"190,430 210,490 220,440\"/>\n\n          <g transform=\"translate(170,470)\">\n            <rect class='label-bg' x='-9' y='-12' width='140' height='39' rx='5' ry='5'/>\n            <text>Microtubule</text>\n          </g>\n        </g>\n        \n        <!-- Mitochondrion -->\n        <g class='label {{( info === \"mitochondrion\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:mitochondrion'>\n  \t\t\t\t<line x1=\"400\" y1=\"390\" x2=\"320\" y2=\"360\" class='outline'/>\n          <line x1=\"400\" y1=\"390\" x2=\"320\" y2=\"360\"/>\n\n          <g transform=\"translate(380,370)\">\n            <rect class='label-bg' x='-9' y='-12' width='170' height='39' rx='5' ry='5'/>\n            <text>Mitochondrion</text>\n          </g>\n  \t\t\t</g>\n\n  \t\t\t<!-- Smooth ER -->\n        <g class='label {{( info === \"smooth_er\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:smooth_er'>\n  \t\t\t\t<line x1=\"400\" y1=\"464\" x2=\"285\" y2=\"405\" class='outline'/>\n          <line x1=\"400\" y1=\"464\" x2=\"285\" y2=\"405\"/>\n\n          <g transform=\"translate(340,440)\">\n            <rect class='label-bg' x='-9' y='-12' width='135' height='39' rx='5' ry='5'/>\n            <text>Smooth ER</text>\n  \t\t\t\t</g>\n  \t\t\t</g>\n  \t\t</g>\n  \t</g>\n\n  \t<g id=\"closeups\">\n  \t\t\n  \t\t<!-- axon detail -->\n  \t\t<g class='detail {{( closeup === \"axon\" ? \"visible\" : \"hidden\" )}}'>\n  \t\t\t\n  \t\t\t<!-- graphic -->\n  \t\t\t<g>\n  \t\t\t\t<circle fill=\"#FFFFFF\" stroke=\"#3F3F3F\" stroke-width=\"4.279\" cx=\"639.239\" cy=\"439.887\" r=\"121.229\"/>\n  \t\t\t\t<path fill=\"#00A0C6\" d=\"M714.828,346.337c4.465,3.781,9.061,7.592,12.609,12.283c1.556,2.055,2.725,3.99,4.518,5.791\n  \t\t\t\t\tc1.949,1.955,3.807,4.223,4.59,6.924c1.739,5.984-8.42,6.889-8.021,12.146c-3.328-1.393-8.789,5.711-7.808,8.834\n  \t\t\t\t\tc2.027,6.455,10.698-3.467,13.276-3.969c1.861-0.363,1.797,0.299,0.688,2.139c-1.116,1.848-3.79,3.52-5.418,4.938\n  \t\t\t\t\tc-5.211,4.543-10.646,8.943-15.59,13.777c-4.081,3.992-7.771,8.322-12.221,12.059c-12.639,10.611-25.132,21.287-38.15,31.527\n  \t\t\t\t\tc-10.761,8.463-20.378,18.234-30.511,27.414c-4.559,4.127-9.349,8.064-13.854,12.182c-4.149,3.793-10.251,6.688-15.793,4.389\n  \t\t\t\t\tc-6.817-2.83-13.477-7.645-18.983-12.674c-2.581-2.354-5.265-4.697-8.363-6.338c-2.786-1.477-5.885-2.463-7.922-5.02\n  \t\t\t\t\tc-1.197-1.504-2.597-2.957-3.54-4.66c-2.244-4.047-3.353-9.965-2.886-14.553c0.567-5.578,4.008-7.479,7.533-11.221\n  \t\t\t\t\tc2.553-2.707,5.827-4.891,8.874-7.033c4.152-2.92,7.672-6.695,11.354-10.148c5.159-4.84,11.096-9.258,17.008-13.158\n  \t\t\t\t\tc9.462-6.24,16.218-15.598,25.342-22.141c3.095-2.221,6.114-4.404,8.505-7.336c2.088-2.562,5.172-4.043,7.641-6.176\n  \t\t\t\t\tc4.202-3.629,7.869-7.826,12.295-11.17c4.572-3.455,9.263-6.752,14.043-9.912c2.394-1.582,3.773-3.42,5.82-5.357\n  \t\t\t\t\tc2.434-2.307,5.006-4.459,7.424-6.781c2.211-2.123,4.611-4.184,7.06-6.033c0.665-0.502,2.146-2.016,2.972-2.039\n  \t\t\t\t\tc0.988-0.029,2.939,1.459,3.749,1.93c2.145,1.248,3.825,3.184,5.932,4.467c2.649,1.621,5.399,2.871,7.819,4.92H714.828z\"/>\n  \t\t\t\t<path fill=\"#BF0000\" d=\"M625.939,417.757c-8.165,6.955-16.372,13.861-24.683,20.645c-8.761,7.146-17.378,14.936-25.24,23.193\n  \t\t\t\t\tc-6.104,6.406-12.66,12.043-19.338,17.785c-3.686,3.17-7.238,6.488-10.878,9.709c-2.675,2.367-7.884,5.182-9.155,8.629\n  \t\t\t\t\tc-2.348,6.367,4.803,13.695,8.532,17.947c4.771,5.439,10.449,9.355,15.814,13.9c5.961-3.02,10.659-9.936,15.648-14.512\n  \t\t\t\t\tc12.041-11.037,24.402-21.699,36.385-32.979c6.45-6.074,12.913-12.156,19.676-18.055c16.841-14.686,34.465-28.492,51.062-43.453\n  \t\t\t\t\tc15.044-13.562,28.591-29.037,44.351-42.236c2.122-1.775,7.586-4.561,8.539-7.143c2.487-6.74-7.959-14.645-12.378-17.92\n  \t\t\t\t\tc-2.825-2.094-6.345-4.83-9.848-5.66c-5.688-1.348-7.897,2.744-11.854,6.312c-4.209,3.793-8.642,7.586-13.247,10.938\n  \t\t\t\t\tc-11.057,8.047-21.363,16.922-31.725,25.764c-10.569,9.02-21.08,18.119-31.659,27.129L625.939,417.757z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_24_\" gradientUnits=\"userSpaceOnUse\" x1=\"336.126\" y1=\"165.5366\" x2=\"431.9367\" y2=\"253.0673\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#8F0000\"/>\n  \t\t\t\t\t<stop  offset=\"0.4057\" style=\"stop-color:#8D0101\"/>\n  \t\t\t\t\t<stop  offset=\"0.5815\" style=\"stop-color:#860505\"/>\n  \t\t\t\t\t<stop  offset=\"0.7129\" style=\"stop-color:#790B0B\"/>\n  \t\t\t\t\t<stop  offset=\"0.8222\" style=\"stop-color:#671514\"/>\n  \t\t\t\t\t<stop  offset=\"0.9167\" style=\"stop-color:#502120\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#352F2E\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_24_)\" d=\"M568.17,472.787c4.999-2.723,9.26-6.602,13.303-10.559c11.608-11.369,25.005-21.021,37.209-31.674\n  \t\t\t\t\tc11.826-10.316,23.651-20.635,35.479-30.951c0.473-0.41,1.855-1.215,2.089-1.822c0.003-0.006,3.663-9.564,16.425-2.719\n  \t\t\t\t\tc0,0,13.051,8.988,13.051,17.912c0,1.211-5.854,5.217-6.702,5.975c-5.784,5.156-11.567,10.312-17.352,15.471\n  \t\t\t\t\tc-11.011,9.816-22.021,19.635-33.034,29.451c-5.93,5.287-11.86,10.574-17.792,15.861c-2.887,2.574-5.771,5.148-8.657,7.723\n  \t\t\t\t\tc-2.941,2.621-5.087,4.75-7.042,8.084c1.035-1.766-1-5.51-1.565-7.443c-2.505-8.562-8.607-14.941-17.854-16.238\n  \t\t\t\t\tc-2.45-0.34-5.42-0.238-7.58,0.932L568.17,472.787z\"/>\n  \t\t\t\t<path fill=\"#FFBF00\" d=\"M683.599,377.277c-0.919-0.383-1.675-1.043-2.634-1.391c-1.237-0.449-2.696-0.801-3.986-1.199\n  \t\t\t\t\tc-2.812-0.867-5.17-1.781-8.169-2.021c-1.813-0.145-3.614-0.186-5.433-0.238c-0.354-1.838,2.304-3.967,3.611-4.877\n  \t\t\t\t\tc3.89-2.709,7.954-4.174,12.558-5.021c3.436-0.631,9.603-2.537,12.448,0.543c2.897,3.135,0.174,7.145-1.903,9.74\n  \t\t\t\t\tc-1.456,1.82-3.254,5.127-5.666,4.709c-0.3-0.039-0.58-0.129-0.83-0.24L683.599,377.277z\"/>\n  \t\t\t\t<path opacity=\"0.57\" fill=\"#00A0C6\" d=\"M669.279,359.058c-1.648,1.326-3.318,2.641-5.018,3.936\n  \t\t\t\t\tc-6.766,5.16-15.525,10.33-20.94,16.979c-2.25,2.764,0.27,4.438,2.741,5.508c3.434,1.486,3.329,4.098,5.692,6.643\n  \t\t\t\t\tc1.15,1.236,0.989,1.359,2.468,0.592c3.455-1.797,7.116-3.078,11.096-3.24c4.035-0.164,8.402,1.271,11.795,3.395\n  \t\t\t\t\tc1.987,1.244,3.741,3.062,5.426,4.705c2.013,1.965,3.516,3.838,4.182,6.594c0.528,2.188,0.479,5.564,2.418,7.098\n  \t\t\t\t\tc0.883,0.697,4.315,0.984,5.564,1.506c1.096,0.455,2.483,1.078,3.408,1.824c0.617,0.496,0.989,1.391,1.683,1.773\n  \t\t\t\t\tc1.993,1.104,4.341-0.846,5.428-2.414c1.205-1.738,1.62-3.854,2.735-5.621c1.071,0.564,6.064-4.545,7.039-5.275\n  \t\t\t\t\tc2.613-1.969,5.019-4.283,7.65-6.148c1.771-1.256,3.807-2.525,5.718-3.643c3.294-1.924,8.085-3.896,10.545-6.781\n  \t\t\t\t\tc1.548-1.814,3.211-3.67,4.035-5.918c0.695-1.895,0.351-3.742-0.187-5.68c-0.265-0.947-0.545-2.359-1.03-3.199\n  \t\t\t\t\tc-0.594-1.027-1.549-1.258-2.436-1.914c-0.894-0.662-1.587-1.551-2.37-2.357c-1.773-1.83-3.747-3.613-4.73-6.025\n  \t\t\t\t\tc-2.229-5.457-4.507-9.146-9.601-12.652c-2.224-1.529-4.621-2.77-6.731-4.467c-1.81-1.459-3.185-3.363-5.032-4.811\n  \t\t\t\t\tc-3.065-2.398-6.713-4.34-10.64-4.727c-4.63-0.453-7.804,5.162-11.113,7.855c-6.699,5.439-13.09,11.061-19.81,16.461\n  \t\t\t\t\tL669.279,359.058z\"/>\n  \t\t\t\t<path opacity=\"0.2\" fill=\"#FFFFFF\" d=\"M566.34,470.937c0,0-10.139-11.188-3.452-24.559l72.622-60.164\n  \t\t\t\t\tl18.197,7.754l-75.28,65.133l-12.091,11.84L566.34,470.937z\"/>\n  \t\t\t\t<path opacity=\"0.2\" fill=\"#FFFFFF\" d=\"M599.969,494.066l90.002-79.264l12.861,5.252l-87.318,75.551\n  \t\t\t\t\tc0,0-7.7,6.301-15.54-1.539H599.969z\"/>\n  \t\t\t\t<path fill=\"#0060B6\" stroke=\"#92E7EF\" stroke-width=\"1.2155\" d=\"M578.399,458.167c0.289-0.008,0.646-0.082,1.08-0.244\n  \t\t\t\t\tc0.9-0.336,1.651-1.166,2.372-1.787c1.55-1.342,3.099-2.682,4.647-4.021c4.473-3.869,8.942-7.738,13.415-11.607\n  \t\t\t\t\tc10.991-9.51,21.984-19.02,32.977-28.529c7.166-6.199,14.331-12.4,21.497-18.602c0.271-0.232,0.615-0.457,0.847-0.73\n  \t\t\t\t\tc0.002-0.002,5.881-6.959,19.856,0c13.978,6.957,14.88,22.154,14.88,22.154l-76.946,67.275c0,0-3.824,3.824,0,3.824\n  \t\t\t\t\tc0.22-0.193,0.439-0.387,0.66-0.582c5.786-5.094,11.575-10.189,17.363-15.285c9.741-8.576,19.482-17.152,29.224-25.729\n  \t\t\t\t\tc8.424-7.414,16.848-14.832,25.271-22.246c2.048-1.803,4.312-3.508,6.212-5.467c0.812-0.842,1.247-1.113,1.058-2.623\n  \t\t\t\t\tc-0.611-4.879-3.074-10.748-6.02-14.572c-3.063-3.979-5.86-7.09-10.788-8.605c0,0-11.852-7.293-22.79,0\n  \t\t\t\t\tc-5.05,4.346-10.098,8.689-15.146,13.035c-10.388,8.938-20.773,17.877-31.161,26.816c-8.594,7.395-17.188,14.789-25.778,22.184\n  \t\t\t\t\tc-0.805,0.691-1.599,1.402-2.417,2.08c-1.399,1.16-1.939,3.311-0.31,3.27L578.399,458.167z\"/>\n  \t\t\t\t<path fill=\"#0060B6\" stroke=\"#92E7EF\" stroke-width=\"1.2155\" d=\"M575.27,454.757l75.205-64.57c0,0,8.813-8.812,24.917-2.734\n  \t\t\t\t\tc0,0,23.094,7.293,19.752,28.562l-80.867,71.145c0,0-4.605,2.109-6.718,0l-2.375,2.375c0,0,6.254,4.094,10.349,0l81.738-72.607\n  \t\t\t\t\tc0,0,6.381-21.271-20.056-31.297c0,0-16.104-10.027-29.778,3.645l-75.054,64.115c0,0-1.157,11.895,1.234,9.441l2.395-2.451\n  \t\t\t\t\tc0,0.01-1.48-1.139-0.74-5.609L575.27,454.757z\"/>\n  \t\t\t\t<path fill=\"#0060B6\" stroke=\"#92E7EF\" stroke-width=\"1.2155\" d=\"M569.949,451.568l74.143-62.293c0,0,9.42-16.408,33.121-6.686\n  \t\t\t\t\tc0,0,29.476,10.027,22.485,35.248l-84.169,74.75c0,0-4.368,4.098-12.668-1.143l-2.897,2.621c0,0,9.813,7.271,17.084,0\n  \t\t\t\t\tl85.082-74.709c0.638-1.811,0.925-3.787,1.097-5.688c0.554-6.109-0.729-12.324-3.896-17.602\n  \t\t\t\t\tc-3.548-5.91-10.243-12.377-16.81-14.695c-4.95-1.746-9.364-4.35-14.855-4.225c-3.659,0.084-7.655-0.119-11.216,0.982\n  \t\t\t\t\tc-6.035,1.865-10.52,4.562-14.484,9.623l-74.749,62.291c0,0-3.794,11.744,1.737,17.279l2.604-2.605c0.02,0-4.021-0.08-1.59-13.148\n  \t\t\t\t\tL569.949,451.568z\"/>\n  \t\t\t\t<path fill=\"#0060B6\" stroke=\"#92E7EF\" stroke-width=\"1.2155\" d=\"M567.499,468.658c0,0-7.068-6.057-1.803-20.033l71.104-59.76\n  \t\t\t\t\tc0,0,6.463-9.336,20.662-13.979c0,0,19.648-2.227,33.83,8.914c3.963,3.113,7.351,7.354,9.927,11.645\n  \t\t\t\t\tc1.659,2.764,3.01,5.73,3.855,8.846c0.65,2.393,1.489,5.049,4.459,2.648c2.021-1.635,2.308-5.586,1.729-7.912\n  \t\t\t\t\tc-0.703-2.836-1.158-5.795-2.245-8.529c-2.24-5.633-6.517-10.283-11.088-14.023c-6.827-5.586-14.214-10.416-23.299-11.492\n  \t\t\t\t\tc-3.248-0.385-6.659,0.258-9.771,1.17c-4.637,1.359-8.823,3.914-12.864,6.498c-3.18,2.035-6.226,4.279-9.114,6.707\n  \t\t\t\t\tc-2.879,2.42-5.05,5.486-7.906,7.889c-0.001,0-71.104,59.76-71.104,59.76s-6.693,10.521,1.818,23.289l1.8-1.639L567.499,468.658z\"\n  \t\t\t\t\t/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_25_\" gradientUnits=\"userSpaceOnUse\" x1=\"334.9375\" y1=\"178.3237\" x2=\"414.1568\" y2=\"251.2331\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0.0056\" style=\"stop-color:#FFFFFF\"/>\n  \t\t\t\t\t<stop  offset=\"0.5\" style=\"stop-color:#FFFF00\"/>\n  \t\t\t\t\t<stop  offset=\"0.5658\" style=\"stop-color:#FBFB01\"/>\n  \t\t\t\t\t<stop  offset=\"0.6351\" style=\"stop-color:#EFEE04\"/>\n  \t\t\t\t\t<stop  offset=\"0.706\" style=\"stop-color:#DAD908\"/>\n  \t\t\t\t\t<stop  offset=\"0.7781\" style=\"stop-color:#BDBB0F\"/>\n  \t\t\t\t\t<stop  offset=\"0.8511\" style=\"stop-color:#989517\"/>\n  \t\t\t\t\t<stop  offset=\"0.9248\" style=\"stop-color:#6B6722\"/>\n  \t\t\t\t\t<stop  offset=\"0.9979\" style=\"stop-color:#37312E\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#352F2E\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_25_)\" d=\"M577.229,472.117c-0.358,0,89.555-79.273,89.555-79.273s1.726,0.438,1.727,0.438\n  \t\t\t\t\tc-0.045-0.012-0.296,0.262-0.328,0.291c-0.57,0.506-1.141,1.012-1.711,1.516c-1.006,0.895-2.012,1.785-3.019,2.678\n  \t\t\t\t\tc-1.385,1.227-2.769,2.455-4.151,3.68c-1.703,1.512-3.407,3.021-5.111,4.533c-1.966,1.742-3.932,3.484-5.896,5.229\n  \t\t\t\t\tc-2.17,1.924-4.34,3.848-6.511,5.771c-2.315,2.053-4.632,4.105-6.947,6.16l-7.215,6.396c-2.435,2.158-4.869,4.314-7.303,6.475\n  \t\t\t\t\tc-2.409,2.137-4.816,4.27-7.225,6.402c-2.32,2.059-4.643,4.119-6.965,6.176c-2.179,1.932-4.356,3.863-6.536,5.795\n  \t\t\t\t\tc-1.977,1.754-3.953,3.506-5.932,5.26c-1.719,1.523-3.438,3.047-5.155,4.57c-1.4,1.242-2.802,2.484-4.204,3.727\n  \t\t\t\t\tc-1.024,0.91-2.052,1.818-3.076,2.729c-0.595,0.527-1.188,1.053-1.781,1.58c-0.116,0.104-0.232,0.205-0.349,0.309\n  \t\t\t\t\tc-0.15,0.09-1.03-0.461-1.881-0.461L577.229,472.117z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_26_\" gradientUnits=\"userSpaceOnUse\" x1=\"337.7661\" y1=\"175.2539\" x2=\"416.9767\" y2=\"248.1645\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0.0056\" style=\"stop-color:#FFFFFF\"/>\n  \t\t\t\t\t<stop  offset=\"0.5\" style=\"stop-color:#FFFF00\"/>\n  \t\t\t\t\t<stop  offset=\"0.5658\" style=\"stop-color:#FBFB01\"/>\n  \t\t\t\t\t<stop  offset=\"0.6351\" style=\"stop-color:#EFEE04\"/>\n  \t\t\t\t\t<stop  offset=\"0.706\" style=\"stop-color:#DAD908\"/>\n  \t\t\t\t\t<stop  offset=\"0.7781\" style=\"stop-color:#BDBB0F\"/>\n  \t\t\t\t\t<stop  offset=\"0.8511\" style=\"stop-color:#989517\"/>\n  \t\t\t\t\t<stop  offset=\"0.9248\" style=\"stop-color:#6B6722\"/>\n  \t\t\t\t\t<stop  offset=\"0.9979\" style=\"stop-color:#37312E\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#352F2E\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_26_)\" d=\"M581.779,473.607c0.078-0.07,88.275-78.145,88.275-78.145l1.728,0.439l-88.508,78.469\n  \t\t\t\t\tc-1.28-0.961-1.5-0.771-1.5-0.771L581.779,473.607z\"/>\n  \t\t\t\t<path fill=\"#FFBF00\" d=\"M683.429,376.988c-1.178-0.436-2.445-0.6-3.68-0.779c-2.616-0.383-4.703-1.162-7.159-1.832\n  \t\t\t\t\tc-1.727-0.473-3.625-0.879-5.396-1.129c-1.525-0.215-5.251,0.6-3.874-1.883c0.653-1.178,2.354-1.643,3.553-1.928\n  \t\t\t\t\tc2.712-0.648,5.823-0.688,8.583-0.273c2.67,0.398,5.515,1.533,7.646,3.193c1.003,0.781,1.953,2.439,2.369,3.609\n  \t\t\t\t\tc0.93,2.641-0.44,1.621-2.05,1.02L683.429,376.988z\"/>\n  \t\t\t\t<path opacity=\"0.2\" fill=\"#003CFF\" d=\"M706.089,409.126c0,1.4-0.077,2.848,0.041,4.232\n  \t\t\t\t\tc0.838-0.484,1.112-1.494,1.741-2.227c0.62-0.723,1.106-0.854,1.854-1.438c2.396-1.879,4.817-4.014,7.142-6.084\n  \t\t\t\t\tc5.124-4.564,10.007-9.389,15.019-14.078c2.311-2.162,4.612-4.664,7.208-6.484c0.761-0.533,4.074-2.221,3.221-3.408\n  \t\t\t\t\tc-1.076-1.49-7.173,5.369-8.07,6.195c-6.588,6.072-13.772,11.676-20.611,17.416c-2.354,1.979-3.345,5.211-6.934,5.064\"/>\n  \t\t\t\t<circle fill=\"none\" stroke=\"#3F3F3F\" stroke-width=\"4.279\" cx=\"639.359\" cy=\"440.007\" r=\"121.229\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_27_\" gradientUnits=\"userSpaceOnUse\" x1=\"350.8179\" y1=\"162.0332\" x2=\"429.5579\" y2=\"234.5132\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0.0056\" style=\"stop-color:#FFFFFF\"/>\n  \t\t\t\t\t<stop  offset=\"0.5\" style=\"stop-color:#FFFF00\"/>\n  \t\t\t\t\t<stop  offset=\"0.5658\" style=\"stop-color:#FBFB01\"/>\n  \t\t\t\t\t<stop  offset=\"0.6351\" style=\"stop-color:#EFEE04\"/>\n  \t\t\t\t\t<stop  offset=\"0.706\" style=\"stop-color:#DAD908\"/>\n  \t\t\t\t\t<stop  offset=\"0.7781\" style=\"stop-color:#BDBB0F\"/>\n  \t\t\t\t\t<stop  offset=\"0.8511\" style=\"stop-color:#989517\"/>\n  \t\t\t\t\t<stop  offset=\"0.9248\" style=\"stop-color:#6B6722\"/>\n  \t\t\t\t\t<stop  offset=\"0.9979\" style=\"stop-color:#37312E\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#352F2E\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_27_)\" d=\"M593.699,488.578c-0.11-0.188-0.254-0.355-0.349-0.549c0.35-0.125,0.659-0.334,0.942-0.586\n  \t\t\t\t\tc0.688-0.609,1.356-1.24,2.042-1.854c1.248-1.115,2.498-2.229,3.748-3.342c1.597-1.42,3.194-2.838,4.792-4.256\n  \t\t\t\t\tc1.885-1.674,3.771-3.348,5.655-5.018c2.115-1.873,4.229-3.746,6.346-5.619c2.285-2.021,4.571-4.045,6.856-6.064\n  \t\t\t\t\tc2.396-2.119,4.793-4.238,7.189-6.357c2.448-2.162,4.897-4.326,7.346-6.49c2.442-2.156,4.886-4.312,7.326-6.471\n  \t\t\t\t\tc2.377-2.098,4.753-4.195,7.129-6.293c2.251-1.986,4.501-3.975,6.753-5.961c2.066-1.824,4.133-3.646,6.199-5.473\n  \t\t\t\t\tc1.824-1.607,3.647-3.217,5.471-4.826c1.522-1.342,3.044-2.684,4.564-4.025c1.159-1.023,2.319-2.045,3.479-3.068\n  \t\t\t\t\tc0.74-0.65,1.479-1.305,2.218-1.955c0.261-0.229,0.521-0.459,0.78-0.688c0,0,1.727,0.438,1.728,0.438\n  \t\t\t\t\tc-0.045-0.012-0.297,0.262-0.329,0.291c-0.569,0.506-1.142,1.01-1.71,1.518c-1.007,0.893-2.012,1.783-3.02,2.676\n  \t\t\t\t\tc-1.384,1.227-2.769,2.453-4.151,3.68c-1.703,1.512-3.406,3.021-5.11,4.531c-1.966,1.744-3.932,3.486-5.896,5.229\n  \t\t\t\t\tc-2.17,1.926-4.34,3.85-6.512,5.771c-2.314,2.055-4.631,4.105-6.946,6.16c-2.404,2.133-4.811,4.264-7.214,6.396\n  \t\t\t\t\tc-2.436,2.158-4.869,4.316-7.305,6.477c-2.407,2.135-4.814,4.268-7.223,6.402c-2.32,2.057-4.644,4.117-6.965,6.176\n  \t\t\t\t\tc-2.18,1.93-4.357,3.861-6.537,5.795c-1.977,1.752-3.953,3.504-5.931,5.258c-1.719,1.523-3.438,3.047-5.155,4.57\n  \t\t\t\t\tc-1.402,1.242-2.803,2.484-4.204,3.727c-1.025,0.91-2.053,1.818-3.078,2.73c-0.777,0.688-1.73,1.326-2.407,2.102\n  \t\t\t\t\tc-0.252-0.203-0.305-0.576-0.434-0.863c-0.029-0.051-0.06-0.102-0.1-0.16L593.699,488.578z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_28_\" gradientUnits=\"userSpaceOnUse\" x1=\"342.5894\" y1=\"172.042\" x2=\"422.0193\" y2=\"245.152\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0.0056\" style=\"stop-color:#FFFFFF\"/>\n  \t\t\t\t\t<stop  offset=\"0.5\" style=\"stop-color:#FFFF00\"/>\n  \t\t\t\t\t<stop  offset=\"0.5658\" style=\"stop-color:#FBFB01\"/>\n  \t\t\t\t\t<stop  offset=\"0.6351\" style=\"stop-color:#EFEE04\"/>\n  \t\t\t\t\t<stop  offset=\"0.706\" style=\"stop-color:#DAD908\"/>\n  \t\t\t\t\t<stop  offset=\"0.7781\" style=\"stop-color:#BDBB0F\"/>\n  \t\t\t\t\t<stop  offset=\"0.8511\" style=\"stop-color:#989517\"/>\n  \t\t\t\t\t<stop  offset=\"0.9248\" style=\"stop-color:#6B6722\"/>\n  \t\t\t\t\t<stop  offset=\"0.9979\" style=\"stop-color:#37312E\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#352F2E\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_28_)\" d=\"M586.84,476.587c0.119-0.105,0.247-0.205,0.367-0.311c0.566-0.494,1.126-0.996,1.69-1.496\n  \t\t\t\t\tc0.977-0.865,1.953-1.729,2.932-2.596c1.335-1.182,2.672-2.363,4.008-3.549c1.643-1.451,3.283-2.904,4.925-4.357\n  \t\t\t\t\tc1.895-1.676,3.785-3.352,5.68-5.027c2.091-1.85,4.181-3.699,6.271-5.551c2.233-1.977,4.467-3.953,6.699-5.932\n  \t\t\t\t\tc2.323-2.057,4.646-4.111,6.969-6.168c2.357-2.086,4.715-4.174,7.073-6.262c2.339-2.068,4.678-4.139,7.017-6.211\n  \t\t\t\t\tc2.267-2.006,4.531-4.012,6.798-6.018c2.141-1.895,4.278-3.787,6.418-5.682c1.958-1.732,3.917-3.467,5.875-5.199\n  \t\t\t\t\tc1.725-1.525,3.447-3.053,5.171-4.578c1.435-1.27,2.869-2.539,4.304-3.809c1.092-0.967,2.184-1.934,3.273-2.898\n  \t\t\t\t\tc0.695-0.615,1.391-1.23,2.085-1.846c0.243-0.215,0.487-0.432,0.73-0.646l1.728,0.439c-0.023,0.02-0.047,0.041-0.07,0.061\n  \t\t\t\t\tc-0.385,0.342-0.77,0.684-1.152,1.023c-0.817,0.725-1.634,1.447-2.45,2.172c-1.196,1.061-2.392,2.121-3.587,3.18\n  \t\t\t\t\tc-1.521,1.35-3.041,2.697-4.562,4.047c-1.794,1.588-3.586,3.178-5.377,4.768c-2.014,1.783-4.023,3.564-6.034,5.35\n  \t\t\t\t\tc-2.175,1.928-4.352,3.855-6.526,5.787c-2.288,2.027-4.575,4.055-6.861,6.084c-2.347,2.078-4.69,4.158-7.036,6.236\n  \t\t\t\t\tc-2.351,2.082-4.699,4.166-7.05,6.248c-2.301,2.041-4.602,4.08-6.9,6.121c-2.2,1.949-4.398,3.898-6.597,5.848\n  \t\t\t\t\tc-2.041,1.811-4.084,3.621-6.127,5.434l-5.499,4.875c-1.57,1.391-3.142,2.783-4.711,4.176c-1.254,1.113-2.51,2.223-3.763,3.336\n  \t\t\t\t\tc-0.885,0.785-1.769,1.568-2.653,2.354c-0.31,0.271-2.161,1.705-2.002,2.061c-0.187-0.414-0.896-0.975-1.278-1.236\n  \t\t\t\t\tc0.08-0.059,0.16-0.139,0.24-0.209L586.84,476.587z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_29_\" gradientUnits=\"userSpaceOnUse\" x1=\"346.5391\" y1=\"169.5601\" x2=\"437.4913\" y2=\"249.172\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#FF7F00\"/>\n  \t\t\t\t\t<stop  offset=\"0.1324\" style=\"stop-color:#FB7D01\"/>\n  \t\t\t\t\t<stop  offset=\"0.2731\" style=\"stop-color:#EE7804\"/>\n  \t\t\t\t\t<stop  offset=\"0.4177\" style=\"stop-color:#D97009\"/>\n  \t\t\t\t\t<stop  offset=\"0.565\" style=\"stop-color:#BB6410\"/>\n  \t\t\t\t\t<stop  offset=\"0.7143\" style=\"stop-color:#955518\"/>\n  \t\t\t\t\t<stop  offset=\"0.8632\" style=\"stop-color:#664323\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#352F2E\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<path fill=\"url(#SVGID_29_)\" d=\"M588.319,479.117c0,0,2.423,2.092,3.988,6.01l90.953-79.422c0,0-1.722-3.275-4.797-5.777\n  \t\t\t\t\tl-90.14,79.189H588.319z\"/>\n  \t\t\t</g>\n  \t\t\t\n  \t\t\t<!-- labels -->\n  \t\t\t<g>\n  \t\t\t\t\n          <!-- Myelin sheath -->\n          <g class='label {{( info === \"schwann_cell\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:schwann_cell'>\n  \t\t\t\t\t<polyline points=\"710,361 709,220 560,282\" class='outline'/>\n            <polyline points=\"710,361 709,220 560,282\"/>\n            \n            <g transform='translate(650, 220)'>\n              <rect class='label-bg' x='-9' y='-12' width='160' height='59' rx='5' ry='5'/>\n              <text>Myelin Sheath</text>\n  \t\t\t\t\t  <text x='0' y='24' class='small'>(Schwann cell)</text>\n            </g>\n  \t\t\t\t\t\n  \t\t\t\t</g>\n\n  \t\t\t\t<!-- Nucleus -->\n          <g class='label {{( info === \"schwann_cell\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:schwann_cell'>\n  \t\t\t\t\t<line x1=\"610\" y1=\"365\" x2=\"660\" y2=\"370\" class='outline'/>\n            <line x1=\"610\" y1=\"365\" x2=\"660\" y2=\"370\"/>\n\n            <g transform='translate(507, 349)'>\n              <rect class='label-bg' x='-9' y='-12' width='120' height='59' rx='5' ry='5'/>\n              <text>Nucleus</text>\n  \t\t\t\t\t  <text x='0' y='24' class='small'>(Schwann cell)</text>\n  \t\t\t\t\t</g>\n  \t\t\t\t</g>\n\n  \t\t\t\t<!-- Microfilament -->\n          <g class='label {{( info === \"microfilament\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:microfilament'>\n  \t\t\t\t\t<polyline points=\"624,462 670,440 626,437\" class='outline'/>\n            <polyline points=\"624,462 670,440 626,437\"/>\n\n            <g transform='translate(660, 440)'>\n              <rect class='label-bg' x='-9' y='-12' width='155' height='39' rx='5' ry='5'/>\n              <text>Microfilament</text>\n            </g>\n  \t\t\t\t</g>\n\n  \t\t\t\t<!-- Microtubule -->\n          <g class='label {{( info === \"microtubules\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:microtubules'>\n  \t\t\t\t\t<line x1=\"645\" y1=\"499\" x2=\"610\" y2=\"480\" class='outline'/>\n            <line x1=\"645\" y1=\"499\" x2=\"610\" y2=\"480\"/>\n\n            <g transform='translate(650, 490)'>\n              <rect class='label-bg' x='-9' y='-12' width='140' height='39' rx='5' ry='5'/>\n              <text>Microtubule</text>\n  \t\t\t\t\t</g>\n  \t\t\t\t</g>\n\n  \t\t\t\t<!-- Axon -->\n          <g class='label {{( info === \"axon\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:axon'>\n  \t\t\t\t\t<line x1=\"650\" y1=\"560\" x2=\"580\" y2=\"510\" class='outline'/>\n            <line x1=\"650\" y1=\"560\" x2=\"580\" y2=\"510\"/>\n            \n            <g transform='translate(640, 540)'>\n              <rect class='label-bg' x='-9' y='-12' width='70' height='39' rx='5' ry='5'/>\n              <text>Axon</text>\n            </g>\n  \t\t\t\t</g>\n  \t\t\t</g>\n  \t\t</g>\n  \t\t\n  \t\t<!-- synapse detail -->\n  \t\t<g class='detail {{( closeup === \"synapse\" ? \"visible\" : \"hidden\" )}}'>\n\n  \t\t\t<!-- graphic -->\n  \t\t\t<g>\n  \t\t\t\t<circle fill=\"#FFFFFF\" cx=\"459.53\" cy=\"117.449\" r=\"96.86\"/>\n\n  \t\t\t\t<path fill=\"#770A0A\" d=\"M469.68,35.411c6.303-5.34,16.323-3.647,23.898-2.367c3.475,0.588,7.549,1.883,10.354,4.094\n  \t\t\t\t\tc3.872,3.051,6.079,8.724,7.1,13.457c0.722,3.351,0.562,6.771,0.834,10.167c0.465,5.848-0.002,12.042,1.233,17.779\n  \t\t\t\t\tc1.604,7.441,0.233,15.118,1.972,22.817c1.427,6.321,1.803,12.004,2.231,18.447c0.264,3.935,0.396,7.734,0.938,11.642\n  \t\t\t\t\tc1.209,8.703,3.916,18.56-0.129,27.059c-5.403,11.353-19.14,16.394-30.517,11.016c-4.561-2.156-7.516-6.568-11.39-9.632\n  \t\t\t\t\tc-4.258-3.366-8.49-6.783-12.83-10.043c-8.828-6.632-18.974-11.176-29.709-13.901c-6.993-1.774-14.385-3.148-21.214-5.51\n  \t\t\t\t\tc-13.278-4.592-25.69-14.899-17.073-29.868c5.579-9.693,16.182-15.729,25.008-22.06c7.672-5.503,15.24-11.075,22.896-16.606\n  \t\t\t\t\tc4.942-3.57,9.874-7.206,14.343-11.367c4.273-3.979,6.636-8.441,9.963-12.894c0.65-0.866,1.351-1.604,2.101-2.242L469.68,35.411z\"\n  \t\t\t\t\t/>\n  \t\t\t\t<path fill=\"#C12F2F\" d=\"M408.921,201.608c12.295,6.344,24.361,10.105,38.291,11.741c7.554,0.889,16.08,1.937,23.699,0.683\n  \t\t\t\t\tc5.46-0.898,17.785-3.681,20.918-8.439c-6.437-4.795-10.399-12.889-16.588-18.091c-8.223-6.912-18.063-12.445-27.429-17.063\n  \t\t\t\t\tc-10.658-5.256-21.292-9.543-32.596-13.609c-18.479-6.645-35.942-10.1-52.475-20.901c4.74,26.7,21.58,52.99,46.18,65.68\n  \t\t\t\t\tL408.921,201.608z\"/>\n  \t\t\t\t<path fill=\"#042C44\" d=\"M405.08,155.519c0.431-3.077,2.075-1.581,3.632-3.292c1.063-1.171,0.817-3.364-0.892-3.724\n  \t\t\t\t\tc-0.502-0.107-1.418-0.083-1.625,0.494c-0.369,1.037,1.865,2.089-0.473,2.528c-1.008,0.19-2.687-0.738-2.176-1.95\n  \t\t\t\t\tc0.209-0.499,3.292-1.36,0.679-2.094c-1.292-0.364-2.628,0.916-2.806,2.098c-0.164,1.117,0.557,1.616,1.069,2.45\n  \t\t\t\t\tc0.611,0.998,0.691,0.633,0.384,1.899c-0.289,1.186-1.595,2.899-0.104,3.828c1.652,1.029,2.144-0.77,2.271-1.887\n  \t\t\t\t\tc0.021-0.13,0.03-0.24,0.04-0.36L405.08,155.519z\"/>\n  \t\t\t\t<path fill=\"#042C44\" d=\"M426.58,161.499c0.426-3.079,2.073-1.582,3.628-3.293c1.065-1.171,0.817-3.364-0.891-3.725\n  \t\t\t\t\tc-0.501-0.106-1.419-0.083-1.624,0.496c-0.368,1.035,1.867,2.088-0.474,2.527c-1.007,0.189-2.687-0.739-2.177-1.952\n  \t\t\t\t\tc0.211-0.496,3.295-1.36,0.681-2.094c-1.29-0.361-2.628,0.918-2.808,2.1c-0.162,1.118,0.558,1.616,1.069,2.449\n  \t\t\t\t\tc0.615,0.999,0.694,0.634,0.384,1.9c-0.288,1.185-1.593,2.898-0.104,3.827c1.653,1.029,2.146-0.77,2.27-1.886\n  \t\t\t\t\tc0.01-0.13,0.021-0.25,0.04-0.36L426.58,161.499z\"/>\n  \t\t\t\t<path fill=\"#042C44\" d=\"M445.75,170.129c0.805-3,2.252-1.313,4.005-2.822c1.202-1.032,1.227-3.238-0.427-3.805\n  \t\t\t\t\tc-0.484-0.168-1.396-0.257-1.67,0.29c-0.494,0.983,1.593,2.304-0.783,2.452c-1.021,0.063-2.571-1.063-1.919-2.204\n  \t\t\t\t\tc0.271-0.466,3.436-0.945,0.934-1.994c-1.237-0.519-2.724,0.585-3.042,1.739c-0.304,1.088,0.352,1.671,0.76,2.562\n  \t\t\t\t\tc0.486,1.064,0.609,0.713,0.146,1.932c-0.433,1.139-1.938,2.681-0.572,3.785c1.514,1.225,2.222-0.5,2.481-1.593\n  \t\t\t\t\tc0.03-0.12,0.05-0.23,0.08-0.34L445.75,170.129z\"/>\n  \t\t\t\t<path fill=\"#042C44\" d=\"M464.42,180.619c1.456-2.744,2.49-0.776,4.536-1.852c1.402-0.737,1.92-2.881,0.438-3.805\n  \t\t\t\t\tc-0.436-0.271-1.307-0.563-1.695-0.09c-0.699,0.848,1.038,2.601-1.312,2.213c-1.01-0.166-2.27-1.612-1.376-2.577\n  \t\t\t\t\tc0.366-0.395,3.561-0.151,1.355-1.734c-1.09-0.784-2.784-0.039-3.354,1.014c-0.538,0.992-0.03,1.707,0.164,2.666\n  \t\t\t\t\tc0.236,1.146,0.437,0.832-0.286,1.916c-0.679,1.015-2.489,2.179-1.406,3.561c1.202,1.534,2.274,0.013,2.773-0.997\n  \t\t\t\t\tc0.061-0.11,0.11-0.21,0.17-0.31L464.42,180.619z\"/>\n  \t\t\t\t<path fill=\"#0A425E\" d=\"M449.141,181.859c1.22-2.856,2.416-0.981,4.364-2.225c1.337-0.852,1.67-3.032,0.117-3.829\n  \t\t\t\t\tc-0.456-0.234-1.348-0.452-1.696,0.052c-0.63,0.903,1.252,2.504-1.121,2.315c-1.021-0.081-2.397-1.417-1.588-2.452\n  \t\t\t\t\tc0.332-0.426,3.534-0.452,1.205-1.843c-1.149-0.688-2.776,0.196-3.259,1.29c-0.452,1.035,0.113,1.705,0.39,2.644\n  \t\t\t\t\tc0.331,1.123,0.504,0.792-0.125,1.934c-0.591,1.066-2.299,2.38-1.104,3.665c1.324,1.429,2.27-0.179,2.684-1.225\n  \t\t\t\t\tc0.051-0.13,0.091-0.24,0.141-0.34L449.141,181.859z\"/>\n  \t\t\t\t<path fill=\"#0A425E\" d=\"M431.41,174.229c0.892-2.974,2.29-1.246,4.087-2.701c1.231-0.996,1.319-3.2-0.313-3.817\n  \t\t\t\t\tc-0.479-0.181-1.392-0.296-1.681,0.243c-0.521,0.968,1.525,2.347-0.853,2.427c-1.025,0.033-2.544-1.141-1.855-2.26\n  \t\t\t\t\tc0.284-0.457,3.461-0.845,0.99-1.966c-1.223-0.557-2.736,0.507-3.091,1.648c-0.335,1.079,0.304,1.681,0.684,2.585\n  \t\t\t\t\tc0.455,1.078,0.589,0.729,0.091,1.934c-0.467,1.128-2.015,2.624-0.686,3.767c1.479,1.271,2.237-0.433,2.529-1.52\n  \t\t\t\t\tc0.03-0.11,0.06-0.22,0.1-0.33L431.41,174.229z\"/>\n  \t\t\t\t<path fill=\"#0A425E\" d=\"M414.33,165.519c0.525-3.062,2.125-1.513,3.732-3.174c1.104-1.138,0.925-3.336-0.771-3.752\n  \t\t\t\t\tc-0.496-0.12-1.412-0.127-1.637,0.443c-0.4,1.024,1.797,2.147-0.555,2.512c-1.014,0.156-2.662-0.826-2.113-2.02\n  \t\t\t\t\tc0.228-0.489,3.334-1.255,0.748-2.072c-1.279-0.405-2.656,0.834-2.871,2.01c-0.202,1.111,0.502,1.631,0.987,2.482\n  \t\t\t\t\tc0.583,1.018,0.673,0.654,0.323,1.911c-0.328,1.174-1.685,2.846-0.226,3.821c1.617,1.083,2.166-0.699,2.328-1.813\n  \t\t\t\t\tc0-0.12,0.021-0.24,0.04-0.35L414.33,165.519z\"/>\n  \t\t\t\t<path fill=\"#042C44\" d=\"M439.301,183.779c0.43-3.076,2.072-1.581,3.627-3.292c1.068-1.17,0.819-3.362-0.89-3.725\n  \t\t\t\t\tc-0.502-0.105-1.417-0.082-1.624,0.495c-0.367,1.037,1.865,2.089-0.473,2.53c-1.008,0.188-2.688-0.741-2.176-1.954\n  \t\t\t\t\tc0.209-0.496,3.292-1.36,0.679-2.094c-1.291-0.362-2.628,0.917-2.803,2.102c-0.168,1.117,0.553,1.614,1.064,2.447\n  \t\t\t\t\tc0.615,0.999,0.694,0.635,0.384,1.899c-0.287,1.187-1.592,2.899-0.102,3.827c1.651,1.03,2.145-0.768,2.267-1.886\n  \t\t\t\t\tc0.011-0.14,0.021-0.25,0.03-0.36L439.301,183.779z\"/>\n  \t\t\t\t<path fill=\"#0A425E\" d=\"M452.48,197.458c1.22-2.857,2.416-0.982,4.365-2.225c1.336-0.853,1.671-3.033,0.115-3.829\n  \t\t\t\t\tc-0.456-0.234-1.347-0.453-1.694,0.052c-0.63,0.901,1.251,2.503-1.121,2.315c-1.021-0.081-2.398-1.418-1.588-2.453\n  \t\t\t\t\tc0.333-0.425,3.534-0.45,1.204-1.843c-1.151-0.69-2.775,0.196-3.259,1.291c-0.452,1.034,0.113,1.705,0.392,2.644\n  \t\t\t\t\tc0.331,1.124,0.502,0.793-0.129,1.932c-0.589,1.068-2.297,2.381-1.104,3.666c1.325,1.427,2.271-0.18,2.684-1.226\n  \t\t\t\t\tc0.06-0.11,0.1-0.22,0.14-0.33L452.48,197.458z\"/>\n  \t\t\t\t<path fill=\"#0A425E\" d=\"M418.03,177.919c0.528-3.061,2.124-1.513,3.732-3.175c1.103-1.137,0.926-3.334-0.771-3.75\n  \t\t\t\t\tc-0.499-0.122-1.416-0.127-1.64,0.442c-0.401,1.024,1.797,2.147-0.555,2.511c-1.012,0.159-2.662-0.824-2.111-2.019\n  \t\t\t\t\tc0.226-0.49,3.336-1.255,0.747-2.072c-1.282-0.404-2.657,0.833-2.872,2.009c-0.201,1.112,0.504,1.631,0.989,2.482\n  \t\t\t\t\tc0.581,1.017,0.674,0.655,0.322,1.909c-0.33,1.177-1.686,2.848-0.226,3.823c1.616,1.083,2.165-0.698,2.327-1.812\n  \t\t\t\t\tc0.02-0.12,0.03-0.23,0.05-0.34L418.03,177.919z\"/>\n  \t\t\t\t<path fill=\"#042C44\" d=\"M470.46,191.639c1.083-2.913,2.367-1.097,4.253-2.434c1.291-0.915,1.524-3.109-0.068-3.829\n  \t\t\t\t\tc-0.468-0.212-1.366-0.387-1.69,0.132c-0.584,0.933,1.373,2.444-1.008,2.369c-1.023-0.032-2.464-1.301-1.704-2.374\n  \t\t\t\t\tc0.312-0.441,3.508-0.619,1.115-1.898c-1.183-0.632-2.767,0.329-3.19,1.446c-0.403,1.055,0.193,1.696,0.515,2.622\n  \t\t\t\t\tc0.385,1.105,0.54,0.768-0.033,1.938c-0.538,1.094-2.179,2.487-0.926,3.714c1.392,1.361,2.26-0.289,2.621-1.353\n  \t\t\t\t\tc0.04-0.12,0.08-0.24,0.12-0.34L470.46,191.639z\"/>\n  \t\t\t\t<path fill=\"#042C44\" d=\"M394.331,149.979c0.43-3.075,2.076-1.579,3.63-3.291c1.065-1.171,0.818-3.363-0.893-3.724\n  \t\t\t\t\tc-0.501-0.107-1.417-0.084-1.624,0.493c-0.368,1.036,1.867,2.09-0.473,2.53c-1.006,0.188-2.685-0.739-2.173-1.952\n  \t\t\t\t\tc0.207-0.497,3.292-1.359,0.678-2.092c-1.292-0.364-2.629,0.915-2.805,2.099c-0.166,1.118,0.555,1.614,1.069,2.449\n  \t\t\t\t\tc0.613,0.997,0.694,0.634,0.384,1.9c-0.29,1.184-1.594,2.897-0.104,3.826c1.653,1.03,2.145-0.769,2.268-1.887\n  \t\t\t\t\tc0-0.13,0.01-0.25,0.03-0.36L394.331,149.979z\"/>\n  \t\t\t\t<path fill=\"#042C44\" d=\"M396.121,165.179c0.804-3,2.252-1.313,4.007-2.821c1.2-1.033,1.224-3.238-0.426-3.805\n  \t\t\t\t\tc-0.485-0.167-1.396-0.257-1.674,0.29c-0.493,0.983,1.595,2.302-0.78,2.452c-1.023,0.063-2.574-1.064-1.918-2.205\n  \t\t\t\t\tc0.268-0.466,3.435-0.945,0.932-1.994c-1.239-0.52-2.723,0.585-3.042,1.739c-0.302,1.088,0.352,1.671,0.757,2.562\n  \t\t\t\t\tc0.488,1.065,0.61,0.714,0.148,1.93c-0.433,1.142-1.936,2.683-0.574,3.786c1.515,1.226,2.222-0.5,2.483-1.594\n  \t\t\t\t\tc0.021-0.14,0.051-0.25,0.08-0.36L396.121,165.179z\"/>\n  \t\t\t\t<polygon fill=\"url(#SVGID_30_)\" points=\"259.412,27.03 463.08,19.16 449.7,23.208 \t\t\"/>\n  \t\t\t\t\n  \t\t\t\t\t<linearGradient id=\"SVGID_30_\" gradientUnits=\"userSpaceOnUse\" x1=\"3.8701\" y1=\"526.6646\" x2=\"155.9897\" y2=\"526.6646\" gradientTransform=\"matrix(1 0 0 -1 244.0019 651.436)\">\n  \t\t\t\t\t<stop  offset=\"0\" style=\"stop-color:#B2B2B2\"/>\n  \t\t\t\t\t<stop  offset=\"0.3086\" style=\"stop-color:#B0B0B0\"/>\n  \t\t\t\t\t<stop  offset=\"0.4602\" style=\"stop-color:#A8A8A8\"/>\n  \t\t\t\t\t<stop  offset=\"0.5775\" style=\"stop-color:#9B9B9B\"/>\n  \t\t\t\t\t<stop  offset=\"0.6773\" style=\"stop-color:#888888\"/>\n  \t\t\t\t\t<stop  offset=\"0.7659\" style=\"stop-color:#707070\"/>\n  \t\t\t\t\t<stop  offset=\"0.8465\" style=\"stop-color:#525252\"/>\n  \t\t\t\t\t<stop  offset=\"0.9213\" style=\"stop-color:#2F2F2F\"/>\n  \t\t\t\t\t<stop  offset=\"0.9894\" style=\"stop-color:#070707\"/>\n  \t\t\t\t\t<stop  offset=\"1\" style=\"stop-color:#000000\"/>\n  \t\t\t\t</linearGradient>\n  \t\t\t\t<polygon fill=\"url(#SVGID_30_)\" points=\"247.872,54.521 396.131,195.029 399.99,193.749 \t\t\"/>\n  \t\t\t\t<path fill=\"#4691B7\" stroke=\"#4CC0D3\" stroke-width=\"0.7138\" d=\"M467.08,41.197c-5.38,7.345-10.932,15.151-17.713,21.289\n  \t\t\t\t\tc-3.567,3.228-8.013,7.208-13.042,7.583c-0.241,2.214,1.114,4.819,3.67,3.87c0.976-0.362,2.061-1.001,2.945-1.55\n  \t\t\t\t\tc6.511-4.043,11.225-8.871,16.333-14.602c3.828-4.292,7.49-8.576,10.96-13.16c2.573-3.404,4.86-6.735,7.083-10.357\n  \t\t\t\t\tc0.97-1.582,1.855-3.669,3.031-5.065c0.967-1.149,1.476-1.223,3.063-0.743c-3.653,11.084-9.701,22.252-15.748,32.218\n  \t\t\t\t\tc-2.624,4.322-5.408,8.462-8.495,12.454c-0.993,1.282-1.627,3.777,1.086,3.684c2.005-0.07,5.241-5.72,6.294-7.201\n  \t\t\t\t\tc6.183-8.704,10.922-18.364,15.938-27.691c1.043-1.941,4.896-11.374,7.905-9.978c0.56,2.296-1.965,5.825-2.788,7.891\n  \t\t\t\t\tc-1.668,4.186-2.791,8.528-4.43,12.733c-1.74,4.473-3.606,8.92-5.247,13.413c-1.006,2.764-2.631,5.707-3.054,8.638\n  \t\t\t\t\tc-0.216,1.501-0.038,4.703,2.349,4.27c1.579-0.286,1.96-3.307,2.451-4.709c3.056-8.782,5.854-17.87,9.538-26.4\n  \t\t\t\t\tc1.417-3.285,2.207-8.405,4.494-11.159c1.752-2.109,4.06-1.559,3.539,1.351c-0.6,3.343-1.695,6.668-2.525,9.966\n  \t\t\t\t\tc-2.036,8.093-3.212,16.788-4.473,24.879c-0.414,2.654-0.281,4.777-0.057,7.371c0.192,2.219-0.187,4.208,0.317,6.415\n  \t\t\t\t\tc0.464,2.037,1.333,3.753,3.607,2.36c2.261-1.382,0.592-3.697,0.368-5.885c-0.831-8.119,0.83-16.491,2.319-24.451\n  \t\t\t\t\tc0.859-4.607,1.979-9.16,3.276-13.66c0.47-1.631,2.063-8.56,5.322-5.311c1.689,1.685-0.555,5.964-0.937,7.906\n  \t\t\t\t\tc-1.676,8.553-3.109,17.016-3.383,25.731c-0.156,4.977,0.258,10.221,1.29,15.115c0.314,1.492,0.709,3.028,1.116,4.427\n  \t\t\t\t\tc0.457,1.57,1.576,2.589,2.07,4.092c3.65,0.039,4.093-2,2.82-4.754c-1.969-4.26-2.89-9.601-3.543-14.261\n  \t\t\t\t\tc-1.129-8.069-0.179-16.281,2.103-24.071c0.55-1.88,1.178-3.738,1.867-5.572c0.536-1.421,2.187-3.818,2.207-5.283\n  \t\t\t\t\tc0.037-2.611-4.038-4.096-5.847-5.216c-3.205-1.987-6.232-4-9.731-5.366c-3.972-1.549-7.824-3.605-12.008-4.606\n  \t\t\t\t\tc-1.786-0.428-5.742-1.424-7.367-0.832c-1.286,0.469-1.021,1.416-1.538,2.405c-0.524,0.998-1.165,1.732-1.827,2.675\n  \t\t\t\t\tc-2.05,2.927-3.49,6.249-5.62,9.147H467.08z\"/>\n  \t\t\t\t<circle fill=\"#FFEBB8\" stroke=\"#FF7F00\" stroke-width=\"1.5207\" cx=\"482.21\" cy=\"127.579\" r=\"9.293\"/>\n  \t\t\t\t<circle fill=\"#FFEBB8\" stroke=\"#FF7F00\" stroke-width=\"1.5207\" cx=\"468.641\" cy=\"99.981\" r=\"9.293\"/>\n  \t\t\t\t<circle fill=\"#FFEBB8\" stroke=\"#FF7F00\" stroke-width=\"1.5207\" cx=\"422.62\" cy=\"95.859\" r=\"8.448\"/>\n  \t\t\t\t<circle fill=\"#FFEBB8\" stroke=\"#FF7F00\" stroke-width=\"1.5207\" cx=\"439.811\" cy=\"113.039\" r=\"7.435\"/>\n  \t\t\t\t<circle fill=\"#FFEBB8\" stroke=\"#FF7F00\" stroke-width=\"1.5207\" cx=\"462.101\" cy=\"131.309\" r=\"5.408\"/>\n  \t\t\t\t<circle fill=\"#FFEBB8\" stroke=\"#FF7F00\" stroke-width=\"1.5207\" cx=\"488.48\" cy=\"153.499\" r=\"7.097\"/>\n  \t\t\t\t<circle fill=\"#FFEBB8\" stroke=\"#FF7F00\" stroke-width=\"1.5207\" cx=\"446.78\" cy=\"90.059\" r=\"8.279\"/>\n  \t\t\t\t<circle fill=\"#FFEBB8\" stroke=\"#FF7F00\" stroke-width=\"1.5207\" cx=\"493.03\" cy=\"103.089\" r=\"6.378\"/>\n  \t\t\t\t<path fill=\"#FCA454\" d=\"M513.2,39.955c2.084,1.514,4.143,3.105,6.185,4.769c-0.699,5.529-3.179,11.401-3.417,17.568\n  \t\t\t\t\tc-0.659,17.135,2.096,33.275,5.799,49.941c1.271,5.719,2.692,11.161,3.526,16.897c1.028,7.094,2.707,14.898,0.523,21.94\n  \t\t\t\t\tc-2.369,7.645-9.271,14.931-16.015,18.969c-5.083,3.043-10.933,4.328-16.751,2.936c-1.416-0.338-2.816-0.752-4.185-1.258\n  \t\t\t\t\tc-5.028-1.858-7.031-5.014-10.752-8.263c-4.021-3.515-8.028-7.124-12.396-10.209c-6.377-4.504-13.177-8.522-20.466-11.36\n  \t\t\t\t\tc-3.682-1.433-7.42-2.417-11.287-3.198c-5.616-1.135-11.603-1.547-17.145-3.003c-6.747-1.77-13.729-1.874-19.161-6.648\n  \t\t\t\t\tc-7.354-6.466-10.951-18.276-7.407-27.701c6.219-16.539,28.809-27.853,42.778-36.841c8.449-5.438,16.895-10.705,23.921-17.755\n  \t\t\t\t\tc1.989-1.997,3.9-3.411,5.162-5.993c2.203-4.504,2.009-11.385,5.283-15.208c3.312-3.865,8.214-2.383,12.441-1.377\n  \t\t\t\t\tc12.65,2.998,23.33,8.481,33.39,15.789L513.2,39.955z M508.189,77.026c-0.557-1.684-1.309-3.335-2.234-5.226\n  \t\t\t\t\tc-2.525-5.151-5.008-10.585-9.398-14.448c-6.595-5.805-17.861-9.962-26.429-7.463c-10.212,2.983-18.25,8.564-26.896,14.603\n  \t\t\t\t\tc-8.423,5.883-16.812,11.792-25.071,17.859c-7.262,5.333-16,10.224-20.244,18.499c-5.971,11.639-1.744,23.256,10.318,28.13\n  \t\t\t\t\tc1.767,0.712,3.96,0.367,5.611,1.516c1.978,1.376,1.964,3.61-0.881,3.664c4.681,0.579,9.335,1.353,13.841,2.789\n  \t\t\t\t\tc0.492-3.625,7.632-0.966,10.199-0.495c3.954,0.724,7.771,1.612,11.513,3.145c4.022,1.648,7.589,4.142,11.228,6.479\n  \t\t\t\t\tc3.811,2.449,7.608,4.583,11.057,7.591c3.293,2.873,6.19,6.557,9.724,9.113c4.116,2.979,8.214,6.753,13.392,7.666\n  \t\t\t\t\tc4.284,0.755,9.662-1.746,12.922-4.447c6.592-5.462,8.134-14.024,8.004-22.086c-0.135-8.371-1.732-16.302-2.353-24.633\n  \t\t\t\t\tc-0.544-7.313-1.764-14.51-2.484-21.816c-0.468-4.731-0.525-9.488-0.715-14.235c-0.101-2.362-0.48-4.302-1.11-6.202\n  \t\t\t\t\tL508.189,77.026z\"/>\n  \t\t\t\t\n  \t\t\t\t\t<ellipse transform=\"matrix(0.6586 -0.7525 0.7525 0.6586 47.3762 361.2766)\" fill=\"#FFEBB8\" cx=\"421.845\" cy=\"128.426\" rx=\"9.44\" ry=\"9.969\"/>\n  \t\t\t\t<path fill=\"#FF7F00\" d=\"M422.5,120.459c3.271,0.099,6.081,2.691,6.37,5.827c0.386,4.204-1.026,6.852-3.309,10.274\n  \t\t\t\t\tc2.96,3.75,6.088-5.105,6.212-7.059c0.245-3.886-2.26-8.931-6.002-10.557c-3.852-1.672-8.584-0.901-11.479,2.34\n  \t\t\t\t\tc-1.849,2.068-2.685,4.647-2.427,7.392c0.169,1.804,0.27,5.616,2.56,6.3c2.927,0.872,0.751-2.36,0.369-3.257\n  \t\t\t\t\tc-0.691-1.627-0.732-3.444-0.257-5.135c1-3.52,4.24-6.24,7.971-6.12L422.5,120.459z\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"441.98,113.949 440.471,115.809 438.11,115.439 \n  \t\t\t\t\t437.24,113.209 438.75,111.339 441.11,111.709 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"489.98,151.639 488.48,153.499 486.11,153.129 \n  \t\t\t\t\t485.25,150.899 486.76,149.039 489.12,149.409 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"428.08,95.756 426.57,97.62 424.21,97.25 423.341,95.018 \n  \t\t\t\t\t424.851,93.153 427.21,93.523 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"413.94,144.449 412.431,146.319 410.061,145.949 \n  \t\t\t\t\t409.2,143.719 410.711,141.849 413.07,142.219 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"447.67,86.069 446.16,87.934 443.801,87.563 \n  \t\t\t\t\t442.94,85.332 444.44,83.467 446.811,83.836 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"421.86,129.809 420.351,131.669 417.99,131.299 \n  \t\t\t\t\t417.131,129.069 418.631,127.199 421,127.579 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"441.76,110.689 440.261,112.549 437.891,112.179 \n  \t\t\t\t\t437.03,109.949 438.53,108.079 440.9,108.459 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"491.71,156.099 490.21,157.969 487.84,157.599 \n  \t\t\t\t\t486.98,155.369 488.48,153.499 490.85,153.869 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"466.83,132.049 465.32,133.909 462.96,133.539 \n  \t\t\t\t\t462.101,131.309 463.601,129.449 465.96,129.819 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"467.79,100.009 466.29,101.869 463.92,101.5 \n  \t\t\t\t\t463.061,99.271 464.561,97.406 466.93,97.776 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"497.76,103.829 496.26,105.689 493.89,105.319 \n  \t\t\t\t\t493.03,103.089 494.53,101.219 496.9,101.589 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"472.84,104.509 471.34,106.379 468.97,106.009 \n  \t\t\t\t\t468.11,103.77 469.61,101.909 471.98,102.279 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"486.07,126.079 484.57,127.949 482.21,127.579 \n  \t\t\t\t\t481.34,125.339 482.84,123.479 485.21,123.849 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"450.91,89.953 449.4,91.817 447.04,91.446 \n  \t\t\t\t\t446.181,89.214 447.681,87.351 450.04,87.719 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"425.71,126.089 424.21,127.959 421.851,127.589 \n  \t\t\t\t\t420.98,125.359 422.48,123.489 424.851,123.859 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"463.04,131.909 461.54,133.769 459.17,133.399 \n  \t\t\t\t\t458.311,131.169 459.811,129.309 462.18,129.679 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"429.95,155.659 428.45,157.519 426.091,157.149 \n  \t\t\t\t\t425.221,154.919 426.73,153.059 429.09,153.429 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"421.851,94.75 420.351,96.615 417.98,96.246 \n  \t\t\t\t\t417.12,94.011 418.62,92.148 420.99,92.518 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"473.07,98.292 471.57,100.159 469.2,99.784 \n  \t\t\t\t\t468.34,97.552 469.84,95.688 472.21,96.058 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"424.66,100.02 423.16,101.889 420.79,101.52 \n  \t\t\t\t\t419.931,99.284 421.431,97.421 423.801,97.791 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"447.9,93.679 446.4,95.543 444.04,95.174 443.181,92.941 \n  \t\t\t\t\t444.681,91.077 447.04,91.446 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"486.43,131.459 484.93,133.319 482.56,132.949 \n  \t\t\t\t\t481.7,130.719 483.2,128.859 485.57,129.229 \t\t\"/>\n  \t\t\t\t<polygon fill=\"#00A33D\" stroke=\"#FFBF00\" stroke-width=\"0.7138\" points=\"480.22,129.849 478.72,131.709 476.35,131.339 \n  \t\t\t\t\t475.49,129.109 476.99,127.239 479.36,127.609 \t\t\"/>\n  \t\t\t\t<path fill=\"none\" stroke=\"#3F3F3F\" stroke-width=\"3.5691\" d=\"M514.27,39.201c43.583,31.018,53.77,91.497,22.751,135.079\n  \t\t\t\t\tc-31.018,43.586-91.496,53.771-135.079,22.753c-43.586-31.019-53.772-91.497-22.753-135.079\n  \t\t\t\t\tc31.021-43.582,91.5-53.769,135.079-22.749L514.27,39.201z\"/>\n  \t\t\t</g>\n\n  \t\t\t<!-- labels -->\n  \t\t\t<g>\n  \t\t\t\t<!-- Microtubules & neurofibrils -->\n          <g class='label {{( info === \"microtubules\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:microtubules'>\n            <line x1=\"330\" y1=\"80\" x2=\"461\" y2=\"73\" class='outline'/>\n            <line x1=\"330\" y1=\"80\" x2=\"461\" y2=\"73\"/>\n\n            <g transform='translate(210, 70)'>\n              <rect class='label-bg' x='-9' y='-12' width='170' height='64' rx='5' ry='5'/>\n              <text>Microtubules &amp;</text> \n              <text y='24'>neurofibrils</text>\n            </g>\n          </g>\n\n          <!-- Neurotransmitter -->\n          <g class='label {{( info === \"neurotransmitter\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:neurotransmitter'>\n            <line x1=\"340\" y1=\"160\" x2=\"397\" y2=\"147\" class='outline'/>\n            <line x1=\"340\" y1=\"160\" x2=\"397\" y2=\"147\"/>\n\n            <g transform='translate(190, 150)'>\n              <rect class='label-bg' x='-9' y='-12' width='190' height='39' rx='5' ry='5'/>\n              <text>Neurotransmitter</text>\n            </g>\n          </g>\n\n          <!-- Receptors -->\n          <g class='label {{( info === \"receptors\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:receptors'>\n            <polyline points='390,165 350,210 425,185' class='outline'/>\n            <polyline points='390,165 350,210 425,185'/>\n\n            <g transform='translate(260, 200)'>\n              <rect class='label-bg' x='-9' y='-12' width='120' height='39' rx='5' ry='5'/>\n              <text>Receptors</text>\n  \t\t\t\t\t</g>\n  \t\t\t\t</g>\n\n  \t\t\t\t<!-- Synaptic vesicles -->\n          <g class='label {{( info === \"synaptic_vesicles\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:synaptic_vesicles'>\n  \t\t\t\t\t<line x1=\"590\" y1=\"85\" x2=\"492\" y2=\"123\" class='outline'/>\n            <line x1=\"590\" y1=\"85\" x2=\"492\" y2=\"123\"/>\n\n            <g transform='translate(566, 78)'>\n              <rect class='label-bg' x='-9' y='-12' width='190' height='39' rx='5' ry='5'/>\n              <text>Synaptic vesicles</text>\n  \t\t\t\t\t</g>\n  \t\t\t\t</g>\n\n  \t\t\t\t<!-- Synaptic cleft -->\n          <g class='label {{( info === \"synaptic_cleft\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:synaptic_cleft'>\n  \t\t\t\t\t<line x1=\"563\" y1=\"160\" x2=\"456\" y2=\"155\" class='outline'/>\n            <line x1=\"563\" y1=\"160\" x2=\"456\" y2=\"155\"/>\n\n            <g transform='translate(566, 150)'>\n              <rect class='label-bg' x='-9' y='-12' width='155' height='39' rx='5' ry='5'/>\n              <text>Synaptic cleft</text>\n  \t\t\t\t\t</g>\n  \t\t\t\t</g>\n\n  \t\t\t\t<circle fill=\"none\" stroke=\"#000000\" stroke-width=\"1.5562\" cx=\"239.191\" cy=\"35.807\" r=\"14.671\"/>\n  \t\t\t</g>\n  \t\t</g>\n  \t</g>\n\n  \t<g id=\"hotspots\" class='{{( showLabels ? \"visible\" : \"hidden\" )}}'>\n  \t\t<g class='hotspot' proxy-tap='showCloseUp:axon'>\n  \t\t\t<path d=\"M757.188,131.592c2.539,1.987,4.214,4.549,5.725,7.328\n  \t\t\t\tc0.6,1.102,1.05,1.992,2.088,2.791c0.308,0.237,4.354,1.83,4.212,1.281c-0.845-3.266,4.817-5.336,6.787-2.663\n  \t\t\t\tc0.159,0.215,0.373-3.079,0.185-3.6c-0.651-1.801-2.022-3.457-3.406-4.746c-1.19-1.09-2.47-2.12-3.761-3.14l0.011-0.004\n  \t\t\t\tc-0.962-0.757-1.929-1.505-2.859-2.264c-2.813-2.293-10.685-8.917-12.849-2.546C751.959,128.037,754.504,129.491,757.188,131.592z\"/>\n  \t\t\t<path d=\"M547.168,255.538c-15.178,1.752-30.301-0.023-45.441-1.129\n  \t\t\t\tc-0.09,0-0.189-0.01-0.279-0.02l0.003-0.001c-7.274-0.558-13.604-2.118-20.983-1.74c-6.055,0.311-15.454-0.279-18.903,4.875\n  \t\t\t\tc-3.031,4.528,1.17,8.634,6.229,9.306c5.78,0.768,8.914-0.355,12.13,5.24c2.205,3.837,2.595,8.979,0.685,13.05\n  \t\t\t\tc-0.886,1.884-2.311,4.075-4.035,5.386c-2.279,1.731-5.333,1.073-7.329,2.266c-5.302,3.168,0.073,8.966,4.481,10.679\n  \t\t\t\tc4.18,1.624,8.209,0.429,12.653,0.104c8.512-0.616,17.034-1.285,25.561-1.721c8.741-0.445,14.903,0.349,23.153,1.604\n  \t\t\t\tc10.73,1.634,29.025,2.971,37.169-3.367c10.564-8.226,14.27-25.689,5.681-35.542C571.224,256.819,558.045,254.282,547.168,255.538 z\"/>\n  \t\t\t<path d=\"M671.176,260.057c-13.101-1.515-27.895,4.888-41.497,5.651\n  \t\t\t\tc-2.47,0.18-4.93,0.21-7.39,0.18v-0.03c-7.555-0.089-15.043-0.811-22.593-1.176c-3.637-0.176-7.964-0.314-11.514,0.28\n  \t\t\t\tc-1.726,0.289-2.616-0.204-4.134,1.265c-0.355,0.343-2.075,4.229-1.532,4.242c10.759,0.257,10.891,11.57,8.995,19.553\n  \t\t\t\tc-1.132,4.76-3.997,6.75-6.571,10.503c1.716,2.04,7.247,5.49,9.723,6.408c4.18,1.551,8.209,0.408,12.653,0.102\n  \t\t\t\tc8.998-0.623,17.646-3.312,26.568-4.396c8.661-1.052,16.757-5.299,25.565-6.116c4.541-0.421,8.973-0.635,13.523-0.979\n  \t\t\t\tc9.597-0.725,16.097-2.417,16.054-13.396C688.983,270.965,687.263,261.917,671.176,260.057z\"/>\n  \t\t\t<path stroke=\"#231F20\" stroke-width=\"2\" stroke-miterlimit=\"10\" d=\"\n  \t\t\t\tM796.307,180.348c-0.1-0.862-0.12-1.934-0.142-3.069c-0.047-2.504-0.101-5.342-1.03-7.749l-0.001,0\n  \t\t\t\tc-0.127-0.325-0.267-0.638-0.419-0.932c-0.43-0.834-0.958-1.593-1.57-2.266c1.43-2.763-0.262-6.492-2.284-10.392\n  \t\t\t\tc-0.201-0.388-0.368-0.704-0.465-0.917c-0.564-1.247-1.026-2.525-1.515-3.878c-1.176-3.257-2.392-6.625-5.134-9.616\n  \t\t\t\tc-0.826-0.89-1.728-1.659-2.68-2.286l-0.001,0.001c-0.593-0.387-1.203-0.711-1.823-0.984c0.016-1.114-0.083-2.125-0.237-2.553\n  \t\t\t\tc-0.913-2.524-2.779-4.613-4.201-5.938c-0.014-0.012-0.026-0.024-0.04-0.036l0.167-0.068l-4.758-3.743\n  \t\t\t\tc-0.712-0.557-1.421-1.112-2.109-1.674l-0.204-0.167c-3.656-2.986-7.546-5.749-11.222-5.749c-2.894,0-5.138,1.724-6.159,4.73\n  \t\t\t\tc-1.933,5.691,1.744,8.503,4.177,10.364l0.684,0.527c2.232,1.747,3.692,4.107,4.938,6.398l0.089,0.165\n  \t\t\t\tc0.616,1.137,1.315,2.425,2.802,3.568c0.368,0.284,1.405,0.768,2.546,1.19c-0.223,2.727,1.413,4.944,2.515,6.428\n  \t\t\t\tc0.216,0.292,0.434,0.584,0.639,0.879c1.938,2.793,4.147,7.233,3.996,10.548c-0.024,0.538-0.108,1.084-0.189,1.614\n  \t\t\t\tc-0.174,1.135-0.501,3.273,0.648,4.962c-0.955,2.341-0.933,4.782-0.912,7.012c0.012,1.177,0.021,2.288-0.099,3.366\n  \t\t\t\tc-0.237,2.122-0.688,4.146-1.504,6.767c-0.89,2.858-1.453,5.347-1.683,7.428c-3.205,2.187-4.782,5.883-6.085,8.937\n  \t\t\t\tc-0.521,1.221-1.013,2.374-1.543,3.306c-1.944,3.416-4.577,6.753-6.653,9.278c-2.295,2.79-5.063,5.979-8.206,8.473\n  \t\t\t\tc-0.318,0.252-0.639,0.488-0.945,0.714c-1.14,0.838-2.494,1.836-3.137,3.32c-0.626-0.074-1.245-0.11-1.861-0.11\n  \t\t\t\tc-1.05,0-2.097,0.112-3.113,0.332v-0.003c-5.305,1.153-7.863,4.449-10.121,7.356c-1.083,1.396-2.106,2.714-3.421,3.837\n  \t\t\t\tc-2.147,1.834-4.716,3.215-7.436,4.678c-0.584,0.313-1.166,0.626-1.743,0.944c-4.711,2.589-9.808,4.169-15.204,5.841l-2.306,0.718\n  \t\t\t\tc-1.81,0.57-11.172,4.652-11.984,10.308c-0.002,0.011-0.003,0.022-0.004,0.033c-3.039-2.564-7.447-4.426-13.843-5.166\n  \t\t\t\tc-1.439-0.167-2.963-0.251-4.528-0.251c-6.754,0-13.775,1.549-20.566,3.047c-5.651,1.247-11.496,2.536-16.966,2.843\n  \t\t\t\tc-1.348,0.099-2.787,0.156-4.371,0.175l-2.765-0.033c-4.743-0.056-9.582-0.374-14.262-0.681c-2.688-0.176-5.466-0.359-8.222-0.492\n  \t\t\t\tc-1.582-0.076-3.456-0.155-5.36-0.155c-2.672,0-4.894,0.155-6.793,0.473c-0.304,0.051-0.591,0.065-0.923,0.081\n  \t\t\t\tc-1.221,0.059-2.893,0.14-4.8,1.985c-0.07,0.068-0.174,0.198-0.298,0.375c-0.452-0.656-0.939-1.287-1.464-1.888\n  \t\t\t\tc-5.634-6.464-15.969-10.324-27.645-10.324c-1.934,0-3.863,0.109-5.734,0.326c-4.186,0.483-8.581,0.718-13.438,0.718\n  \t\t\t\tc-8.023,0-16.232-0.658-24.172-1.293c-2.422-0.194-4.846-0.388-7.269-0.565l-0.048-0.008h-0.109l-0.052,0.447l-0.057-0.458\n  \t\t\t\tc-2.478-0.19-4.903-0.508-7.249-0.816c-3.717-0.487-7.561-0.991-11.649-0.991c-0.812,0-1.633,0.02-2.469,0.062\n  \t\t\t\tc-0.85,0.043-1.767,0.069-2.725,0.095c-6.551,0.182-14.703,0.408-18.518,6.107c-1.695,2.533-1.995,5.332-0.843,7.882\n  \t\t\t\tc1.438,3.182,4.952,5.506,9.17,6.066c1.254,0.167,2.379,0.25,3.372,0.323c3.671,0.271,4.778,0.352,6.553,3.438\n  \t\t\t\tc1.775,3.091,2.005,7.222,0.57,10.279c-0.866,1.842-2.038,3.439-3.135,4.273c-0.653,0.496-1.66,0.647-2.826,0.822\n  \t\t\t\tc-1.327,0.198-2.83,0.423-4.228,1.258c-3.467,2.072-3.77,4.94-3.641,6.466c0.354,4.198,4.682,8.071,8.574,9.583\n  \t\t\t\tc1.795,0.698,3.719,1.037,5.881,1.037c1.718,0,3.398-0.209,5.023-0.41c1.003-0.124,2.039-0.252,3.053-0.326l4.649-0.34\n  \t\t\t\tc6.837-0.503,13.905-1.022,20.847-1.377c1.6-0.081,3.107-0.121,4.61-0.121c6.3,0,11.628,0.734,17.939,1.694\n  \t\t\t\tc4.165,0.634,10.525,1.391,17.167,1.391c0.001,0,0.001,0,0.002,0c10.226,0,17.728-1.803,22.294-5.356\n  \t\t\t\tc6.363-4.955,10.648-12.962,11.465-21.421c0.233-2.421,0.162-4.771-0.187-7.009c0.935,0.37,1.695,0.927,2.283,1.689\n  \t\t\t\tc2.348,3.045,2.019,9.039,0.928,13.632c-0.627,2.638-1.939,4.225-3.601,6.233c-0.782,0.946-1.67,2.019-2.525,3.267l-1.291,1.882\n  \t\t\t\tl1.469,1.746c2.173,2.584,8.195,6.26,10.975,7.29c1.782,0.661,3.691,0.982,5.837,0.982c1.707,0,3.38-0.197,4.998-0.389\n  \t\t\t\tc1.007-0.118,2.048-0.241,3.069-0.312c5.258-0.364,10.39-1.405,15.354-2.412c3.729-0.757,7.584-1.539,11.369-1.998\n  \t\t\t\tc4.424-0.537,8.654-1.842,12.746-3.103c4.353-1.342,8.465-2.609,12.735-3.005c2.773-0.257,5.579-0.44,8.291-0.618\n  \t\t\t\tc1.719-0.112,3.441-0.225,5.181-0.356c9.557-0.722,18.882-2.583,18.828-16.399c-0.018-4.482-0.3-9.117-1.907-13.182\n  \t\t\t\tc0.907,0.258,1.841,0.349,2.705,0.43c0.709,0.066,1.68,0.158,2.037,0.342c1.999,1.03,3.692,3.32,4.647,6.288\n  \t\t\t\tc0.504,1.559,0.557,3.443,0.159,4.414c-0.159,0.22-0.869,0.631-1.293,0.877c-1.029,0.597-2.31,1.339-2.97,2.724\n  \t\t\t\tc-1.369,2.87-0.804,4.823-0.089,5.957c0.743,1.178,2.352,2.582,5.794,2.582c2.643,0,6.066-0.866,7.964-2.014\n  \t\t\t\tc4.346-2.629,8.933-5.131,13.368-7.551c6.962-3.798,14.161-7.725,20.786-12.323c0.828-0.575,1.753-1.188,2.734-1.839\n  \t\t\t\tc5.953-3.948,13.926-9.236,16.151-16.133c2.216-0.099,4.665-0.949,5.465-1.288c5.499-2.333,8.463-7.915,10.844-12.399l0.482-0.906\n  \t\t\t\tc1.174-2.192,2.507-4.314,3.795-6.366c1.994-3.176,4.057-6.459,5.627-10.132c0.506-1.184,1.111-2.326,1.753-3.535\n  \t\t\t\tc1.796-3.387,3.787-7.139,3.198-11.749c3.338-2.486,3.303-7.462,3.281-10.646c-0.005-0.749-0.01-1.457,0.022-2.006\n  \t\t\t\tC796.88,188.769,796.792,184.532,796.307,180.348z\"/>\n  \t\t\t<path d=\"M793.326,180.691c-0.34-2.95,0.13-7.18-0.99-10.08\n  \t\t\t\tl0.002,0.008c-0.087-0.224-0.183-0.439-0.29-0.646c-2.318-4.5-8.19-5.229-12.202-3.093c0.868-0.951,1.804-1.887,2.116-2.037\n  \t\t\t\tc0.941-0.452,1.963-0.706,3.013-0.633c1.346,0.093,2.351,1.324,3.463,1.464c5.071,0.644,0.046-7.603-0.774-9.412\n  \t\t\t\tc-1.991-4.396-2.756-9.028-6.115-12.691c-0.659-0.71-1.37-1.32-2.13-1.82l0.01,0.009c-3.35-2.189-7.526-2.153-10.062,1.92\n  \t\t\t\tc-1.787,2.871,0.409,4.948,1.968,7.195c2.296,3.31,4.715,8.291,4.528,12.396c-0.132,2.861-1.389,4.852,1.453,5.608\n  \t\t\t\tc-2.787,3.208-1.55,7.326-2.021,11.542c-0.287,2.567-0.852,4.856-1.621,7.325c-0.337,1.083-1.617,5.217-1.664,8.355\n  \t\t\t\tc-4.548,1.985-5.695,8.026-7.903,11.908c-1.921,3.375-4.426,6.638-6.943,9.7c-2.624,3.191-5.443,6.366-8.658,8.917\n  \t\t\t\tc-2.303,1.828-4.715,2.855-2.341,5.325c0.256,0.267,0.492,0.474,0.717,0.65c-0.534-0.234-1.064-0.442-1.584-0.613\n  \t\t\t\tc-2.739-0.89-5.04-0.97-7.1-0.52l0.022-0.008c-6.482,1.409-7.755,6.719-12.23,10.543c-2.889,2.468-6.376,4.153-9.682,5.97\n  \t\t\t\tc-5.684,3.124-11.905,4.859-18.055,6.792c-2.914,0.917-14.226,6.882-8.203,10.917c1.457,0.976,4.395,0.455,6.188,1.38\n  \t\t\t\tc3.095,1.595,5.102,4.847,6.127,8.031c0.645,1.994,0.837,4.642,0.04,6.556c-0.776,1.868-3.701,2.438-4.29,3.674\n  \t\t\t\tc-2.927,6.136,6.741,4.28,9.408,2.666c11.203-6.777,23.301-12.348,33.996-19.771c5.969-4.143,16.876-10.258,18.086-17.855\n  \t\t\t\tc1.114-6.985-5.233-13.91-11.415-17.134c1.21,0.171,2.183-0.85,3.981-1.212c3.681-0.74,7.442,2.223,9.425,5.008\n  \t\t\t\tc1.625,2.284,1.459,4.792,0.505,7.265c-0.428,1.106-2.859,3.444-2.225,4.708c0.779,1.55,5.263,0.201,6.532-0.338\n  \t\t\t\tc4.854-2.06,7.509-7.583,9.854-11.961c3.042-5.678,6.837-10.482,9.308-16.26c2.354-5.508,6.542-9.938,4.032-16.423\n  \t\t\t\tc-0.107-0.282-0.243-0.56-0.39-0.835c0.243,0.045,0.497,0.13,0.837,0.216c-0.062,0.354,0.123,0.814,0.021,1.197\n  \t\t\t\tc4.363-1.209,3.31-7.629,3.519-11.093C793.849,189.197,793.826,185.001,793.326,180.691z M788.614,202.207\n  \t\t\t\tc-1.296-1.836-3.366-3.473-5.672-4.671l-0.005,0.013c-1.959-1.021-4.09-1.73-6.066-1.991c2.538-1.715,6.821-0.577,9.084,0.961\n  \t\t\t\tc1.188,0.808,2.546,2.046,2.898,3.506C788.894,200.19,788.805,201.351,788.614,202.207z\"/>\n  \t\t</g>\n  \t\t<circle class='hotspot' proxy-tap='showCloseUp:synapse' cx=\"239\" cy=\"35.863\" r='15'/>\n  \t\t\n      <text class='large white' transform='translate(250,310)'>Tap here</text>\n  \t\t<text class='large white' transform='translate(250,350)'>to see inside</text>\n\n  \t\t<!-- Hotspots hint -->\n      <text class='large' transform='translate(480,60)'>Tap on the hotspots</text>\n      <text class='large' transform='translate(480,100)'>for closeup views</text>\n      <line x1='350' y1='50' x2='280' y2='42' class='hint'/>\n      <line x1='480' y1='120' x2='510' y2='220' class='hint'/>\n\n      <!-- Labels hint -->\n      <text class='large' transform='translate(640,420)'>Tap on the labels</text>\n  \t\t<text class='large' transform='translate(640,460)'>for more info</text>\n      <line x1='630' y1='380' x2='600' y2='365' class='hint'/>\n      <line x1='630' y1='470' x2='600' y2='490' class='hint'/>\n  \t</g>\n\n  \t<g id=\"default-labels\" class='{{( showLabels ? \"visible\" : \"hidden\" )}}'>\n  \t\t\n      <!-- Dendrites -->\n      <g class='label {{( info === \"dendrites\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:dendrites'>\n  \t\t\t<polyline points=\"465,554 530,535 470,505\"/>\n  \t\t\t<polyline points=\"142,105 150,40 190,67\"/>\n\n        <g transform='translate(510, 527)'>\n          <rect class='label-bg' x='-9' y='-12' width='114' height='39' rx='5' ry='5'/>\n          <text>Dendrites</text>\n        </g>\n          \n        <g transform='translate(80, 25)'>\n          <rect class='label-bg' x='-9' y='-12' width='114' height='39' rx='5' ry='5'/>\n          <text>Dendrites</text>\n        </g>\n  \t\t</g>\n\n  \t\t<!-- Axon hillock -->\n      <g class='label {{( info === \"axon_hillock\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:axon_hillock'>\n  \t\t\t<path d=\"M453.05,294.498c-0.524,0.039-0.926,0.478-0.926,0.996c0,0.025,0.001,0.05,0.003,0.075c0,0,0.512,6.884,0.633,8.513\n  \t\t\t\tc-21.237,0.563-32.001,17.244-32.108,17.416l-0.627,0.998c0,0,3.999,1.678,6.838,2.867h-8.364\n  \t\t\t\tc-7.395,0-11.851,19.855-12.821,24.666h-7.179c-0.552,0-1,0.447-1,1c0,0.555,0.448,1,1,1h8.828l0.154-0.812\n  \t\t\t\tc1.746-9.223,6.281-23.854,11.018-23.854h13.334l0.388-1.922c0,0-7.365-3.09-9.184-3.852c2.619-3.514,12.905-15.561,30.798-15.561\n  \t\t\t\th1.077l-0.789-10.61c-0.04-0.58-0.52-0.99-1.07-0.95L453.05,294.498z\"/>\n\n          <g transform='translate(438, 331)'>\n            <rect class='label-bg' x='-9' y='-12' width='139' height='39' rx='5' ry='5'/>\n            <text>Axon hillock</text>\n          </g>\n  \t\t</g>\n\n  \t\t<!-- Axodendritic synapse -->\n      <g class='label {{( info === \"synapse\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:synapse'>\n  \t\t\t\n  \t\t\t<polyline points=\"145,500 124,550 210,547\"/>\n\n        <g transform='translate(58, 532)'>\n          <rect class='label-bg' x='-9' y='-12' width='114' height='59' rx='5' ry='5'/>\n          <text>Synapse</text>\n          <text x='-2' y='24' class='small'>(Axodendritic)</text>\n        </g>\n  \t\t</g>\n\n  \t\t<!-- Axosomatic synapse -->\n      <g class='label {{( info === \"synapse\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:synapse'>\n  \t\t\t<line x1='400' y1='200' x2='345' y2='215'/>\n\n        <g transform='translate(346, 153)'>\n          <rect class='label-bg' x='-9' y='-12' width='114' height='59' rx='5' ry='5'/>\n          <text>Synapse</text>\n    \t\t\t<text x='0' y='24' class='small'>(Axosomatic)</text>\n        </g>\n  \t\t</g>\n\n  \t\t<!-- Axoaxonic synapse -->\n      <g class='label {{( info === \"synapse\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:synapse'>\n  \t\t\t<line x1=\"760\" y1=\"55\" x2=\"750\" y2=\"95\"/>\n\n        <g transform='translate(680, 30)'>\n          <rect class='label-bg' x='-9' y='-12' width='106' height='59' rx='5' ry='5'/>\n          <text>Synapse</text>\n  \t\t\t  <text x='0' y='24' class='small'>(Axoaxonic)</text>\n        </g>\n  \t\t</g>\n\n      <!-- Node of Ranvier -->\n      <g class='label {{( info === \"ranvier\" ? \"selected\" : \"\" )}}' proxy-tap='moreInfo:ranvier'>\n  \t\t\t<polyline points=\"685,250 675,194 730,220\"/>\n\n        <g transform='translate(555, 197)'>\n          <rect class='label-bg' x='-9' y='-12' width='176' height='39' rx='5' ry='5'/>\n          <text>Node of Ranvier</text>\n        </g>\n  \t\t</g>\n  \t</g>\n  </svg>\n\n  <div class='detail'>\n    <p>{{{( detail[ info ] || 'Tap on the labels for more info' )}}}</p>\n  </div>\n</div>","styles":".graphic {\n\tposition: relative;\n\tpadding: 4em 0 6em 0;\n\twidth: 100%;\n\theight: 100%;\n\t\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.header {\n\tposition: absolute;\n\tpadding: 0.5em;\n\ttop: 0;\n\tleft: 0;\n\twidth: 100%;\n\theight: 4em;\n\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.header h3, .header p {\n\tmargin: 0;\n}\n\n.header button {\n\tfloat: right;\n}\n\nsvg {\n\twidth: 100%;\n\theight: 100%;\n\tborder-top: 1px solid #eee;\n\tborder-bottom: 1px solid #eee;\n\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.detail {\n\tposition: absolute;\n\tpadding: 0.5em;\n\tleft: 0;\n\tbottom: 0;\n\twidth: 100%;\n\tmargin: 0 auto;\n\theight: 6em;\n\n\t-webkit-box-sizing: border-box;\n\t-moz-box-sizing: border-box;\n\tbox-sizing: border-box;\n}\n\n.detail p {\n\tmax-width: 32em;\n}\n\n.background {\n\tfill: #f9f9f9;\n}\n\n.tapcatcher {\n\tfill: rgba(255,255,255,0.01);\n\tpointer-event: fill;\n}\n\n#hotspots g, ellipse, circle {\n\tcursor: pointer;\n\tfill: white;\n\tfill-opacity: 0.5;\n\tstroke: #1E2458;\n\tstroke-width: 2;\n}\n\n#hotspots text.large {\n\tfill: #333;\n\tfont-family: 'Voltaire';\n\tfont-size: 2em;\n\ttext-anchor: middle;\n\tpointer-events: none;\n}\n\n#hotspots text.large.white {\n\tfill: white;\n}\n\n.visible {\n\topacity: 1;\n\tpointer-events: normal;\n\t-webkit-transition: opacity 1s ease-in-out;\n}\n\n.hidden {\n\topacity: 0;\n\tpointer-events: none;\n\t-webkit-transition: opacity 0.2s ease-in-out;\n}\n\n#neuron {\n\tcursor: pointer;\n}\n\n.detail {\n\t-webkit-transition: opacity 1s ease-in-out;\n}\n\n.detail.visible {\n\topacity: 1;\n\tpointer-events: normal;\n}\n\n.detail.hidden {\n\topacity: 0;\n\tpointer-events: none;\n}\n\n.label {\n\t-webkit-transition: opacity 0.2s ease-in-out;\n\tcursor: pointer;\n}\n\n.label-bg {\n\tfill: #f9fcf6;\n}\n\n.selected .label-bg {\n\tfill: #729d34;\n}\n\n.label text {\n\tfont-family: 'Helvetica Neue', 'Arial';\n\tfont-size: 1.4em;\n\tfill: #333;\n\talignment-baseline: hanging;\n}\n\n.selected text {\n\tfill: white;\n}\n\n.label .small {\n\tfont-size: 1em;\n}\n\n.label line, .label polyline, .label ellipse {\n\tstroke: #729d34;\n\tstroke-width: 2;\n\tfill: none;\n}\n\n.label path {\n\tfill: #729d34;\n}\n\n.label line {\n\tmarker-end: url(#arrow-end);\n}\n\n.label .outline {\n\tstroke: #f9f9f9;\n\tstroke-width: 4;\n\tmarker-end: url(#arrow-end-outline);\n}\n\n.label .no-arrow {\n\tmarker-end: none;\n}\n\n.label polyline {\n\tmarker-start: url(#arrow-start);\n\tmarker-end: url(#arrow-end);\n}\n\n.label polyline.outline {\n\tmarker-start: url(#arrow-start-outline);\n}\n\n.label-bg {\n\tfill: #f9fcf6;\n\tstroke: #729d34;\n\tstroke-width: 2;\n}\n\n.hint {\n\tstroke-width: 4;\n\tstroke: #333;\n\tmarker-end: url(#arrow-end-black);\n}","javascript":"var viewBoxes = {\n\tnormal: { x: 0, y: 0, width: 819.18, height: 596.441 },\n\tneuron: { x: 0, y: 100, width: 560, height: 407.451 },\n\taxon: { x: 289, y: 195, width: 530, height: 385.623 },\n\tsynapse: { x: 190, y: 0, width: 525, height: 381.985 }\n};\n\nvar ractive = new Ractive({\n  el: output,\n  template: template,\n  data: {\n    viewBox: viewBoxes.normal,\n    showLabels: false,\n    info: null,\n    closeup: null,\n    fullscreenEnabled: Ractive.fullscreenEnabled,\n    detail: {\n      dendrites: '<strong>Dendrites</strong> conduct electrochemical stimulation from other neurons via synapses. <a href=\"http://en.wikipedia.org/wiki/Dendrite\">Wikipedia article</a>',\n      axon_hillock: 'The <strong>axon hillock</strong> is a specialized part of the cell body of a neuron that connects to the axon. <a href=\"http://en.wikipedia.org/wiki/Axon_hillock\">Wikipedia article</a>',\n      ranvier: '<strong>Nodes of Ranvier</strong> are 1 micrometer gaps in the myelin sheaths that insulate the axon. These nodes act as signal boosters. <a href=\"http://en.wikipedia.org/wiki/Nodes_of_Ranvier\">Wikipedia article</a>',\n      synapse: '<strong>Chemical synapses</strong> transmit signals between cells by releasing neurotransmitter molecules. An adult human brain contains between 100-500 trillion synapses. <a href=\"http://en.wikipedia.org/wiki/Chemical_synapse\">Wikipedia article</a>',\n\n      microtubules: '<strong>Microtubules</strong> and <strong>neurofibrils</strong> are bundles of filaments which, among other things, help maintain cell structure. <a href=\"https://en.wikipedia.org/wiki/Microtubule\">Wikipedia article</a>',\n      synaptic_vesicles: '<strong>Synaptic vesicles</strong> store the neurotransmitters that are released at the synapse to propagate signals. They are constantly regenerated by the cell. <a href=\"http://en.wikipedia.org/wiki/Synaptic_vesicle\">Wikipedia article</a>',\n      synaptic_cleft: 'The <strong>synaptic cleft</strong> is the small (20-40nm) gap between neurons, across which neurotransmitters are released to propagate signals.',\n      neurotransmitter: '<strong>Neurotransmitters</strong> are chemicals stored in the synaptic vesicles, which transmit signals from a neuron to the target cell. <a href=\"http://en.wikipedia.org/wiki/Neurotransmitter\">Wikipedia article</a>',\n      receptors: '<strong>Receptors</strong> are molecules that receive chemical signals from outside the cell they inhabit. Specific chemicals bind to specific receptors, like keys and locks. <a href=\"http://en.wikipedia.org/wiki/Receptor_(biochemistry)\">Wikipedia article</a>',\n\n      rough_er: '<strong>Nissl bodies</strong> are rough endoplasmic reticulum granules, whose job it is to manufacture and release proteins. <a href=\"http://en.wikipedia.org/wiki/Nissl_body\">Wikipedia article</a>',\n      polyribosomes: '<strong>Polyribosomes</strong>, or polysomes, are clusters of ribosomes. <a href=\"http://en.wikipedia.org/wiki/Polysome\">Wikipedia article</a>',\n      ribosomes: '<strong>Ribosomes</strong> are responsible for linking amino acids together according to the genetic instructions carried in messenger RNA',\n      golgi: 'The <strong>Golgi apparatus</strong> modifies, sorts, and packages proteins before sending them to their destination. <a href=\"http://en.wikipedia.org/wiki/Golgi_apparatus\">Wikipedia article</a>',\n      nucleus: 'The <strong>nucleus</strong> is the control centre of a cell - it contains the bulk of the genetic material, and regulates gene expression. <a href=\"http://en.wikipedia.org/wiki/Cell_nucleus\">Wikipedia article</a>',\n      nucleolus: 'The <strong>nucleolus</strong> of a cell is responsible for copying DNA into RNA - the first step of gene expression. <a href=\"http://en.wikipedia.org/wiki/Nucleolus\">Wikipedia article</a>',\n      membrane: '<strong>Membranes</strong> are the boundaries between the insides and outsides of cells. They protect the cell, and control the movement of substances (such as ions and organic molecules) in and out of cells. <a href=\"http://en.wikipedia.org/wiki/Cell_membrane\">Wikipedia article</a>',\n      smooth_er: '<strong>Smooth endoplasmic reticulum</strong> deals with lipid metabolism, carbohydrate metabolism, and detoxification. <a href=\"http://en.wikipedia.org/wiki/Endoplasmic_reticulum\">Wikipedia article</a>',\n      mitochondrion: '<strong>Mitochondria</strong> supply the rest of the cell with energy by generating adenosine triphosphate. They are also involved in signalling and regulating growth, among other things. Not to be confused with midichlorians. <a href=\"http://en.wikipedia.org/wiki/Mitochondrion\">Wikipedia article</a>',\n\n      microfilament: '<strong>Microfilaments</strong> are the thinnest filaments of the cytoskeleton, which provides cells with structure and shape. <a href=\"http://en.wikipedia.org/wiki/Microfilament\">Wikipedia article</a>',\n      axon: 'The <strong>axon</strong>, or nerve fibre, is the part of the cell responsible for conducting eletrical impulses away from the neuron\\'s body and to other neurons, muscles, and glands. <a href=\"http://en.wikipedia.org/wiki/Axon\">Wikipedia article</a>',\n      schwann_cell: '<strong>Schwann cells</strong> form the myelin sheath around myelinated axons. Myelin is an electrically insulating substance, which protects the axon and increases its conduction velocity. <a href=\"http://en.wikipedia.org/wiki/Schwann_cell\">Wikipedia article</a>'\n    }\n  }\n});\n\n// after the view renders, fade in hotspots\nsetTimeout( function () {\n\tractive.set( 'showLabels', true );\n}, 1000 );\n\n\n\nvar info, closeup;\n\nractive.on({\n  reset: function () {\n    this.set({\n      info: null,\n      closeup: null\n    });\n  },\n\n  moreInfo: function ( event, info ) {\n    this.set( 'info', info );\n  },\n\n  showCloseUp: function ( event, closeup ) {\n    this.set( 'closeup', closeup );\n  },\n\n  toggleFullscreen: function () {\n    this.toggleFullscreen();\n  }\n});\n\nractive.observe({\n  closeup: function ( newCloseup, oldCloseup ) {\n    var viewBox;\n\n    // previous\n    if ( oldCloseup ) {\n      this.set( oldCloseup + 'Visible', false );\n      this.set( 'showLabels', false );\n    }\n\n    // new\n    viewBox = ( newCloseup ? viewBoxes[ newCloseup ] : viewBoxes.normal );\n\n    this.animate( 'viewBox', viewBox, {\n      duration: 300,\n      easing: 'easeInOut',\n      complete: function () {\n        if ( newCloseup ) {\n          ractive.set( newCloseup + 'Visible', true );\n          ractive.set( 'showLabels', false );\n        } else {\n          ractive.set( 'showLabels', true );\n        }\n      }\n    });\n  }\n});","init":true,"copy":"<p>Ractive can potentially be used to turn static illustrations into interactive pieces, like this neuron cell diagram, based on the <a href='http://en.wikipedia.org/wiki/File:Complete_neuron_cell_diagram_en.svg'>original from Wikipedia</a>.</p>\n\n<p>In this case, the diagram was modified using Adobe Illustrator (to separate the closeups into their own groups, and add text-based labels rather than path-based ones), then hand-edited to add the interactivity.</p>\n\n<p>Right now, it's a laborious process, as Illustrator and <a href='http://inkscape.org/'>Inkscape</a> create SVG that can be difficult to edit by hand. But it's totally possible.</p>\n\n<div class='hint'>\n\t<p>We're using a method we haven't seen before - <code>ractive.toggleFullscreen()</code>. This (along with <code>requestFullscreen</code> and <code>cancelFullscreen</code>) is a convenience method that allows you to use the <a href='https://developer.mozilla.org/en-US/docs/Web/Guide/DOM/Using_full_screen_mode'>fullscreen API</a> without worrying about vendor prefixes. See the <a href='https://github.com/Rich-Harris/Ractive/wiki'>docs</a> for more info.</p>\n</div>"}]},{"title":"Transitions","styles":".large {\n\tpadding: 1em;\n\tfont-size: 1.6em;\n\ttext-align: center;\n}","steps":[{"template":"{{#( visible === 1 )}}\n  <div class='large button' proxy-tap='show:2'>Click me!</div>\n{{/()}}\n\n{{#( visible === 2 )}}\n  <div class='large button' proxy-tap='show:3'>And me!</div>\n{{/()}}\n\n{{#( visible === 3 )}}\n  <div class='large button' proxy-tap='show:1'>Now click me!</div>\n{{/()}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { visible: 1 }\n});\n\nractive.on({\n  show: function ( event, which ) {\n    this.set( 'visible', which );\n  }\n});","init":true,"fixed":{"template":"{{#( visible === 1 )}}\n  <div intro='fade' class='large button' proxy-tap='show:2'>Click me!</div>\n{{/()}}\n\n{{#( visible === 2 )}}\n  <div intro='slide' class='large button' proxy-tap='show:3'>And me!</div>\n{{/()}}\n\n{{#( visible === 3 )}}\n  <div intro='fly' class='large button' proxy-tap='show:1'>Now click me!</div>\n{{/()}}"},"copy":"<h2>Making a big entrance...</h2>\n\n<p>Normally, when an element is rendered, it just sort of gets plonked on the page. With Ractive you have more control: you can specify <code>intro</code> transitions:</p>\n\n<pre class='prettypring lang-html'>\n&lt;div intro='fade'&gt;This div will fade into view&lt;/div&gt;\n</pre>\n\n<p>Try adding intros to the three buttons in the template, choosing from <code>fade</code>, <code>slide</code> and <code>fly</code>.</p>"},{"template":"{{#( visible === 1 )}}\n  <div intro='fade' class='large button' proxy-tap='show:2'>Click me!</div>\n{{/()}}\n\n{{#( visible === 2 )}}\n  <div intro='slide' class='large button' proxy-tap='show:3'>And me!</div>\n{{/()}}\n\n{{#( visible === 3 )}}\n  <div intro='fly' class='large button' proxy-tap='show:1'>Now click me!</div>\n{{/()}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { visible: 1 }\n});\n\nractive.on({\n  show: function ( event, which ) {\n    this.set( 'visible', which );\n  }\n});","init":true,"fixed":{"template":"{{#( visible === 1 )}}\n  <div intro='fade' outro='fly' class='large button' proxy-tap='show:2'>Click me!</div>\n{{/()}}\n\n{{#( visible === 2 )}}\n  <div intro='slide' outro='fade' class='large button' proxy-tap='show:3'>And me!</div>\n{{/()}}\n\n{{#( visible === 3 )}}\n  <div intro='fly' outro='slide' class='large button' proxy-tap='show:1'>Now click me!</div>\n{{/()}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { visible: 1 }\n});\n\nractive.on({\n  show: function ( event, which ) {\n    this.set( 'visible', null, function () {\n      this.set( 'visible', which );\n    });\n  }\n});"},"copy":"<h2>...and bowing out in style</h2>\n\n<p>Similarly, we can specify <code>outro</code> transitions. When an element is no longer needed on the page, it will exit gracefully.</p>\n\n<p>Try adding <code>outro</code> transitions to the three buttons;</p>\n\n<pre class='prettyprint lang-html'>\n&lt;div intro='fade' outro='fly' class='large button' proxy-tap='show:2'&gt;Click me!&lt;/div&gt;\n</pre>\n\n<p>Execute the code. Aaargh! It looks horrible!</p>\n\n<p>That's because new elements are being rendered before the old ones get removed from the DOM. What we need to do is trigger the removal, wait, and then trigger rendering of the new element.</p>\n\n<p>We do that by adding a callback to our proxy event handler:</p>\n\n<pre class='prettyprint lang-js'>\nractive.on({\n  show: function ( event, which ) {\n    this.set( 'visible', null, function () {\n      this.set( 'visible', which );\n    });\n  }\n});\n</pre>\n\n<div class='hint'>\n\t<p>You can pass a callback to <code>ractive.set()</code>, <code>ractive.update()</code> and <code>ractive.teardown()</code>, or as the <code>complete</code> property of your initialisation options. At present, promises are not implemented, and there is no way to specify a callback when using array mutation methods.</p>\n</div>"},{"template":"{{#( visible === 1 )}}\n  <div intro='fade' outro='fly' class='large button' proxy-tap='show:2'>Click me!</div>\n{{/()}}\n\n{{#( visible === 2 )}}\n  <div intro='slide' outro='fade' class='large button' proxy-tap='show:3'>And me!</div>\n{{/()}}\n\n{{#( visible === 3 )}}\n  <div intro='fly' outro='slide' class='large button' proxy-tap='show:1'>Now click me!</div>\n{{/()}}","javascript":"var ractive = new Ractive({\n  el: output,\n  template: template,\n  data: { visible: 1 }\n});\n\nractive.on({\n  show: function ( event, which ) {\n    this.set( 'visible', null, function () {\n      this.set( 'visible', which );\n    });\n  }\n});","init":true,"fixed":{"template":"{{#( visible === 1 )}}\n  <div intro='fade:slow' outro='fly:fast' class='large button' proxy-tap='show:2'>Click me!</div>\n{{/()}}\n\n{{#( visible === 2 )}}\n  <div intro='slide:slow' outro='fade:1000' class='large button' proxy-tap='show:3'>And me!</div>\n{{/()}}\n\n{{#( visible === 3 )}}\n  <div intro='fly:1000' outro='slide:100' class='large button' proxy-tap='show:1'>Now click me!</div>\n{{/()}}"},"copy":"<h2>Transition parameters</h2>\n\n<p>You can pass in parameters to add fine-grained control over transitions:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;div intro='fade:{\"duration\":2000}' outro='fly' class='large button' proxy-tap='show:2'&gt;Click me!&lt;/div&gt;\n</pre>\n\n<p>The transition function will receive an argument corresponding to these parameters (parsed as JSON, if possible, or left as a string if not). In this case, the default <code>duration</code> property will be overridden, so the <code>fade</code> transition will take 2000 milliseconds (more popularly known as '2 seconds').</p>\n\n<p>By convention, if you pass in a number, it will be treated as the duration property:</p>\n\n<pre class='prettyprint lang-html'>\n&lt;div intro='fade:2000' outro='fly' class='large button' proxy-tap='show:2'&gt;Click me!&lt;/div&gt;\n</pre>\n\n<p>In place of a number, you can use <code>fast</code> (200 milliseconds) or <code>slow</code> (600 milliseconds), just like jQuery.</p>\n\n<p>The parameters available to you depend on the transition.</p>"}],"TODO":"arguments... number=duration, staggering (multiple elements)\n\nneed to make intro/outro work same as proxy events viz. arguments\n\ncreating new transitions"}],"TODO":"SVG\nPrecompilation (inc custom delimiters and other options - sanitizing, whitespace... RequireJS plugin)\nData binding\n\n\n\nEvents"};
}());
/*! Ractive - v0.3.0 - 2013-06-27
* Faster, easier, better interactive web development

* http://rich-harris.github.com/Ractive/
* Copyright (c) 2013 Rich Harris; Licensed MIT */

/*jslint eqeq: true, plusplus: true */
/*global document, HTMLElement */


(function ( global ) {

'use strict';

var Ractive,

doc = global.document || null,

proto = {},

// properties of the public Ractive object
adaptors = {},
eventDefinitions = {},
easing,
extend,
interpolate,
interpolators,
transitions = {},


// internal utils
splitKeypath,
toString,
isArray,
isObject,
isNumeric,
isEqual,
getEl,
defineProperty,
defineProperties,
create,
createFromNull,
noop = function () {},


// internally used caches
keypathCache = {},


// internally used constructors
DomFragment,
TextFragment,
Evaluator,
Animation,


// internally used regexes
leadingWhitespace = /^\s+/,
trailingWhitespace = /\s+$/,


// other bits and pieces
initMustache,
updateMustache,
resolveMustache,
evaluateMustache,

initFragment,
updateSection,

animationCollection,


// array modification
registerKeypathToArray,
unregisterKeypathFromArray,


// parser and tokenizer
stripCommentTokens,
stripHtmlComments,
stripStandalones,


// error messages
missingParser = 'Missing Ractive.parse - cannot parse template. Either preparse or use the version that includes the parser',


// constants
TEXT              = 1,
INTERPOLATOR      = 2,
TRIPLE            = 3,
SECTION           = 4,
INVERTED          = 5,
CLOSING           = 6,
ELEMENT           = 7,
PARTIAL           = 8,
COMMENT           = 9,
DELIMCHANGE       = 10,
MUSTACHE          = 11,
TAG               = 12,
ATTR_VALUE_TOKEN  = 13,
EXPRESSION        = 14,

NUMBER_LITERAL    = 20,
STRING_LITERAL    = 21,
ARRAY_LITERAL     = 22,
OBJECT_LITERAL    = 23,
BOOLEAN_LITERAL   = 24,
LITERAL           = 25,
GLOBAL            = 26,


REFERENCE         = 30,
REFINEMENT        = 31,
MEMBER            = 32,
PREFIX_OPERATOR   = 33,
BRACKETED         = 34,
CONDITIONAL       = 35,
INFIX_OPERATOR    = 36,

INVOCATION        = 40,

UNSET             = { unset: true },


// namespaces
namespaces = {
	html:   'http://www.w3.org/1999/xhtml',
	mathml: 'http://www.w3.org/1998/Math/MathML',
	svg:    'http://www.w3.org/2000/svg',
	xlink:  'http://www.w3.org/1999/xlink',
	xml:    'http://www.w3.org/XML/1998/namespace',
	xmlns:  'http://www.w3.org/2000/xmlns/'
};



// we're creating a defineProperty function here - we don't want to add
// this to _legacy.js since it's not a polyfill. It won't allow us to set
// non-enumerable properties. That shouldn't be a problem, unless you're
// using for...in on a (modified) array, in which case you deserve what's
// coming anyway
try {
	Object.defineProperty({}, 'test', { value: 0 });
	Object.defineProperties({}, { test: { value: 0 } });

	defineProperty = Object.defineProperty;
	defineProperties = Object.defineProperties;
} catch ( err ) {
	// Object.defineProperty doesn't exist, or we're in IE8 where you can
	// only use it with DOM objects (what the fuck were you smoking, MSFT?)
	defineProperty = function ( obj, prop, desc ) {
		obj[ prop ] = desc.value;
	};

	defineProperties = function ( obj, props ) {
		var prop;

		for ( prop in props ) {
			if ( props.hasOwnProperty( prop ) ) {
				defineProperty( obj, prop, props[ prop ] );
			}
		}
	};
}


try {
	Object.create( null );

	create = Object.create;

	createFromNull = function () {
		return Object.create( null );
	};
} catch ( err ) {
	// sigh
	create = (function () {
		var F = function () {};

		return function ( proto, props ) {
			var obj;

			F.prototype = proto;
			obj = new F();

			if ( props ) {
				Object.defineProperties( obj, props );
			}

			return obj;
		};
	}());

	createFromNull = function () {
		return {}; // hope you're not modifying the Object prototype
	};
}



var hyphenate = function ( str ) {
	return str.replace( /[A-Z]/g, function ( match ) {
		return '-' + match.toLowerCase();
	});
};

// determine some facts about our environment
var cssTransitionsEnabled, transition, transitionend;

(function () {

	var testDiv;

	if ( !doc ) {
		return;
	}

	testDiv = doc.createElement( 'div' );

	if ( testDiv.style.transition !== undefined ) {
		transition = 'transition';
		transitionend = 'transitionend';
		cssTransitionsEnabled = true;
	} else if ( testDiv.style.webkitTransition !== undefined ) {
		transition = 'webkitTransition';
		transitionend = 'webkitTransitionEnd';
		cssTransitionsEnabled = true;
	} else {
		cssTransitionsEnabled = false;
	}

}());
(function ( proto ) {

	var add = function ( root, keypath, d ) {
		var value;

		if ( typeof keypath !== 'string' || !isNumeric( d ) ) {
			if ( root.debug ) {
				throw new Error( 'Bad arguments' );
			}
			return;
		}

		value = root.get( keypath );

		if ( value === undefined ) {
			value = 0;
		}

		if ( !isNumeric( value ) ) {
			if ( root.debug ) {
				throw new Error( 'Cannot add to a non-numeric value' );
			}
			return;
		}

		root.set( keypath, value + d );
	};

	proto.add = function ( keypath, d ) {
		add( this, keypath, ( d === undefined ? 1 : d ) );
	};

	proto.subtract = function ( keypath, d ) {
		add( this, keypath, ( d === undefined ? -1 : -d ) );
	};

	proto.toggle = function ( keypath ) {
		var value;

		if ( typeof keypath !== 'string' ) {
			if ( this.debug ) {
				throw new Error( 'Bad arguments' );
			}
			return;
		}

		value = this.get( keypath );
		this.set( keypath, !value );
	};

}( proto ));
(function ( proto ) {

	var animate;

	proto.animate = function ( keypath, to, options ) {
		
		var k, animation, animations;

		options = options || {};

		// animate multiple properties
		if ( typeof keypath === 'object' ) {
			options = to;
			animations = [];

			for ( k in keypath ) {
				if ( keypath.hasOwnProperty( k ) ) {
					animations[ animations.length ] = animate( this, k, keypath[k], options );
				}
			}

			return {
				stop: function () {
					while ( animations.length ) {
						animations.pop().stop();
					}
				}
			};
		}

		animation = animate( this, keypath, to, options );

		return {
			stop: function () {
				animation.stop();
			}
		};
	};

	animate = function ( root, keypath, to, options ) {
		var easing, duration, animation, i, keys;

		// cancel any existing animation
		// TODO what about upstream/downstream keypaths?
		i = animationCollection.animations.length;
		while ( i-- ) {
			if ( animationCollection.animations[ i ].keypath === keypath ) {
				animationCollection.animations[ i ].stop();
			}
		}

		// easing function
		if ( options.easing ) {
			if ( typeof options.easing === 'function' ) {
				easing = options.easing;
			}

			else {
				if ( root.easing && root.easing[ options.easing ] ) {
					// use instance easing function first
					easing = root.easing[ options.easing ];
				} else {
					// fallback to global easing functions
					easing = Ractive.easing[ options.easing ];
				}
			}

			if ( typeof easing !== 'function' ) {
				easing = null;
			}
		}

		// duration
		duration = ( options.duration === undefined ? 400 : options.duration );

		keys = splitKeypath( keypath );

		animation = new Animation({
			keys: keys,
			from: root.get( keys ),
			to: to,
			root: root,
			duration: duration,
			easing: easing,
			step: options.step,
			complete: options.complete
		});

		animationCollection.push( animation );
		root._animations[ root._animations.length ] = animation;

		return animation;
	};

}( proto ));
proto.bind = function ( adaptor ) {
	var bound = this._bound;

	if ( bound.indexOf( adaptor ) === -1 ) {
		bound[ bound.length ] = adaptor;
		adaptor.init( this );
	}
};
proto.cancelFullscreen = function () {
	Ractive.cancelFullscreen( this.el );
};
proto.fire = function ( eventName ) {
	var args, i, len, subscribers = this._subs[ eventName ];

	if ( !subscribers ) {
		return;
	}

	args = Array.prototype.slice.call( arguments, 1 );

	for ( i=0, len=subscribers.length; i<len; i+=1 ) {
		subscribers[i].apply( this, args );
	}
};
// TODO use dontNormalise
// TODO refactor this shitball

proto.get = function ( keypath, dontNormalise ) {
	var cache, cacheMap, keys, normalised, key, parentKeypath, parentValue, value, ignoreUndefined;

	if ( !keypath ) {
		return this.data;
	}

	cache = this._cache;

	if ( isArray( keypath ) ) {
		if ( !keypath.length ) {
			return this.data;
		}

		keys = keypath.slice(); // clone
		normalised = keys.join( '.' );

		ignoreUndefined = true; // because this should be a branch, sod the cache
	}

	else {
		// cache hit? great
		if ( cache.hasOwnProperty( keypath ) && cache[ keypath ] !== UNSET ) {
			return cache[ keypath ];
		}

		keys = splitKeypath( keypath );
		normalised = keys.join( '.' );
	}

	// we may have a cache hit now that it's been normalised
	if ( cache.hasOwnProperty( normalised ) && cache[ normalised ] !== UNSET ) {
		if ( cache[ normalised ] === undefined && ignoreUndefined ) {
			// continue
		} else {
			return cache[ normalised ];
		}
	}

	// is this an uncached evaluator value?
	if ( this._evaluators[ normalised ] ) {
		value = this._evaluators[ normalised ].value;
		cache[ normalised ] = value;
		return value;
	}

	// otherwise it looks like we need to do some work
	key = keys.pop();
	parentKeypath = keys.join( '.' );
	parentValue = ( keys.length ? this.get( keys ) : this.data );

	if ( parentValue === null || typeof parentValue !== 'object' || parentValue === UNSET ) {
		return;
	}

	// update cache map
	if ( !( cacheMap = this._cacheMap[ parentKeypath ] ) ) {
		this._cacheMap[ parentKeypath ] = [ normalised ];
	} else {
		if ( cacheMap.indexOf( normalised ) === -1 ) {
			cacheMap[ cacheMap.length ] = normalised;
		}
	}

	value = parentValue[ key ];

	// Is this an array that needs to be wrapped?
	if ( this.modifyArrays ) {
		// if it's not an expression, is an array, and we're not here because it sent us here, wrap it
		if ( ( normalised.charAt( 0 ) !== '(' ) && isArray( value ) && ( !value._ractive || !value._ractive.setting ) ) {
			registerKeypathToArray( value, normalised, this );
		}
	}

	// Update cache
	cache[ normalised ] = value;

	return value;
};
var teardown,
	clearCache,
	registerDependant,
	unregisterDependant,
	notifyDependants,
	registerIndexRef,
	unregisterIndexRef,
	resolveRef,
	processDeferredUpdates;

teardown = function ( thing ) {
	if ( !thing.keypath ) {
		// this was on the 'unresolved' list, we need to remove it
		var index = thing.root._pendingResolution.indexOf( thing );

		if ( index !== -1 ) {
			thing.root._pendingResolution.splice( index, 1 );
		}

	} else {
		// this was registered as a dependant
		unregisterDependant( thing );
	}
};

clearCache = function ( root, keypath ) {
	var value, len, kp, cacheMap;

	// is this a modified array, which shouldn't fire set events on this keypath anymore?
	if ( root.modifyArrays ) {
		if ( keypath.charAt( 0 ) !== '(' ) { // expressions (and their children) don't get wrapped
			value = root._cache[ keypath ];
			if ( isArray( value ) && !value._ractive.setting ) {
				unregisterKeypathFromArray( value, keypath, root );
			}
		}
	}
	
	root._cache[ keypath ] = UNSET;

	if ( cacheMap = root._cacheMap[ keypath ] ) {
		while ( cacheMap.length ) {
			clearCache( root, cacheMap.pop() );
		}
	}
};



registerDependant = function ( dependant ) {
	var depsByKeypath, deps, keys, parentKeypath, map, root, keypath, priority;

	root = dependant.root;
	keypath = dependant.keypath;
	priority = dependant.priority;

	depsByKeypath = root._deps[ priority ] || ( root._deps[ priority ] = {} );
	deps = depsByKeypath[ keypath ] || ( depsByKeypath[ keypath ] = [] );

	deps[ deps.length ] = dependant;

	// update dependants map
	keys = splitKeypath( keypath );
	
	while ( keys.length ) {
		keys.pop();
		parentKeypath = keys.join( '.' );
	
		map = root._depsMap[ parentKeypath ] || ( root._depsMap[ parentKeypath ] = [] );

		if ( map[ keypath ] === undefined ) {
			map[ keypath ] = 0;
			map[ map.length ] = keypath;
		}

		map[ keypath ] += 1;

		keypath = parentKeypath;
	}
};


unregisterDependant = function ( dependant ) {
	var deps, i, keep, keys, parentKeypath, map, evaluator, root, keypath, priority;

	root = dependant.root;
	keypath = dependant.keypath;
	priority = dependant.priority;

	deps = root._deps[ priority ][ keypath ];
	deps.splice( deps.indexOf( dependant ), 1 );

	// update dependants map
	keys = splitKeypath( keypath );
	
	while ( keys.length ) {
		keys.pop();
		parentKeypath = keys.join( '.' );
	
		map = root._depsMap[ parentKeypath ];

		map[ keypath ] -= 1;

		if ( !map[ keypath ] ) {
			// remove from parent deps map
			map.splice( map.indexOf( keypath ), 1 );
			map[ keypath ] = undefined;
		}

		keypath = parentKeypath;
	}
};

notifyDependants = function ( root, keypath, onlyDirect ) {
	var i;

	for ( i=0; i<root._deps.length; i+=1 ) { // can't cache root._deps.length, it may change
		notifyDependantsByPriority( root, keypath, i, onlyDirect );
	}
};

var notifyDependantsByPriority = function ( root, keypath, priority, onlyDirect ) {
	var depsByKeypath, deps, i, len, childDeps;

	depsByKeypath = root._deps[ priority ];

	if ( !depsByKeypath ) {
		return;
	}

	deps = depsByKeypath[ keypath ];

	if ( deps ) {
		i = deps.length;
		while ( i-- ) {
			deps[i].update();
		}
	}

	// If we're only notifying direct dependants, not dependants
	// of downstream keypaths, then YOU SHALL NOT PASS
	if ( onlyDirect ) {
		return;
	}
	

	// cascade
	childDeps = root._depsMap[ keypath ];
	
	if ( childDeps ) {
		i = childDeps.length;
		while ( i-- ) {
			notifyDependantsByPriority( root, childDeps[i], priority );
		}
	}
};

var notifyMultipleDependants = function ( root, keypaths, onlyDirect ) {
	var  i, j, len;

	len = keypaths.length;

	for ( i=0; i<root._deps.length; i+=1 ) {
		if ( root._deps[i] ) {
			j = len;
			while ( j-- ) {
				notifyDependantsByPriority( root, keypaths[j], i, onlyDirect );
			}
		}
	}
};


// Resolve a full keypath from `ref` within the given `contextStack` (e.g.
// `'bar.baz'` within the context stack `['foo']` might resolve to `'foo.bar.baz'`
resolveRef = function ( root, ref, contextStack ) {

	var keys, lastKey, innerMostContext, contextKeys, parentValue, keypath;

	// Implicit iterators - i.e. {{.}} - are a special case
	if ( ref === '.' ) {
		return contextStack[ contextStack.length - 1 ];
	}

	// References prepended with '.' are another special case
	if ( ref.charAt( 0 ) === '.' ) {
		return contextStack[ contextStack.length - 1 ] + ref;
	}

	keys = splitKeypath( ref );
	lastKey = keys.pop();

	// Clone the context stack, so we don't mutate the original
	contextStack = contextStack.concat();

	// Take each context from the stack, working backwards from the innermost context
	while ( contextStack.length ) {

		innerMostContext = contextStack.pop();
		contextKeys = splitKeypath( innerMostContext );

		parentValue = root.get( contextKeys.concat( keys ) );

		if ( typeof parentValue === 'object' && parentValue !== null && parentValue.hasOwnProperty( lastKey ) ) {
			keypath = innerMostContext + '.' + ref;
			break;
		}
	}

	if ( !keypath && root.get( ref ) !== undefined ) {
		keypath = ref;
	}

	return keypath;
};


processDeferredUpdates = function ( root ) {
	var evaluator, attribute;

	while ( root._defEvals.length ) {
		 evaluator = root._defEvals.pop();
		 evaluator.update().deferred = false;
	}

	while ( root._defAttrs.length ) {
		attribute = root._defAttrs.pop();
		attribute.update().deferred = false;
	}
};
proto.link = function ( keypath ) {
	var self = this;

	return function ( value ) {
		self.set( keypath, value );
	};
};
(function ( proto ) {

	var observe, Observer, updateObserver;

	proto.observe = function ( keypath, callback, options ) {

		var observers = [], k;

		if ( typeof keypath === 'object' ) {
			options = callback;

			for ( k in keypath ) {
				if ( keypath.hasOwnProperty( k ) ) {
					callback = keypath[k];
					observers[ observers.length ] = observe( this, k, callback, options );
				}
			}

			return {
				cancel: function () {
					while ( observers.length ) {
						observers.pop().cancel();
					}
				}
			};
		}

		return observe( this, keypath, callback, options );
	};

	observe = function ( root, keypath, callback, options ) {
		var observer;

		observer = new Observer( root, keypath, callback, options );

		if ( !options || options.init !== false ) {
			observer.update();
		}

		registerDependant( observer );

		return {
			cancel: function () {
				unregisterDependant( observer );
			}
		};
	};

	Observer = function ( root, keypath, callback, options ) {
		this.root = root;
		this.keypath = keypath;
		this.callback = callback;
		this.priority = 0; // observers get top priority

		// default to root as context, but allow it to be overridden
		this.context = ( options && options.context ? options.context : root );
	};

	Observer.prototype = {
		update: function () {
			var value;

			// TODO create, and use, an internal get method instead - we can skip checks
			value = this.root.get( this.keypath, true );

			if ( !isEqual( value, this.value ) ) {
				// wrap the callback in a try-catch block, and only throw error in
				// debug mode
				try {
					this.callback.call( this.context, value, this.value );
				} catch ( err ) {
					if ( root.debug ) {
						throw err;
					}
				}
				this.value = value;
			}
		}
	};

}( proto ));


proto.off = function ( eventName, callback ) {
	var subscribers, index;

	// if no callback specified, remove all callbacks
	if ( !callback ) {
		// if no event name specified, remove all callbacks for all events
		if ( !eventName ) {
			this._subs = {};
		} else {
			this._subs[ eventName ] = [];
		}
	}

	subscribers = this._subs[ eventName ];

	if ( subscribers ) {
		index = subscribers.indexOf( callback );
		if ( index !== -1 ) {
			subscribers.splice( index, 1 );
		}
	}
};
proto.on = function ( eventName, callback ) {
	var self = this, listeners, n;

	// allow mutliple listeners to be bound in one go
	if ( typeof eventName === 'object' ) {
		listeners = [];

		for ( n in eventName ) {
			if ( eventName.hasOwnProperty( n ) ) {
				listeners[ listeners.length ] = this.on( n, eventName[ n ] );
			}
		}

		return {
			cancel: function () {
				while ( listeners.length ) {
					listeners.pop().cancel();
				}
			}
		};
	}

	if ( !this._subs[ eventName ] ) {
		this._subs[ eventName ] = [ callback ];
	} else {
		this._subs[ eventName ].push( callback );
	}

	return {
		cancel: function () {
			self.off( eventName, callback );
		}
	};
};
// Render instance to element specified here or at initialization
proto.render = function ( options ) {
	var el, transitionManager;

	el = ( options.el ? getEl( options.el ) : this.el );

	if ( !el ) {
		throw new Error( 'You must specify a DOM element to render to' );
	}

	// Clear the element, unless `append` is `true`
	if ( !options.append ) {
		el.innerHTML = '';
	}

	this._transitionManager = transitionManager = makeTransitionManager( this, options.complete );

	// Render our *root fragment*
	this.fragment = new DomFragment({
		descriptor: this.template,
		root: this,
		owner: this, // saves doing `if ( this.parent ) { /*...*/ }` later on
		parentNode: el
	});

	el.appendChild( this.fragment.docFrag );
	this.ready = true;

	// transition manager has finished its work
	this._transitionManager = null;
	transitionManager.ready = true;
	if ( options.complete && !transitionManager.active ) {
		options.complete.call( this );
	}
};
proto.requestFullscreen = function () {
	Ractive.requestFullscreen( this.el );
};
(function ( proto ) {

	var set, attemptKeypathResolution;

	proto.set = function ( keypath, value, complete ) {
		var notificationQueue, upstreamQueue, k, normalised, keys, previous, previousTransitionManager, transitionManager;

		upstreamQueue = [ '' ]; // empty string will always be an upstream keypath
		notificationQueue = [];

		if ( isObject( keypath ) ) {
			complete = value;
		}

		// manage transitions
		previousTransitionManager = this._transitionManager;
		this._transitionManager = transitionManager = makeTransitionManager( this, complete );

		// setting multiple values in one go
		if ( isObject( keypath ) ) {
			for ( k in keypath ) {
				if ( keypath.hasOwnProperty( k ) ) {
					keys = splitKeypath( k );
					normalised = keys.join( '.' );
					value = keypath[k];

					set( this, normalised, keys, value, notificationQueue, upstreamQueue );
				}
			}
		}

		// setting a single value
		else {
			keys = splitKeypath( keypath );
			normalised = keys.join( '.' );

			set( this, normalised, keys, value, notificationQueue, upstreamQueue );
		}

		// if anything has changed, attempt to resolve any unresolved keypaths...
		if ( notificationQueue.length && this._pendingResolution.length ) {
			attemptKeypathResolution( this );
		}

		// ...and notify dependants
		if ( upstreamQueue.length ) {
			notifyMultipleDependants( this, upstreamQueue, true );
		}

		if ( notificationQueue.length ) {
			notifyMultipleDependants( this, notificationQueue );
		}

		// Attributes don't reflect changes automatically if there is a possibility
		// that they will need to change again before the .set() cycle is complete
		// - they defer their updates until all values have been set
		processDeferredUpdates( this );

		// transition manager has finished its work
		this._transitionManager = previousTransitionManager;
		transitionManager.ready = true;
		if ( complete && !transitionManager.active ) {
			complete.call( this );
		}

		// fire event
		if ( !this.setting ) {
			this.setting = true; // short-circuit any potential infinite loops
			
			if ( typeof keypath === 'object' ) {
				this.fire( 'set', keypath );
			} else {
				this.fire( 'set', keypath, value );
			}

			this.setting = false;
		}

		return this;
	};


	set = function ( root, keypath, keys, value, queue, upstreamQueue ) {
		var previous, key, obj, keysClone;

		keysClone = keys.slice();

		previous = root.get( keypath );

		// update the model, if necessary
		if ( previous !== value ) {
			// update data
			obj = root.data;
			while ( keys.length > 1 ) {
				key = keys.shift();

				// If this branch doesn't exist yet, create a new one - if the next
				// key matches /^\s*[0-9]+\s*$/, assume we want an array branch rather
				// than an object
				if ( !obj[ key ] ) {
					obj[ key ] = ( /^\s*[0-9]+\s*$/.test( keys[0] ) ? [] : {} );
				}

				obj = obj[ key ];
			}

			key = keys[0];

			obj[ key ] = value;
		}

		else {
			// if value is a primitive, we don't need to do anything else
			if ( typeof value !== 'object' ) {
				return;
			}
		}


		// Clear cache
		clearCache( root, keypath );

		// add this keypath to the notification queue
		queue[ queue.length ] = keypath;


		// add upstream keypaths to the upstream notification queue
		while ( keysClone.length > 1 ) {
			keysClone.pop();
			keypath = keysClone.join( '.' );

			if ( upstreamQueue.indexOf( keypath ) === -1 ) {
				upstreamQueue[ upstreamQueue.length ] = keypath;
			}
		}
		
	};

	attemptKeypathResolution = function ( root ) {
		var i, unresolved, keypath;

		// See if we can resolve any of the unresolved keypaths (if such there be)
		i = root._pendingResolution.length;
		while ( i-- ) { // Work backwards, so we don't go in circles!
			unresolved = root._pendingResolution.splice( i, 1 )[0];

			if ( keypath = resolveRef( root, unresolved.ref, unresolved.contextStack ) ) {
				// If we've resolved the keypath, we can initialise this item
				unresolved.resolve( keypath );

			} else {
				// If we can't resolve the reference, add to the back of
				// the queue (this is why we're working backwards)
				root._pendingResolution[ root._pendingResolution.length ] = unresolved;
			}
		}
	};

}( proto ));
// Teardown. This goes through the root fragment and all its children, removing observers
// and generally cleaning up after itself
proto.teardown = function ( complete ) {
	var keypath, transitionManager, previousTransitionManager;

	this.fire( 'teardown' );

	previousTransitionManager = this._transitionManager;
	this._transitionManager = transitionManager = makeTransitionManager( this, complete );

	this.fragment.teardown( true );

	// Cancel any animations in progress
	while ( this._animations[0] ) {
		this._animations[0].stop(); // it will remove itself from the index
	}

	// Clear cache - this has the side-effect of unregistering keypaths from modified arrays.
	for ( keypath in this._cache ) {
		clearCache( this, keypath );
	}

	// Teardown any bindings
	while ( this._bound.length ) {
		this.unbind( this._bound.pop() );
	}

	// transition manager has finished its work
	this._transitionManager = previousTransitionManager;
	transitionManager.ready = true;
	if ( complete && !transitionManager.active ) {
		complete.call( this );
	}
};
proto.toggleFullscreen = function () {
	if ( Ractive.isFullscreen( this.el ) ) {
		this.cancelFullscreen();
	} else {
		this.requestFullscreen();
	}
};
proto.unbind = function ( adaptor ) {
	var bound = this._bound, index;

	index = bound.indexOf( adaptor );

	if ( index !== -1 ) {
		bound.splice( index, 1 );
		adaptor.teardown( this );
	}
};
proto.update = function ( keypath, complete ) {
	var transitionManager, previousTransitionManager;

	if ( typeof keypath === 'function' ) {
		complete = keypath;
	}

	// manage transitions
	previousTransitionManager = this._transitionManager;
	this._transitionManager = transitionManager = makeTransitionManager( this, complete );

	clearCache( this, keypath || '' );
	notifyDependants( this, keypath || '' );

	processDeferredUpdates( this );

	// transition manager has finished its work
	this._transitionManager = previousTransitionManager;
	transitionManager.ready = true;
	if ( complete && !transitionManager.active ) {
		complete.call( this );
	}

	if ( typeof keypath === 'string' ) {
		this.fire( 'update', keypath );
	} else {
		this.fire( 'update' );
	}

	return this;
};
adaptors.backbone = function ( model, path ) {
	var settingModel, settingView, setModel, setView, pathMatcher, pathLength, prefix;

	if ( path ) {
		path += '.';
		pathMatcher = new RegExp( '^' + path.replace( /\./g, '\\.' ) );
		pathLength = path.length;
	}


	return {
		init: function ( view ) {
			
			// if no path specified...
			if ( !path ) {
				setView = function ( model ) {
					if ( !settingModel ) {
						settingView = true;
						view.set( model.changed );
						settingView = false;
					}
				};

				setModel = function ( keypath, value ) {
					if ( !settingView ) {
						settingModel = true;
						model.set( keypath, value );
						settingModel = false;
					}
				};
			}

			else {
				prefix = function ( attrs ) {
					var attr, result;

					result = {};

					for ( attr in attrs ) {
						if ( attrs.hasOwnProperty( attr ) ) {
							result[ path + attr ] = attrs[ attr ];
						}
					}

					return result;
				};

				setView = function ( model ) {
					if ( !settingModel ) {
						settingView = true;
						view.set( prefix( model.changed ) );
						settingView = false;
					}
				};

				setModel = function ( keypath, value ) {
					if ( !settingView ) {
						if ( pathMatcher.test( keypath ) ) {
							settingModel = true;
							model.set( keypath.substring( pathLength ), value );
							settingModel = false;
						}
					}
				};
			}

			model.on( 'change', setView );
			view.on( 'set', setModel );
			
			// initialise
			view.set( path ? prefix( model.attributes ) : model.attributes );
		},

		teardown: function ( view ) {
			model.off( 'change', setView );
			view.off( 'set', setModel );
		}
	};
};
adaptors.statesman = function ( model, path ) {
	var settingModel, settingView, setModel, setView, pathMatcher, pathLength, prefix;

	if ( path ) {
		path += '.';
		pathMatcher = new RegExp( '^' + path.replace( /\./g, '\\.' ) );
		pathLength = path.length;

		prefix = function ( attrs ) {
			var attr, result;

			if ( !attrs ) {
				return;
			}

			result = {};

			for ( attr in attrs ) {
				if ( attrs.hasOwnProperty( attr ) ) {
					result[ path + attr ] = attrs[ attr ];
				}
			}

			return result;
		};
	}


	return {
		init: function ( view ) {
			
			var data;

			// if no path specified...
			if ( !path ) {
				setView = function ( keypath, value ) {
					if ( !settingModel ) {
						settingView = true;
						if ( typeof keypath === 'object' ) {
							view.set( keypath );
						} else {
							view.set( keypath, value );
						}
						settingView = false;
					}
				};

				if ( view.twoway ) {
					setModel = function ( keypath, value ) {
						if ( !settingView ) {
							settingModel = true;
							model.set( keypath, value );
							settingModel = false;
						}
					};
				}
			}

			else {
				setView = function ( keypath, value ) {
					var data;

					if ( !settingModel ) {
						settingView = true;
						if ( typeof keypath === 'object' ) {
							data = prefix( keypath );
							view.set( data );
						} else {
							view.set( path + keypath, value );
						}
						settingView = false;
					}
				};

				if ( view.twoway ) {
					setModel = function ( keypath, value ) {
						if ( !settingView ) {
							if ( pathMatcher.test( keypath ) ) {
								settingModel = true;
								model.set( keypath.substring( pathLength ), value );
								settingModel = false;
							}
						}
					};
				}
			}

			model.on( 'change', setView );
	
			if ( view.twoway ) {
				view.on( 'set', setModel );
			}
			
			// initialise
			data = ( path ? prefix( model.get() ) : model.get() );

			if ( data ) {
				view.set( path ? prefix( model.get() ) : model.get() );
			}
		},

		teardown: function ( view ) {
			model.off( 'change', setView );
			view.off( 'set', setModel );
		}
	};
};
// These are a subset of the easing equations found at
// https://raw.github.com/danro/easing-js - license info
// follows:

// --------------------------------------------------
// easing.js v0.5.4
// Generic set of easing functions with AMD support
// https://github.com/danro/easing-js
// This code may be freely distributed under the MIT license
// http://danro.mit-license.org/
// --------------------------------------------------
// All functions adapted from Thomas Fuchs & Jeremy Kahn
// Easing Equations (c) 2003 Robert Penner, BSD license
// https://raw.github.com/danro/easing-js/master/LICENSE
// --------------------------------------------------

// In that library, the functions named easeIn, easeOut, and
// easeInOut below are named easeInCubic, easeOutCubic, and
// (you guessed it) easeInOutCubic.
//
// You can add additional easing functions to this list, and they
// will be globally available.

easing = {
	linear: function ( pos ) { return pos; },
	easeIn: function ( pos ) { return Math.pow( pos, 3 ); },
	easeOut: function ( pos ) { return ( Math.pow( ( pos - 1 ), 3 ) + 1 ); },
	easeInOut: function ( pos ) {
		if ( ( pos /= 0.5 ) < 1 ) { return ( 0.5 * Math.pow( pos, 3 ) ); }
		return ( 0.5 * ( Math.pow( ( pos - 2 ), 3 ) + 2 ) );
	}
};
eventDefinitions.tap = function ( node, fire ) {
	var mousedown, touchstart, distanceThreshold, timeThreshold;

	distanceThreshold = 5; // maximum pixels pointer can move before cancel
	timeThreshold = 400;   // maximum milliseconds between down and up before cancel

	mousedown = function ( event ) {
		var currentTarget, x, y, up, move, cancel;

		x = event.clientX;
		y = event.clientY;
		currentTarget = this;

		up = function ( event ) {
			fire({
				node: currentTarget,
				original: event
			});

			cancel();
		};

		move = function ( event ) {
			if ( ( Math.abs( event.clientX - x ) >= distanceThreshold ) || ( Math.abs( event.clientY - y ) >= distanceThreshold ) ) {
				cancel();
			}
		};

		cancel = function () {
			window.removeEventListener( 'mousemove', move );
			window.removeEventListener( 'mouseup', up );
		};

		window.addEventListener( 'mousemove', move );
		window.addEventListener( 'mouseup', up );

		setTimeout( cancel, timeThreshold );
	};

	node.addEventListener( 'mousedown', mousedown );


	touchstart = function ( event ) {
		var currentTarget, x, y, touch, finger, move, up, cancel;

		if ( event.touches.length !== 1 ) {
			return;
		}

		touch = event.touches[0];

		x = touch.clientX;
		y = touch.clientY;
		currentTarget = this;

		finger = touch.identifier;

		up = function ( event ) {
			var touch;

			touch = event.changedTouches[0];
			if ( touch.identifier !== finger ) {
				cancel();
			}

			event.preventDefault();  // prevent compatibility mouse event
			fire({
				node: currentTarget,
				original: event
			});
			
			cancel();
		};

		move = function ( event ) {
			var touch;

			if ( event.touches.length !== 1 || event.touches[0].identifier !== finger ) {
				cancel();
			}

			touch = event.touches[0];
			if ( ( Math.abs( touch.clientX - x ) >= distanceThreshold ) || ( Math.abs( touch.clientY - y ) >= distanceThreshold ) ) {
				cancel();
			}
		};

		cancel = function () {
			window.removeEventListener( 'touchmove', move );
			window.removeEventListener( 'touchend', up );
			window.removeEventListener( 'touchcancel', cancel );
		};

		window.addEventListener( 'touchmove', move );
		window.addEventListener( 'touchend', up );
		window.addEventListener( 'touchcancel', cancel );

		setTimeout( cancel, timeThreshold );
	};

	node.addEventListener( 'touchstart', touchstart );


	return {
		teardown: function () {
			node.removeEventListener( 'mousedown', mousedown );
			node.removeEventListener( 'touchstart', touchstart );
		}
	};
};
(function () {

	var fillGaps,
		clone,
		augment,

		inheritFromParent,
		wrapMethod,
		inheritFromChildProps,
		conditionallyParseTemplate,
		extractInlinePartials,
		conditionallyParsePartials,
		initChildInstance,

		extendable,
		inheritable,
		blacklist;

	extend = function ( childProps ) {

		var Parent, Child, key, template, partials, partial, member;

		Parent = this;

		// create Child constructor
		Child = function ( options ) {
			initChildInstance( this, Child, options || {});
		};

		Child.prototype = create( Parent.prototype );

		// inherit options from parent, if we're extending a subclass
		if ( Parent !== Ractive ) {
			inheritFromParent( Child, Parent );
		}

		// apply childProps
		inheritFromChildProps( Child, childProps );

		// parse template and any partials that need it
		conditionallyParseTemplate( Child );
		extractInlinePartials( Child, childProps );
		conditionallyParsePartials( Child );
		
		Child.extend = Parent.extend;

		return Child;
	};

	extendable = [ 'data', 'partials', 'transitions', 'eventDefinitions' ];
	inheritable = [ 'el', 'template', 'complete', 'modifyArrays', 'twoway', 'lazy', 'append', 'preserveWhitespace', 'sanitize' ];
	blacklist = extendable.concat( inheritable );

	inheritFromParent = function ( Child, Parent ) {
		extendable.forEach( function ( property ) {
			if ( Parent[ property ] ) {
				Child[ property ] = clone( Parent[ property ] );
			}
		});

		inheritable.forEach( function ( property ) {
			if ( Parent[ property ] !== undefined ) {
				Child[ property ] = Parent[ property ];
			}
		});
	};

	wrapMethod = function ( method, superMethod ) {
		if ( /_super/.test( method ) ) {
			return function () {
				var _super = this._super;
				this._super = superMethod;

				method.apply( this, arguments );

				this._super = _super;
			};
		}

		else {
			return method;
		}
	};

	inheritFromChildProps = function ( Child, childProps ) {
		var key, member;

		extendable.forEach( function ( property ) {
			var value = childProps[ property ];

			if ( value ) {
				if ( Child[ property ] ) {
					augment( Child[ property ], value );
				}

				else {
					Child[ property ] = value;
				}
			}
		});

		inheritable.forEach( function ( property ) {
			if ( childProps[ property ] !== undefined ) {
				Child[ property ] = childProps[ property ];
			}
		});

		// Blacklisted properties don't extend the child, as they are part of the initialisation options
		for ( key in childProps ) {
			if ( childProps.hasOwnProperty( key ) && !Child.prototype.hasOwnProperty( key ) && blacklist.indexOf( key ) === -1 ) {
				member = childProps[ key ];

				// if this is a method that overwrites a prototype method, we may need
				// to wrap it
				if ( typeof member === 'function' && typeof Child.prototype[ key ] === 'function' ) {
					Child.prototype[ key ] = wrapMethod( member, Child.prototype[ key ] );
				} else {
					Child.prototype[ key ] = member;
				}
			}
		}
	};

	conditionallyParseTemplate = function ( Child ) {
		var templateEl;

		if ( typeof Child.template === 'string' ) {
			if ( !Ractive.parse ) {
				throw new Error( missingParser );
			}

			if ( Child.template.charAt( 0 ) === '#' ) {
				templateEl = document.getElementById( Child.template.substring( 1 ) );
				if ( templateEl && templateEl.tagName === 'SCRIPT' ) {
					Child.template = Ractive.parse( templateEl.innerHTML, Child );
				} else {
					throw new Error( 'Could not find template element (' + Child.template + ')' );
				}
			} else {
				Child.template = Ractive.parse( Child.template, Child ); // all the relevant options are on Child
			}
		}
	};

	extractInlinePartials = function ( Child, childProps ) {
		// does our template contain inline partials?
		if ( isObject( Child.template ) ) {
			if ( !Child.partials ) {
				Child.partials = {};
			}

			// get those inline partials
			augment( Child.partials, Child.template.partials );

			// but we also need to ensure that any explicit partials override inline ones
			if ( childProps.partials ) {
				augment( Child.partials, childProps.partials );
			}

			// move template to where it belongs
			Child.template = Child.template.template;
		}
	};

	conditionallyParsePartials = function ( Child ) {
		var key, partial;

		// Parse partials, if necessary
		if ( Child.partials ) {
			for ( key in Child.partials ) {
				if ( Child.partials.hasOwnProperty( key ) ) {
					if ( typeof Child.partials[ key ] === 'string' ) {
						if ( !Ractive.parse ) {
							throw new Error( missingParser );
						}

						partial = Ractive.parse( Child.partials[ key ], Child );
					} else {
						partial = Child.partials[ key ];
					}

					Child.partials[ key ] = partial;
				}
			}
		}
	};

	initChildInstance = function ( child, Child, options ) {
		var key, i, optionName;

		// Add template to options, if necessary
		if ( !options.template && Child.template ) {
			options.template = Child.template;
		}

		extendable.forEach( function ( property ) {
			if ( !options[ property ] ) {
				if ( Child[ property ] ) {
					options[ property ] = clone( Child[ property ] );
				}
			} else {
				fillGaps( options[ property ], Child[ property ] );
			}
		});
		
		inheritable.forEach( function ( property ) {
			if ( options[ property ] === undefined && Child[ property ] !== undefined ) {
				options[ property ] = Child[ property ];
			}
		});

		Ractive.call( child, options );

		if ( child.init ) {
			child.init.call( child, options );
		}
	};

	fillGaps = function ( target, source ) {
		var key;

		for ( key in source ) {
			if ( source.hasOwnProperty( key ) && !target.hasOwnProperty( key ) ) {
				target[ key ] = source[ key ];
			}
		}
	};

	clone = function ( source ) {
		var target = {}, key;

		for ( key in source ) {
			if ( source.hasOwnProperty( key ) ) {
				target[ key ] = source[ key ];
			}
		}

		return target;
	};

	augment = function ( target, source ) {
		var key;

		for ( key in source ) {
			if ( source.hasOwnProperty( key ) ) {
				target[ key ] = source[ key ];
			}
		}
	};

}());
interpolate = function ( from, to ) {
	if ( isNumeric( from ) && isNumeric( to ) ) {
		return Ractive.interpolators.number( +from, +to );
	}

	if ( isArray( from ) && isArray( to ) ) {
		return Ractive.interpolators.array( from, to );
	}

	if ( isObject( from ) && isObject( to ) ) {
		return Ractive.interpolators.object( from, to );
	}

	return function () { return to; };
};
interpolators = {
	number: function ( from, to ) {
		var delta = to - from;

		if ( !delta ) {
			return function () { return from; };
		}

		return function ( t ) {
			return from + ( t * delta );
		};
	},

	array: function ( from, to ) {
		var intermediate, interpolators, len, i;

		intermediate = [];
		interpolators = [];

		i = len = Math.min( from.length, to.length );
		while ( i-- ) {
			interpolators[i] = Ractive.interpolate( from[i], to[i] );
		}

		// surplus values - don't interpolate, but don't exclude them either
		for ( i=len; i<from.length; i+=1 ) {
			intermediate[i] = from[i];
		}

		for ( i=len; i<to.length; i+=1 ) {
			intermediate[i] = to[i];
		}

		return function ( t ) {
			var i = len;

			while ( i-- ) {
				intermediate[i] = interpolators[i]( t );
			}

			return intermediate;
		};
	},

	object: function ( from, to ) {
		var properties = [], len, interpolators, intermediate, prop;

		intermediate = {};
		interpolators = {};

		for ( prop in from ) {
			if ( from.hasOwnProperty( prop ) ) {
				if ( to.hasOwnProperty( prop ) ) {
					properties[ properties.length ] = prop;
					interpolators[ prop ] = Ractive.interpolate( from[ prop ], to[ prop ] );
				}

				else {
					intermediate[ prop ] = from[ prop ];
				}
			}
		}

		for ( prop in to ) {
			if ( to.hasOwnProperty( prop ) && !from.hasOwnProperty( prop ) ) {
				intermediate[ prop ] = to[ prop ];
			}
		}

		len = properties.length;

		return function ( t ) {
			var i = len, prop;

			while ( i-- ) {
				prop = properties[i];

				intermediate[ prop ] = interpolators[ prop ]( t );
			}

			return intermediate;
		};
	}
};
var defaultOptions = createFromNull();

defineProperties( defaultOptions, {
	preserveWhitespace: { enumerable: true, value: false },
	append:             { enumerable: true, value: false },
	twoway:             { enumerable: true, value: true  },
	modifyArrays:       { enumerable: true, value: true  },
	data:               { enumerable: true, value: {}    },
	lazy:               { enumerable: true, value: false },
	debug:              { enumerable: true, value: false },
	transitions:        { enumerable: true, value: {}    },
	eventDefinitions:   { enumerable: true, value: {}    }
});

Ractive = function ( options ) {

	var key, partial, i, template, templateEl, parsedTemplate;

	// Options
	// -------
	for ( key in defaultOptions ) {
		if ( !options.hasOwnProperty( key ) ) {
			options[ key ] = ( typeof defaultOptions[ key ] === 'object' ? {} : defaultOptions[ key ] );
		}
	}


	// Initialization
	// --------------

	// We use Object.defineProperties (where possible) as these should be read-only
	defineProperties( this, {
		// Generate a unique identifier, for places where you'd use a weak map if it
		// existed
		_guid: {
			value: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
				var r, v;

				r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
				return v.toString(16);
			})
		},

		// events
		_subs: { value: createFromNull() },

		// cache
		_cache: { value: {} }, // we need to be able to use hasOwnProperty, so can't inherit from null
		_cacheMap: { value: createFromNull() },

		// dependency graph
		_deps: { value: [] },
		_depsMap: { value: createFromNull() },

		// unresolved dependants
		_pendingResolution: { value: [] },

		// Create arrays for deferred attributes and evaluators
		_defAttrs: { value: [] },
		_defEvals: { value: [] },

		// Cache proxy event handlers - allows efficient reuse
		_proxies: { value: createFromNull() },
		_customProxies: { value: createFromNull() },

		// Keep a list of used evaluators, so we don't duplicate them
		_evaluators: { value: createFromNull() },

		// bindings
		_bound: { value: [] },

		// transition manager
		_transitionManager: { value: null, writable: true },

		// animations (so we can stop any in progress at teardown)
		_animations: { value: [] },

		// nodes registry
		nodes: { value: {} }
	});

	// options
	this.modifyArrays = options.modifyArrays;
	this.twoway = options.twoway;
	this.lazy = options.lazy;
	this.debug = options.debug;

	this.el = getEl( options.el );

	// add data
	this.data = options.data || {};
	

	// Partials registry
	this.partials = {};

	// Transition registry
	this.transitions = options.transitions;

	// Instance-specific event definitions registry
	this.eventDefinitions = options.eventDefinitions;

	// Set up bindings
	if ( options.bindings ) {
		if ( isArray( options.bindings ) ) {
			for ( i=0; i<options.bindings.length; i+=1 ) {
				this.bind( options.bindings[i] );
			}
		} else {
			this.bind( options.bindings );
		}
	}


	// Parse template, if necessary
	template = options.template;

	if ( typeof template === 'string' ) {
		if ( !Ractive.parse ) {
			throw new Error( missingParser );
		}

		if ( template.charAt( 0 ) === '#' ) {
			// assume this is an ID of a <script type='text/ractive'> tag
			templateEl = doc.getElementById( template.substring( 1 ) );
			if ( templateEl ) {
				parsedTemplate = Ractive.parse( templateEl.innerHTML, options );
			}

			else {
				throw new Error( 'Could not find template element (' + template + ')' );
			}
		}

		else {
			parsedTemplate = Ractive.parse( template, options );
		}
	} else {
		parsedTemplate = template;
	}

	// deal with compound template
	if ( isObject( parsedTemplate ) ) {
		this.partials = parsedTemplate.partials;
		parsedTemplate = parsedTemplate.template;
	}

	// If the template was an array with a single string member, that means
	// we can use innerHTML - we just need to unpack it
	if ( parsedTemplate && ( parsedTemplate.length === 1 ) && ( typeof parsedTemplate[0] === 'string' ) ) {
		parsedTemplate = parsedTemplate[0];
	}

	this.template = parsedTemplate;


	// If we were given unparsed partials, parse them
	if ( options.partials ) {
		for ( key in options.partials ) {
			if ( options.partials.hasOwnProperty( key ) ) {
				partial = options.partials[ key ];

				if ( typeof partial === 'string' ) {
					if ( !Ractive.parse ) {
						throw new Error( missingParser );
					}

					partial = Ractive.parse( partial, options );
				}

				this.partials[ key ] = partial;
			}
		}
	}

	// Unpack string-based partials, if necessary
	for ( key in this.partials ) {
		if ( this.partials.hasOwnProperty( key ) && this.partials[ key ].length === 1 && typeof this.partials[ key ][0] === 'string' ) {
			this.partials[ key ] = this.partials[ key ][0];
		}
	}

	// If passed an element, render immediately
	if ( this.el ) {
		this.render({ el: this.el, append: options.append, complete: options.complete });
	}
};

(function () {

	var getOriginalComputedStyles, setStyle, augment, makeTransition, transform, transformsEnabled, inside, outside;

	getOriginalComputedStyles = function ( computedStyle, properties ) {
		var original = {}, i;

		i = properties.length;
		while ( i-- ) {
			original[ properties[i] ] = computedStyle[ properties[i] ];
		}

		return original;
	};

	setStyle = function ( node, properties, map, params ) {
		var i = properties.length, prop;

		while ( i-- ) {
			prop = properties[i];
			if ( map && map[ prop ] ) {
				if ( typeof map[ prop ] === 'function' ) {
					node.style[ prop ] = map[ prop ]( params );
				} else {
					node.style[ prop ] = map[ prop ];
				}
			}

			else {
				node.style[ prop ] = 0;
			}
		}
	};

	augment = function ( target, source ) {
		var key;

		if ( !source ) {
			return target;
		}

		for ( key in source ) {
			if ( source.hasOwnProperty( key ) ) {
				target[ key ] = source[ key ];
			}
		}

		return target;
	};

	makeTransition = function ( properties, defaults, outside, inside ) {
		if ( typeof properties === 'string' ) {
			properties = [ properties ];
		}

		return function ( node, complete, params, info, isIntro ) {
			var transitionEndHandler, transitionStyle, computedStyle, originalComputedStyles, startTransition, originalStyle, originalOpacity, targetOpacity, duration, delay, start, end, source, target, positionStyle, visibilityStyle, stylesToRemove;

			params = parseTransitionParams( params );
			
			duration = params.duration || defaults.duration;
			easing = hyphenate( params.easing || defaults.easing );
			delay = ( params.delay || defaults.delay || 0 ) + ( ( params.stagger || defaults.stagger || 0 ) * info.i );

			start = ( isIntro ? outside : inside );
			end = ( isIntro ? inside : outside );

			computedStyle = window.getComputedStyle( node );
			originalStyle = node.getAttribute( 'style' );

			// if this is an intro, we need to transition TO the original styles
			if ( isIntro ) {
				// hide, to avoid flashes
				positionStyle = node.style.position;
				visibilityStyle = node.style.visibility;
				node.style.position = 'absolute';
				node.style.visibility = 'hidden';

				// we need to wait a beat before we can actually get values from computedStyle.
				// Yeah, I know, WTF browsers
				setTimeout( function () {
					var i, prop;

					originalComputedStyles = getOriginalComputedStyles( computedStyle, properties );
					
					start = outside;
					end = augment( originalComputedStyles, inside );

					// starting style
					node.style.position = positionStyle;
					node.style.visibility = visibilityStyle;
					
					setStyle( node, properties, start, params );

					setTimeout( startTransition, 0 );
				}, delay );
			}

			// otherwise we need to transition FROM them
			else {
				setTimeout( function () {
					var i, prop;

					originalComputedStyles = getOriginalComputedStyles( computedStyle, properties );

					start = augment( originalComputedStyles, inside );
					end = outside;

					// ending style
					setStyle( node, properties, start, params );

					setTimeout( startTransition, 0 );
				}, delay );
			}

			startTransition = function () {
				var i, prop;

				node.style[ transition + 'Duration' ] = ( duration / 1000 ) + 's';
				node.style[ transition + 'Properties' ] = properties.map( hyphenate ).join( ',' );
				node.style[ transition + 'TimingFunction' ] = easing;

				transitionEndHandler = function ( event ) {
					node.removeEventListener( transitionend, transitionEndHandler );

					if ( isIntro ) {
						node.setAttribute( 'style', originalStyle );
					}

					complete();
				};
				
				node.addEventListener( transitionend, transitionEndHandler );

				setStyle( node, properties, end, params );
			};
		};
	};

	transitions.slide = makeTransition([
		'height',
		'borderTopWidth',
		'borderBottomWidth',
		'paddingTop',
		'paddingBottom',
		'overflowY'
	], { duration: 400, easing: 'easeInOut' }, { overflowY: 'hidden' }, { overflowY: 'hidden' });

	transitions.fade = makeTransition( 'opacity', {
		duration: 300,
		easing: 'linear'
	});

	/*// get prefixed transform property name
	(function ( propertyNames ) {
		var i = propertyNames.length, testDiv = document.createElement( 'div' );
		while ( i-- ) {
			if ( testDiv.style[ propertyNames[i] ] !== undefined ) {
				transform = propertyNames[i];
				transformsEnabled = true;
				break;
			}
		}
	}([ 'OTransform', 'msTransform', 'MozTransform', 'webkitTransform', 'transform' ]));*/

	transitions.fly = makeTransition([ 'opacity', 'left', 'position' ], {
		duration: 400, easing: 'easeOut'
	}, { position: 'relative', left: '-500px' }, { position: 'relative', left: 0 });

}());
var parseTransitionParams = function ( params ) {
	if ( params === 'fast' ) {
		return { duration: 200 };
	}

	if ( params === 'slow' ) {
		return { duration: 600 };
	}

	if ( isNumeric( params ) ) {
		return { duration: +params };
	}

	return params || {};
};
(function ( Ractive ) {

	var requestFullscreen, cancelFullscreen, fullscreenElement, testDiv;

	if ( !doc ) {
		return;
	}

	Ractive.fullscreenEnabled = doc.fullscreenEnabled || doc.mozFullScreenEnabled || doc.webkitFullscreenEnabled;

	if ( !Ractive.fullscreenEnabled ) {
		Ractive.requestFullscreen = Ractive.cancelFullscreen = noop;
		return;
	}

	testDiv = document.createElement( 'div' );

	// get prefixed name of requestFullscreen method
	if ( testDiv.requestFullscreen ) {
		requestFullscreen = 'requestFullscreen';
	} else if ( testDiv.mozRequestFullScreen ) {
		requestFullscreen = 'mozRequestFullScreen';
	} else if ( testDiv.webkitRequestFullscreen ) {
		requestFullscreen = 'webkitRequestFullscreen';
	}

	Ractive.requestFullscreen = function ( el ) {
		if ( el[ requestFullscreen ] ) {
			el[ requestFullscreen ]();
		}
	};

	// get prefixed name of cancelFullscreen method
	if ( doc.cancelFullscreen ) {
		cancelFullscreen = 'cancelFullscreen';
	} else if ( doc.mozCancelFullScreen ) {
		cancelFullscreen = 'mozCancelFullScreen';
	} else if ( doc.webkitCancelFullScreen ) {
		cancelFullscreen = 'webkitCancelFullScreen';
	}

	Ractive.cancelFullscreen = function () {
		doc[ cancelFullscreen ]();
	};

	// get prefixed name of fullscreenElement property
	if ( doc.fullscreenElement !== undefined ) {
		fullscreenElement = 'fullscreenElement';
	} else if ( document.mozFullScreenElement !== undefined ) {
		fullscreenElement = 'mozFullScreenElement';
	} else if ( document.webkitFullscreenElement !== undefined ) {
		fullscreenElement = 'webkitFullscreenElement';
	}

	Ractive.isFullscreen = function ( el ) {
		return el === doc[ fullscreenElement ];
	};

}( Ractive ));
Animation = function ( options ) {
	var key;

	this.startTime = Date.now();

	// from and to
	for ( key in options ) {
		if ( options.hasOwnProperty( key ) ) {
			this[ key ] = options[ key ];
		}
	}

	this.interpolator = Ractive.interpolate( this.from, this.to );
	this.running = true;
};

Animation.prototype = {
	tick: function () {
		var elapsed, t, value, timeNow, index;

		if ( this.running ) {
			timeNow = Date.now();
			elapsed = timeNow - this.startTime;

			if ( elapsed >= this.duration ) {
				this.root.set( this.keys, this.to );

				if ( this.step ) {
					this.step( 1, this.to );
				}

				if ( this.complete ) {
					this.complete( 1, this.to );
				}

				index = this.root._animations.indexOf( this );

				// TODO remove this check, once we're satisifed this never happens!
				if ( index === -1 && console && console.warn ) {
					console.warn( 'Animation was not found' );
				}

				this.root._animations.splice( index, 1 );

				this.running = false;
				return false;
			}

			t = this.easing ? this.easing ( elapsed / this.duration ) : ( elapsed / this.duration );
			value = this.interpolator( t );

			this.root.set( this.keys, value );

			if ( this.step ) {
				this.step( t, value );
			}

			return true;
		}

		return false;
	},

	stop: function () {
		var index;

		this.running = false;

		index = this.root._animations.indexOf( this );

		// TODO remove this check, once we're satisifed this never happens!
		if ( index === -1 && console && console.warn ) {
			console.warn( 'Animation was not found' );
		}

		this.root._animations.splice( index, 1 );
	}
};
animationCollection = {
	animations: [],

	tick: function () {
		var i, animation;

		for ( i=0; i<this.animations.length; i+=1 ) {
			animation = this.animations[i];

			if ( !animation.tick() ) {
				// animation is complete, remove it from the stack, and decrement i so we don't miss one
				this.animations.splice( i--, 1 );
			}
		}

		if ( this.animations.length ) {
			global.requestAnimationFrame( this.boundTick );
		} else {
			this.running = false;
		}
	},

	// bind method to animationCollection
	boundTick: function () {
		animationCollection.tick();
	},

	push: function ( animation ) {
		this.animations[ this.animations.length ] = animation;

		if ( !this.running ) {
			this.running = true;
			this.tick();
		}
	}
};
// https://gist.github.com/paulirish/1579671
(function( vendors, lastTime, global ) {
	
	var x;

	for ( x = 0; x < vendors.length && !global.requestAnimationFrame; ++x ) {
		global.requestAnimationFrame = global[vendors[x]+'RequestAnimationFrame'];
		global.cancelAnimationFrame = global[vendors[x]+'CancelAnimationFrame'] || global[vendors[x]+'CancelRequestAnimationFrame'];
	}

	if ( !global.requestAnimationFrame ) {
		global.requestAnimationFrame = function(callback) {
			var currTime, timeToCall, id;
			
			currTime = Date.now();
			timeToCall = Math.max( 0, 16 - (currTime - lastTime ) );
			id = global.setTimeout( function() { callback(currTime + timeToCall); }, timeToCall );
			
			lastTime = currTime + timeToCall;
			return id;
		};
	}

	if ( !global.cancelAnimationFrame ) {
		global.cancelAnimationFrame = function( id ) {
			global.clearTimeout( id );
		};
	}
}( ['ms', 'moz', 'webkit', 'o'], 0, global ));
(function () {

	var notifyArrayDependants,
		
		reassignDependants,
		sidewaysShift,
		queueReassignments,
		dispatchReassignmentQueue,
		dispatchIndexRefReassignmentQueue,

		wrapArray,
		unwrapArray,
		WrappedArrayProto,
		testObj,
		mutatorMethods;


	// Register a keypath to this array. When any of this array's mutator methods are called,
	// it will `set` that keypath on the given Ractive instance
	registerKeypathToArray = function ( array, keypath, root ) {
		var roots, keypathsByGuid, rootIndex, keypaths;

		// If this array hasn't been wrapped, we need to wrap it
		if ( !array._ractive ) {
			defineProperty( array, '_ractive', {
				value: {
					roots: [ root ], // there may be more than one Ractive instance depending on this
					keypathsByGuid: {}
				},
				configurable: true
			});

			array._ractive.keypathsByGuid[ root._guid ] = [ keypath ];

			wrapArray( array );
		}

		else {
			roots = array._ractive.roots;
			keypathsByGuid = array._ractive.keypathsByGuid;

			// Does this Ractive instance currently depend on this array?
			// If not, associate them
			if ( !keypathsByGuid[ root._guid ] ) {
				roots[ roots.length ] = root;
				keypathsByGuid[ root._guid ] = [];
			}

			keypaths = keypathsByGuid[ root._guid ];

			// If the current keypath isn't among them, add it
			if ( keypaths.indexOf( keypath ) === -1 ) {
				keypaths[ keypaths.length ] = keypath;
			}
		}
	};


	// Unregister keypath from array
	unregisterKeypathFromArray = function ( array, keypath, root ) {
		var roots, keypathsByGuid, rootIndex, keypaths, keypathIndex;

		if ( !array._ractive ) {
			throw new Error( 'Attempted to remove keypath from non-wrapped array. This error is unexpected - please send a bug report to @rich_harris' );
		}

		roots = array._ractive.roots;
		keypathsByGuid = array._ractive.keypathsByGuid;

		if ( !keypathsByGuid[ root._guid ] ) {
			throw new Error( 'Ractive instance was not listed as a dependent of this array. This error is unexpected - please send a bug report to @rich_harris' );
		}

		keypaths = keypathsByGuid[ root._guid ];
		keypathIndex = keypaths.indexOf( keypath );

		if ( keypathIndex === -1 ) {
			throw new Error( 'Attempted to unlink non-linked keypath from array. This error is unexpected - please send a bug report to @rich_harris' );
		}

		keypaths.splice( keypathIndex, 1 );

		if ( !keypaths.length ) {
			roots.splice( roots.indexOf( root ), 1 );
			keypathsByGuid[ root._guid ] = null;
		}

		if ( !roots.length ) {
			unwrapArray( array ); // It's good to clean up after ourselves
		}
	};


	notifyArrayDependants = function ( array, methodName, args ) {
		var processRoots,
			processRoot,
			processKeypaths,
			processKeypath,
			queueAllDependants,
			queueDependants,
			keypathsByGuid;

		keypathsByGuid = array._ractive.keypathsByGuid;

		processRoots = function ( roots ) {
			var i = roots.length;
			while ( i-- ) {
				processRoot( roots[i] );
			}
		};

		processRoot = function ( root ) {
			var previousTransitionManager = root._transitionManager;

			root._transitionManager = makeTransitionManager( root, noop );
			processKeypaths( root, keypathsByGuid[ root._guid ] );
			root._transitionManager = previousTransitionManager;
		};

		processKeypaths = function ( root, keypaths ) {
			var i = keypaths.length;
			while ( i-- ) {
				processKeypath( root, keypaths[i] );
			}
		};

		processKeypath = function ( root, keypath ) {
			var depsByKeypath, deps, keys, upstreamQueue, smartUpdateQueue, dumbUpdateQueue, i, j, item;

			// We don't do root.set(), because we don't want to update DOM sections
			// using the normal method - we want to do a smart update whereby elements
			// are removed from the right place. But we do need to clear the cache
			clearCache( root, keypath );
			
			// find dependants. If any are DOM sections, we do a smart update
			// rather than a ractive.set() blunderbuss
			smartUpdateQueue = [];
			dumbUpdateQueue = [];

			for ( i=0; i<root._deps.length; i+=1 ) { // we can't cache root._deps.length as it may change!
				depsByKeypath = root._deps[i];

				if ( !depsByKeypath ) {
					continue;
				}

				deps = depsByKeypath[ keypath ];
				
				if ( deps ) {
					queueDependants( root, keypath, deps, smartUpdateQueue, dumbUpdateQueue );

					// we may have some deferred evaluators to process
					processDeferredUpdates( root );
					
					while ( smartUpdateQueue.length ) {
						smartUpdateQueue.pop().smartUpdate( methodName, args );
					}

					while ( dumbUpdateQueue.length ) {
						dumbUpdateQueue.pop().update();
					}
				}
			}

			// we may have some deferred attributes to process
			processDeferredUpdates( root );

			// Finally, notify direct dependants of upstream keypaths...
			upstreamQueue = [];

			keys = splitKeypath( keypath );
			while ( keys.length ) {
				keys.pop();
				upstreamQueue[ upstreamQueue.length ] = keys.join( '.' );
			}

			// ...and length property!
			upstreamQueue[ upstreamQueue.length ] = keypath + '.length';

			notifyMultipleDependants( root, upstreamQueue, true );
		};

		// TODO can we get rid of this whole queueing nonsense?
		queueDependants = function ( root, keypath, deps, smartUpdateQueue, dumbUpdateQueue ) {
			var k, dependant;

			k = deps.length;
			while ( k-- ) {
				dependant = deps[k];

				// references need to get processed before mustaches
				if ( dependant.type === REFERENCE ) {
					dependant.update();
					//dumbUpdateQueue[ dumbUpdateQueue.length ] = dependant;
				}

				// is this a DOM section?
				else if ( dependant.keypath === keypath && dependant.type === SECTION /*&& dependant.parentNode*/ ) {
					smartUpdateQueue[ smartUpdateQueue.length ] = dependant;

				} else {
					dumbUpdateQueue[ dumbUpdateQueue.length ] = dependant;
				}
			}
		};

		processRoots( array._ractive.roots );
	};





		
	WrappedArrayProto = [];
	mutatorMethods = [ 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ];

	mutatorMethods.forEach( function ( methodName ) {
		var method = function () {
			var result = Array.prototype[ methodName ].apply( this, arguments );

			this._ractive.setting = true;
			notifyArrayDependants( this, methodName, arguments );
			this._ractive.setting = false;

			return result;
		};

		defineProperty( WrappedArrayProto, methodName, {
			value: method
		});
	});

	
	// can we use prototype chain injection?
	// http://perfectionkills.com/how-ecmascript-5-still-does-not-allow-to-subclass-an-array/#wrappers_prototype_chain_injection
	testObj = {};
	if ( testObj.__proto__ ) {
		// yes, we can
		wrapArray = function ( array ) {
			array.__proto__ = WrappedArrayProto;
		};

		unwrapArray = function ( array ) {
			delete array._ractive;
			array.__proto__ = Array.prototype;
		};
	}

	else {
		// no, we can't
		wrapArray = function ( array ) {
			var i, methodName;

			i = mutatorMethods.length;
			while ( i-- ) {
				methodName = mutatorMethods[i];
				defineProperty( array, methodName, {
					value: WrappedArrayProto[ methodName ]
				});
			}
		};

		unwrapArray = function ( array ) {
			var i;

			i = mutatorMethods.length;
			while ( i-- ) {
				delete array[ mutatorMethods[i] ];
			}

			delete array._ractive;
		};
	}

}());
(function ( cache ) {

	var Reference, getFunctionFromString;

	Evaluator = function ( root, keypath, functionStr, args, priority ) {
		var i, arg;

		this.root = root;
		this.keypath = keypath;

		this.fn = getFunctionFromString( functionStr, args.length );
		this.values = [];
		this.refs = [];

		i = args.length;
		while ( i-- ) {
			arg = args[i];

			if ( arg[0] ) {
				// this is an index ref... we don't need to register a dependant
				this.values[i] = arg[1];
			}

			else {
				this.refs[ this.refs.length ] = new Reference( root, arg[1], this, i, priority );
			}
		}

		this.selfUpdating = ( this.refs.length <= 1 );

		this.update();
	};

	Evaluator.prototype = {
		bubble: function () {
			// If we only have one reference, we can update immediately...
			if ( this.selfUpdating ) {
				this.update();
			}

			// ...otherwise we want to register it as a deferred item, to be
			// updated once all the information is in, to prevent unnecessary
			// cascading. Only if we're already resolved, obviously
			else if ( !this.deferred ) {
				this.root._defEvals[ this.root._defEvals.length ] = this;
				this.deferred = true;
			}
		},

		update: function () {
			var value;

			try {
				value = this.fn.apply( null, this.values );
			} catch ( err ) {
				if ( this.root.debug ) {
					throw err;
				} else {
					value = undefined;
				}
			}

			if ( !isEqual( value, this.value ) ) {
				clearCache( this.root, this.keypath );
				this.root._cache[ this.keypath ] = value;
				notifyDependants( this.root, this.keypath );

				this.value = value;
			}

			return this;
		},

		// TODO should evaluators ever get torn down?
		teardown: function () {
			while ( this.refs.length ) {
				this.refs.pop().teardown();
			}

			clearCache( this.root, this.keypath );
			this.root._evaluators[ this.keypath ] = null;
		},

		// This method forces the evaluator to sync with the current model
		// in the case of a smart update
		refresh: function () {
			if ( !this.selfUpdating ) {
				this.deferred = true;
			}

			var i = this.refs.length;
			while ( i-- ) {
				this.refs[i].update();
			}

			if ( this.deferred ) {
				this.update();
				this.deferred = false;
			}
		}
	};


	Reference = function ( root, keypath, evaluator, argNum, priority ) {
		this.evaluator = evaluator;
		this.keypath = keypath;
		this.root = root;
		this.argNum = argNum;
		this.type = REFERENCE;
		this.priority = priority;

		this.value = evaluator.values[ argNum ] = root.get( keypath );

		registerDependant( this );
	};

	Reference.prototype = {
		update: function () {
			var value = this.root.get( this.keypath );

			if ( !isEqual( value, this.value ) ) {
				this.evaluator.values[ this.argNum ] = value;
				this.evaluator.bubble();

				this.value = value;
			}
		},

		teardown: function () {
			unregisterDependant( this );
		}
	};


	getFunctionFromString = function ( str, i ) {
		var fn, args;

		str = str.replace( /❖/g, '_' );

		if ( cache[ str ] ) {
			return cache[ str ];
		}

		args = [];
		while ( i-- ) {
			args[i] = '_' + i;
		}

		fn = new Function( args.join( ',' ), 'return(' + str + ')' );

		cache[ str ] = fn;
		return fn;
	};



}({}));
var ExpressionResolver;

(function () {

	var ReferenceScout, getKeypath;

	ExpressionResolver = function ( mustache ) {

		var expression, i, len, ref, indexRefs, args;

		this.root = mustache.root;
		this.mustache = mustache;
		this.args = [];
		this.scouts = [];

		expression = mustache.descriptor.x;
		indexRefs = mustache.parentFragment.indexRefs;

		this.str = expression.s;

		// send out scouts for each reference
		len = this.unresolved = ( expression.r ? expression.r.length : 0 );

		if ( !len ) {
			this.init(); // some expressions don't have references. edge case, but, yeah.
		}

		for ( i=0; i<len; i+=1 ) {
			ref = expression.r[i];
			
			// is this an index ref?
			if ( indexRefs && indexRefs[ ref ] !== undefined ) {
				this.resolveRef( i, true, indexRefs[ ref ] );
			}

			else {
				this.scouts[ this.scouts.length ] = new ReferenceScout( this, ref, mustache.contextStack, i );
			}
		}
	};

	ExpressionResolver.prototype = {
		init: function () {
			this.keypath = getKeypath( this.str, this.args );
			this.createEvaluator();

			this.mustache.resolve( this.keypath );
		},

		teardown: function () {
			while ( this.scouts.length ) {
				this.scouts.pop().teardown();
			}
		},

		resolveRef: function ( argNum, isIndexRef, value ) {
			this.args[ argNum ] = [ isIndexRef, value ];

			// can we initialise yet?
			if ( --this.unresolved ) {
				// no;
				return;
			}

			this.init();
		},

		createEvaluator: function () {
			// only if it doesn't exist yet!
			if ( !this.root._evaluators[ this.keypath ] ) {
				this.root._evaluators[ this.keypath ] = new Evaluator( this.root, this.keypath, this.str, this.args, this.mustache.priority );
			}

			else {
				// we need to trigger a refresh of the evaluator, since it
				// will have become de-synced from the model if we're in a
				// reassignment cycle
				this.root._evaluators[ this.keypath ].refresh();
			}
		}
	};


	ReferenceScout = function ( resolver, ref, contextStack, argNum ) {
		var keypath, root;

		root = this.root = resolver.root;

		keypath = resolveRef( root, ref, contextStack );
		if ( keypath ) {
			resolver.resolveRef( argNum, false, keypath );
		} else {
			this.ref = ref;
			this.argNum = argNum;
			this.resolver = resolver;
			this.contextStack = contextStack;

			root._pendingResolution[ root._pendingResolution.length ] = this;
		}
	};

	ReferenceScout.prototype = {
		resolve: function ( keypath ) {
			this.keypath = keypath;
			this.resolver.resolveRef( this.argNum, false, keypath );
		},

		teardown: function () {
			// if we haven't found a keypath yet, we can
			// stop the search now
			if ( !this.keypath ) {
				teardown( this );
			}
		}
	};

	getKeypath = function ( str, args ) {
		var unique;

		// get string that is unique to this expression
		unique = str.replace( /❖([0-9]+)/g, function ( match, $1 ) {
			return args[ $1 ][1];
		});

		// then sanitize by removing any periods or square brackets. Otherwise
		// splitKeypath will go mental!
		return '(' + unique.replace( /[\.\[\]]/g, '-' ) + ')';
	};

}());
var executeTransition = function ( descriptor, root, owner, contextStack, complete, isIntro ) {
	var transitionName, transitionParams, fragment, transitionManager, transition;

	if ( typeof descriptor === 'string' ) {
		transitionName = descriptor;
	} else {
		transitionName = descriptor.n;

		if ( descriptor.a ) {
			transitionParams = descriptor.a;
		} else if ( descriptor.d ) {
			fragment = new TextFragment({
				descriptor:   descriptor.d,
				root:         root,
				owner:        owner,
				contextStack: parentFragment.contextStack
			});

			transitionParams = fragment.toJson();
			fragment.teardown();
		}
	}

	transition = root.transitions[ transitionName ] || Ractive.transitions[ transitionName ];

	if ( transition ) {
		transitionManager = root._transitionManager;

		if ( transitionManager ) {
			transitionManager.push();
		}

		transition.call( root, owner.node, function () {
			if ( transitionManager ) {
				transitionManager.pop();
			}

			if ( complete ) {
				complete();
			}
		}, transitionParams, transitionManager.info, isIntro );
	}

	else if ( complete ) {
		complete();
	}
};
var getPartialDescriptor;

(function () {

	var getPartialFromRegistry, unpack;

	getPartialDescriptor = function ( root, name ) {
		var el, partial;

		// If the partial was specified on this instance, great
		if ( partial = getPartialFromRegistry( root, name ) ) {
			return partial;
		}

		// If not, is it a global partial?
		if ( partial = getPartialFromRegistry( Ractive, name ) ) {
			return partial;
		}

		// Does it exist on the page as a script tag?
		el = doc.getElementById( name );
		if ( el && el.tagName === 'SCRIPT' ) {
			if ( !Ractive.parse ) {
				throw new Error( missingParser );
			}

			Ractive.partials[ name ] = Ractive.parse( el.innerHTML );
		}

		partial = Ractive.partials[ name ];

		// No match? Return an empty array
		if ( !partial ) {
			if ( root.debug && console && console.warn ) {
				console.warn( 'Could not find descriptor for partial "' + name + '"' );
			}

			return [];
		}

		return unpack( partial );
	};

	getPartialFromRegistry = function ( registry, name ) {
		if ( registry.partials[ name ] ) {
			
			// If this was added manually to the registry, but hasn't been parsed,
			// parse it now
			if ( typeof registry.partials[ name ] === 'string' ) {
				if ( !Ractive.parse ) {
					throw new Error( missingParser );
				}

				registry.partials[ name ] = Ractive.parse( registry.partials[ name ] );
			}

			return unpack( registry.partials[ name ] );
		}
	};

	unpack = function ( partial ) {
		// Unpack string, if necessary
		if ( partial.length === 1 && typeof partial[0] === 'string' ) {
			return partial[0];
		}

		return partial;
	};

}());
initFragment = function ( fragment, options ) {

	var numItems, i, itemOptions, parentRefs, ref;

	// The item that owns this fragment - an element, section, partial, or attribute
	fragment.owner = options.owner;

	// inherited properties
	fragment.root = options.root;
	fragment.parentNode = options.parentNode;
	fragment.contextStack = options.contextStack || [];

	// If parent item is a section, this may not be the only fragment
	// that belongs to it - we need to make a note of the index
	if ( fragment.owner.type === SECTION ) {
		fragment.index = options.index;
	}

	// index references (the 'i' in {{#section:i}}<!-- -->{{/section}}) need to cascade
	// down the tree
	if ( fragment.owner.parentFragment ) {
		parentRefs = fragment.owner.parentFragment.indexRefs;

		if ( parentRefs ) {
			fragment.indexRefs = createFromNull(); // avoids need for hasOwnProperty

			for ( ref in parentRefs ) {
				fragment.indexRefs[ ref ] = parentRefs[ ref ];
			}
		}
	}

	if ( options.indexRef ) {
		if ( !fragment.indexRefs ) {
			fragment.indexRefs = {};
		}

		fragment.indexRefs[ options.indexRef ] = options.index;
	}

	// Time to create this fragment's child items;
	fragment.items = [];

	itemOptions = {
		parentFragment: fragment
	};

	numItems = ( options.descriptor ? options.descriptor.length : 0 );
	for ( i=0; i<numItems; i+=1 ) {
		itemOptions.descriptor = options.descriptor[i];
		itemOptions.index = i;

		fragment.items[ fragment.items.length ] = fragment.createItem( itemOptions );
	}

};
initMustache = function ( mustache, options ) {

	var keypath, index, indexRef, parentFragment;

	parentFragment = mustache.parentFragment = options.parentFragment;

	mustache.root           = parentFragment.root;
	mustache.contextStack   = parentFragment.contextStack;
	
	mustache.descriptor     = options.descriptor;
	mustache.index          = options.index || 0;
	mustache.priority       = options.descriptor.p || 0;

	// DOM only
	if ( parentFragment.parentNode ) {
		mustache.parentNode = parentFragment.parentNode;
	}

	mustache.type = options.descriptor.t;


	// if this is a simple mustache, with a reference, we just need to resolve
	// the reference to a keypath
	if ( options.descriptor.r ) {
		if ( parentFragment.indexRefs && parentFragment.indexRefs[ options.descriptor.r ] !== undefined ) {
			indexRef = parentFragment.indexRefs[ options.descriptor.r ];

			mustache.indexRef = options.descriptor.r;
			mustache.refIndex = indexRef;
			mustache.render( mustache.refIndex );
		}

		else {
			keypath = resolveRef( mustache.root, options.descriptor.r, mustache.contextStack );
			if ( keypath ) {
				mustache.resolve( keypath );
			} else {
				mustache.ref = options.descriptor.r;
				mustache.root._pendingResolution[ mustache.root._pendingResolution.length ] = mustache;

				// inverted section? initialise
				if ( mustache.descriptor.n ) {
					mustache.render( false );
				}
			}
		}
	}

	// if it's an expression, we have a bit more work to do
	if ( options.descriptor.x ) {
		mustache.expressionResolver = new ExpressionResolver( mustache );
	}

};


// methods to add to individual mustache prototypes
updateMustache = function () {
	var value;

	value = this.root.get( this.keypath, true );

	if ( !isEqual( value, this.value ) ) {
		this.render( value );
		this.value = value;
	}
};

resolveMustache = function ( keypath ) {
	// TEMP
	this.keypath = keypath;

	registerDependant( this );
	this.update();

	if ( this.expressionResolver ) {
		this.expressionResolver = null;
	}
};
(function () {

	var updateInvertedSection, updateListSection, updateContextSection, updateConditionalSection;

	updateSection = function ( section, value ) {
		var fragmentOptions;

		fragmentOptions = {
			descriptor: section.descriptor.f,
			root:       section.root,
			parentNode: section.parentNode,
			owner:      section
		};

		// if section is inverted, only check for truthiness/falsiness
		if ( section.descriptor.n ) {
			updateConditionalSection( section, value, true, fragmentOptions );
			return;
		}

		// otherwise we need to work out what sort of section we're dealing with

		// if value is an array, iterate through
		if ( isArray( value ) ) {
			updateListSection( section, value, fragmentOptions );
		}


		// if value is a hash...
		else if ( isObject( value ) ) {
			updateContextSection( section, fragmentOptions );
		}


		// otherwise render if value is truthy, unrender if falsy
		else {
			updateConditionalSection( section, value, false, fragmentOptions );
		}
	};

	updateListSection = function ( section, value, fragmentOptions ) {
		var i, fragmentsToRemove;

		// if the array is shorter than it was previously, remove items
		if ( value.length < section.length ) {
			fragmentsToRemove = section.fragments.splice( value.length, section.length - value.length );

			while ( fragmentsToRemove.length ) {
				fragmentsToRemove.pop().teardown( true );
			}
		}

		// otherwise...
		else {

			if ( value.length > section.length ) {
				// add any new ones
				for ( i=section.length; i<value.length; i+=1 ) {
					// append list item to context stack
					fragmentOptions.contextStack = section.contextStack.concat( section.keypath + '.' + i );
					fragmentOptions.index = i;

					if ( section.descriptor.i ) {
						fragmentOptions.indexRef = section.descriptor.i;
					}

					section.fragments[i] = section.createFragment( fragmentOptions );
				}
			}
		}

		section.length = value.length;
	};

	updateContextSection = function ( section, fragmentOptions ) {
		// ...then if it isn't rendered, render it, adding section.keypath to the context stack
		// (if it is already rendered, then any children dependent on the context stack
		// will update themselves without any prompting)
		if ( !section.length ) {
			// append this section to the context stack
			fragmentOptions.contextStack = section.contextStack.concat( section.keypath );
			fragmentOptions.index = 0;

			section.fragments[0] = section.createFragment( fragmentOptions );
			section.length = 1;
		}
	};

	updateConditionalSection = function ( section, value, inverted, fragmentOptions ) {
		var doRender, emptyArray, fragmentsToRemove;

		emptyArray = ( isArray( value ) && value.length === 0 );

		if ( inverted ) {
			doRender = emptyArray || !value;
		} else {
			doRender = value && !emptyArray;
		}

		if ( doRender ) {
			if ( !section.length ) {
				// no change to context stack
				fragmentOptions.contextStack = section.contextStack;
				fragmentOptions.index = 0;

				section.fragments[0] = section.createFragment( fragmentOptions );
				section.length = 1;
			}

			if ( section.length > 1 ) {
				fragmentsToRemove = section.fragments.splice( 1 );
				
				while ( fragmentsToRemove.length ) {
					fragmentsToRemove.pop().teardown( true );
				}
			}
		}

		else if ( section.length ) {
			section.teardownFragments( true );
			section.length = 0;
		}
	};

}());
(function () {

	var insertHtml, propertyNames,
		Text, Element, Partial, Attribute, Interpolator, Triple, Section;

	// the property name equivalents for element attributes, where they differ
	// from the lowercased attribute name
	propertyNames = {
		'accept-charset': 'acceptCharset',
		accesskey: 'accessKey',
		bgcolor: 'bgColor',
		'class': 'className',
		codebase: 'codeBase',
		colspan: 'colSpan',
		contenteditable: 'contentEditable',
		datetime: 'dateTime',
		dirname: 'dirName',
		'for': 'htmlFor',
		'http-equiv': 'httpEquiv',
		ismap: 'isMap',
		maxlength: 'maxLength',
		novalidate: 'noValidate',
		pubdate: 'pubDate',
		readonly: 'readOnly',
		rowspan: 'rowSpan',
		tabindex: 'tabIndex',
		usemap: 'useMap'
	};

	insertHtml = function ( html, docFrag ) {
		var div, nodes = [];

		div = doc.createElement( 'div' );
		div.innerHTML = html;

		while ( div.firstChild ) {
			nodes[ nodes.length ] = div.firstChild;
			docFrag.appendChild( div.firstChild );
		}

		return nodes;
	};

	DomFragment = function ( options ) {
		this.docFrag = doc.createDocumentFragment();

		// if we have an HTML string, our job is easy.
		if ( typeof options.descriptor === 'string' ) {
			this.nodes = insertHtml( options.descriptor, this.docFrag );
			return; // prevent the rest of the init sequence
		}

		// otherwise we need to make a proper fragment
		initFragment( this, options );
	};

	DomFragment.prototype = {
		createItem: function ( options ) {
			if ( typeof options.descriptor === 'string' ) {
				return new Text( options, this.docFrag );
			}

			switch ( options.descriptor.t ) {
				case INTERPOLATOR: return new Interpolator( options, this.docFrag );
				case SECTION: return new Section( options, this.docFrag );
				case TRIPLE: return new Triple( options, this.docFrag );

				case ELEMENT: return new Element( options, this.docFrag );
				case PARTIAL: return new Partial( options, this.docFrag );

				default: throw 'WTF? not sure what happened here...';
			}
		},

		teardown: function ( detach ) {
			var node;

			// if this was built from HTML, we just need to remove the nodes
			if ( detach && this.nodes ) {
				while ( this.nodes.length ) {
					node = this.nodes.pop();
					node.parentNode.removeChild( node );
				}
				return;
			}

			// otherwise we need to do a proper teardown
			if ( !this.items ) {
				return;
			}

			while ( this.items.length ) {
				this.items.pop().teardown( detach );
			}
		},

		firstNode: function () {
			if ( this.items && this.items[0] ) {
				return this.items[0].firstNode();
			} else if ( this.nodes ) {
				return this.nodes[0] || null;
			}

			return null;
		},

		findNextNode: function ( item ) {
			var index = item.index;

			if ( this.items[ index + 1 ] ) {
				return this.items[ index + 1 ].firstNode();
			}

			// if this is the root fragment, and there are no more items,
			// it means we're at the end
			if ( this.owner === this.root ) {
				return null;
			}

			return this.owner.findNextNode( this );
		}
	};


	// Partials
	Partial = function ( options, docFrag ) {
		var parentFragment = this.parentFragment = options.parentFragment, descriptor;

		this.type = PARTIAL;
		this.name = options.descriptor.r;

		descriptor = getPartialDescriptor( parentFragment.root, options.descriptor.r );

		this.fragment = new DomFragment({
			descriptor:   descriptor,
			root:         parentFragment.root,
			parentNode:   parentFragment.parentNode,
			contextStack: parentFragment.contextStack,
			owner:        this
		});

		docFrag.appendChild( this.fragment.docFrag );
	};

	Partial.prototype = {
		findNextNode: function () {
			return this.parentFragment.findNextNode( this );
		},

		teardown: function ( detach ) {
			this.fragment.teardown( detach );
		}
	};


	// Plain text
	Text = function ( options, docFrag ) {
		this.type = TEXT;

		this.node = doc.createTextNode( options.descriptor );
		this.parentNode = options.parentFragment.parentNode;

		docFrag.appendChild( this.node );
	};

	Text.prototype = {
		teardown: function ( detach ) {
			if ( detach ) {
				this.parentNode.removeChild( this.node );
			}
		},

		firstNode: function () {
			return this.node;
		}
	};


	// Element
	Element = function ( options, docFrag ) {

		var parentFragment,
			descriptor,
			namespace,
			eventName,
			eventNames,
			i,
			attr,
			attrName,
			lcName,
			attrValue,
			bindable,
			twowayNameAttr,
			parentNode,
			root,
			transition,
			transitionName,
			transitionParams,
			transitionManager,
			intro;

		this.type = ELEMENT;

		// stuff we'll need later
		parentFragment = this.parentFragment = options.parentFragment;
		descriptor = this.descriptor = options.descriptor;

		this.root = root = parentFragment.root;
		this.parentNode = parentFragment.parentNode;
		this.index = options.index;

		this.eventListeners = [];
		this.customEventListeners = [];

		// get namespace
		if ( descriptor.a && descriptor.a.xmlns ) {
			namespace = descriptor.a.xmlns;

			// check it's a string!
			if ( typeof namespace !== 'string' ) {
				throw new Error( 'Namespace attribute cannot contain mustaches' );
			}
		} else {
			namespace = ( descriptor.e.toLowerCase() === 'svg' ? namespaces.svg : this.parentNode.namespaceURI );
		}
		

		// create the DOM node
		this.node = doc.createElementNS( namespace, descriptor.e );


		

		// append children, if there are any
		if ( descriptor.f ) {
			if ( typeof descriptor.f === 'string' && this.node.namespaceURI === namespaces.html ) {
				// great! we can use innerHTML
				this.node.innerHTML = descriptor.f;
			}

			else {
				this.fragment = new DomFragment({
					descriptor:   descriptor.f,
					root:         root,
					parentNode:   this.node,
					contextStack: parentFragment.contextStack,
					owner:        this
				});

				this.node.appendChild( this.fragment.docFrag );
			}
		}


		// create event proxies
		if ( descriptor.v ) {
			for ( eventName in descriptor.v ) {
				if ( descriptor.v.hasOwnProperty( eventName ) ) {
					eventNames = eventName.split( '-' );
					i = eventNames.length;

					while ( i-- ) {
						this.addEventProxy( eventNames[i], descriptor.v[ eventName ], parentFragment.contextStack );
					}
				}
			}
		}


		// set attributes
		this.attributes = [];
		bindable = []; // save these till the end

		for ( attrName in descriptor.a ) {
			if ( descriptor.a.hasOwnProperty( attrName ) ) {
				attrValue = descriptor.a[ attrName ];
				
				attr = new Attribute({
					element:      this,
					name:         attrName,
					value:        ( attrValue === undefined ? null : attrValue ),
					root:         root,
					parentNode:   this.node,
					contextStack: parentFragment.contextStack
				});

				this.attributes[ this.attributes.length ] = attr;

				if ( attr.isBindable ) {
					bindable.push( attr );
				}

				if ( attr.isTwowayNameAttr ) {
					twowayNameAttr = attr;
				} else {
					attr.update();
				}
			}
		}

		while ( bindable.length ) {
			bindable.pop().bind( this.root.lazy );
		}

		if ( twowayNameAttr ) {
			twowayNameAttr.updateViewModel();
			twowayNameAttr.update();
		}

		docFrag.appendChild( this.node );

		// trigger intro transition
		if ( descriptor.t1 ) {
			executeTransition( descriptor.t1, root, this, parentFragment.contextStack, null, true );
		}
	};

	Element.prototype = {
		addEventProxy: function ( triggerEventName, proxyDescriptor, contextStack ) {
			var self = this, root = this.root, proxyName, proxyArgs, dynamicArgs, reuseable, definition, listener, fragment, handler, comboKey;

			// Note the current context - this can be useful with event handlers
			if ( !this.node._ractive ) {
				defineProperty( this.node, '_ractive', { value: {
					keypath: ( contextStack.length ? contextStack[ contextStack.length - 1 ] : '' ),
					index: this.parentFragment.indexRefs
				} });
			}

			if ( typeof proxyDescriptor === 'string' ) {
				proxyName = proxyDescriptor;
			} else {
				proxyName = proxyDescriptor.n;
			}

			// This key uniquely identifies this trigger+proxy name combo on this element
			comboKey = triggerEventName + '=' + proxyName;
			
			if ( proxyDescriptor.a ) {
				proxyArgs = proxyDescriptor.a;
			}

			else if ( proxyDescriptor.d ) {
				dynamicArgs = true;

				proxyArgs = new TextFragment({
					descriptor:   proxyDescriptor.d,
					root:         this.root,
					owner:        this,
					contextStack: contextStack
				});

				if ( !this.proxyFrags ) {
					this.proxyFrags = [];
				}
				this.proxyFrags[ this.proxyFrags.length ] = proxyArgs;
			}

			if ( proxyArgs !== undefined ) {
				// store arguments on the element, so we can reuse the same handler
				// with multiple elements
				if ( this.node._ractive[ comboKey ] ) {
					throw new Error( 'You cannot have two proxy events with the same trigger event (' + comboKey + ')' );
				}

				this.node._ractive[ comboKey ] = {
					dynamic: dynamicArgs,
					payload: proxyArgs
				};
			}

			// Is this a custom event?
			if ( definition = ( root.eventDefinitions[ triggerEventName ] || Ractive.eventDefinitions[ triggerEventName ] ) ) {
				// If the proxy is a string (e.g. <a proxy-click='select'>{{item}}</a>) then
				// we can reuse the handler. This eliminates the need for event delegation
				if ( !root._customProxies[ comboKey ] ) {
					root._customProxies[ comboKey ] = function ( proxyEvent ) {
						var args, payload;

						if ( !proxyEvent.node ) {
							throw new Error( 'Proxy event definitions must fire events with a `node` property' );
						}

						proxyEvent.keypath = proxyEvent.node._ractive.keypath;
						proxyEvent.context = root.get( proxyEvent.keypath );
						proxyEvent.index = proxyEvent.node._ractive.index;

						if ( proxyEvent.node._ractive[ comboKey ] ) {
							args = proxyEvent.node._ractive[ comboKey ];
							payload = args.dynamic ? args.payload.toJson() : args.payload;
						}

						root.fire( proxyName, proxyEvent, payload );
					};
				}

				handler = root._customProxies[ comboKey ];

				// Use custom event. Apply definition to this node
				listener = definition( this.node, handler );
				this.customEventListeners[ this.customEventListeners.length ] = listener;

				return;
			}

			// If not, we just need to check it is a valid event for this element
			// warn about invalid event handlers, if we're in debug mode
			if ( this.node[ 'on' + triggerEventName ] !== undefined && root.debug ) {
				if ( console && console.warn ) {
					console.warn( 'Invalid event handler (' + triggerEventName + ')' );
				}
			}

			if ( !root._proxies[ comboKey ] ) {
				root._proxies[ comboKey ] = function ( event ) {
					var args, payload, proxyEvent = {
						node: this,
						original: event,
						keypath: this._ractive.keypath,
						context: root.get( this._ractive.keypath ),
						index: this._ractive.index
					};

					if ( this._ractive && this._ractive[ comboKey ] ) {
						args = this._ractive[ comboKey ];
						payload = args.dynamic ? args.payload.toJson() : args.payload;
					}

					root.fire( proxyName, proxyEvent, payload );
				};
			}

			handler = root._proxies[ comboKey ];

			this.eventListeners[ this.eventListeners.length ] = {
				n: triggerEventName,
				h: handler
			};

			this.node.addEventListener( triggerEventName, handler );
		},

		teardown: function ( detach ) {
			var self = this, tearThisDown, transitionManager, transitionName, transitionParams, listener, outro;

			// Children first. that way, any transitions on child elements will be
			// handled by the current transitionManager
			if ( self.fragment ) {
				self.fragment.teardown( false );
			}

			while ( self.attributes.length ) {
				self.attributes.pop().teardown();
			}

			while ( self.eventListeners.length ) {
				listener = self.eventListeners.pop();
				self.node.removeEventListener( listener.n, listener.h );
			}

			while ( self.customEventListeners.length ) {
				self.customEventListeners.pop().teardown();
			}

			if ( this.proxyFrags ) {
				while ( this.proxyFrags.length ) {
					this.proxyFrags.pop().teardown();
				}
			}

			// TODO tidy up
			if ( this.descriptor.t2 ) {
				// TODO don't outro elements that have already been detached from the DOM

				var complete = function () {
					if ( detach ) {
						self.parentNode.removeChild( self.node );
					}
				};

				executeTransition( this.descriptor.t2, this.root, this, this.parentFragment.contextStack, complete, false );
			}

			else if ( detach ) {
				self.parentNode.removeChild( self.node );
			}
		},

		firstNode: function () {
			return this.node;
		},

		findNextNode: function ( fragment ) {
			return null;
		},

		bubble: function () {
			// noop - just so event proxy and transition fragments have something to call!
		}
	};


	// Attribute
	Attribute = function ( options ) {

		var name,
			value,
			colonIndex,
			namespacePrefix,
			tagName,
			bindingCandidate,
			lowerCaseName,
			propertyName,
			i,
			item,
			containsInterpolator;

		name = options.name;
		value = options.value;

		// are we dealing with a namespaced attribute, e.g. xlink:href?
		colonIndex = name.indexOf( ':' );
		if ( colonIndex !== -1 ) {

			// looks like we are, yes...
			namespacePrefix = name.substr( 0, colonIndex );

			// ...unless it's a namespace *declaration*
			if ( namespacePrefix !== 'xmlns' ) {
				name = name.substring( colonIndex + 1 );
				this.namespace = namespaces[ namespacePrefix ];

				if ( !this.namespace ) {
					throw 'Unknown namespace ("' + namespacePrefix + '")';
				}
			}
		}

		// if it's an empty attribute, or just a straight key-value pair, with no
		// mustache shenanigans, set the attribute accordingly
		if ( value === null || typeof value === 'string' ) {
			
			if ( this.namespace ) {
				options.parentNode.setAttributeNS( this.namespace, name, value );
			} else {
				options.parentNode.setAttribute( name, value );
			}

			if ( name.toLowerCase() === 'id' ) {
				options.root.nodes[ value ] = options.parentNode;
			}

			this.name = name;
			this.value = value;
			
			return;
		}

		// otherwise we need to do some work
		this.root = options.root;
		this.element = options.element;
		this.parentNode = options.parentNode;
		this.name = name;
		this.lcName = name.toLowerCase();

		// can we establish this attribute's property name equivalent?
		if ( !this.namespace && options.parentNode.namespaceURI === namespaces.html ) {
			lowerCaseName = this.lcName;
			propertyName = propertyNames[ lowerCaseName ] || lowerCaseName;

			if ( options.parentNode[ propertyName ] !== undefined ) {
				this.propertyName = propertyName;
			}

			// is this a boolean attribute or 'value'? If so we're better off doing e.g.
			// node.selected = true rather than node.setAttribute( 'selected', '' )
			if ( typeof options.parentNode[ propertyName ] === 'boolean' || propertyName === 'value' ) {
				this.useProperty = true;
			}
		}

		// share parentFragment with parent element
		this.parentFragment = this.element.parentFragment;

		this.fragment = new TextFragment({
			descriptor:   value,
			root:         this.root,
			owner:        this,
			contextStack: options.contextStack
		});


		// determine whether this attribute can be marked as self-updating
		this.selfUpdating = true;

		i = this.fragment.items.length;
		while ( i-- ) {
			item = this.fragment.items[i];
			if ( item.type === TEXT ) {
				continue;
			}

			// we can only have one interpolator and still be self-updating
			if ( item.type === INTERPOLATOR ) {
				if ( containsInterpolator ) {
					this.selfUpdating = false;
					break;
				} else {
					containsInterpolator = true;
					continue;
				}
			}

			// anything that isn't text or an interpolator (i.e. a section)
			// and we can't self-update
			this.selfUpdating = false;
			break;
		}


		// if two-way binding is enabled, and we've got a dynamic `value` attribute, and this is an input or textarea, set up two-way binding
		if ( this.root.twoway ) {
			tagName = this.element.descriptor.e.toLowerCase();
			bindingCandidate = ( ( propertyName === 'name' || propertyName === 'value' || propertyName === 'checked' ) && ( tagName === 'input' || tagName === 'textarea' || tagName === 'select' ) );
		}

		if ( bindingCandidate ) {
			this.isBindable = true;

			// name attribute is a special case - it is the only two-way attribute that updates
			// the viewmodel based on the value of another attribute. For that reason it must wait
			// until the node has been initialised, and the viewmodel has had its first two-way
			// update, before updating itself (otherwise it may disable a checkbox or radio that
			// was enabled in the template)
			if ( propertyName === 'name' ) {
				this.isTwowayNameAttr = true;
			}
		}


		// mark as ready
		this.ready = true;
	};

	Attribute.prototype = {
		bind: function ( lazy ) {
			var self = this, node = this.parentNode, interpolator, keypath, index, options, option, i, len;

			if ( !this.fragment ) {
				return false; // report failure
			}

			// TODO refactor this? Couldn't the interpolator have got a keypath via an expression?
			// Check this is a suitable candidate for two-way binding - i.e. it is
			// a single interpolator, which isn't an expression
			if (
				this.fragment.items.length !== 1 ||
				this.fragment.items[0].type !== INTERPOLATOR ||
				( !this.fragment.items[0].keypath && !this.fragment.items[0].ref )
			) {
				if ( this.root.debug ) {
					if ( console && console.warn ) {
						console.warn( 'Not a valid two-way data binding candidate - must be a single interpolator:', this.fragment.items );
					}
				}
				return false; // report failure
			}

			this.interpolator = this.fragment.items[0];

			// Hmmm. Not sure if this is the best way to handle this ambiguity...
			//
			// Let's say we were given `value="{{bar}}"`. If the context stack was
			// context stack was `["foo"]`, and `foo.bar` *wasn't* `undefined`, the
			// keypath would be `foo.bar`. Then, any user input would result in
			// `foo.bar` being updated.
			//
			// If, however, `foo.bar` *was* undefined, and so was `bar`, we would be
			// left with an unresolved partial keypath - so we are forced to make an
			// assumption. That assumption is that the input in question should
			// be forced to resolve to `bar`, and any user input would affect `bar`
			// and not `foo.bar`.
			//
			// Did that make any sense? No? Oh. Sorry. Well the moral of the story is
			// be explicit when using two-way data-binding about what keypath you're
			// updating. Using it in lists is probably a recipe for confusion...
			this.keypath = this.interpolator.keypath || this.interpolator.descriptor.r;
			
			
			// select
			if ( node.tagName === 'SELECT' && this.propertyName === 'value' ) {
				// We need to know if one of the options was selected, so we
				// can initialise the viewmodel. To do that we need to jump
				// through a couple of hoops
				options = node.getElementsByTagName( 'option' );

				len = options.length;
				for ( i=0; i<len; i+=1 ) {
					option = options[i];
					if ( option.hasAttribute( 'selected' ) ) { // not option.selected - won't work here
						this.root.set( this.keypath, option.value );
						break;
					}
				}
			}

			// checkboxes and radio buttons
			if ( node.type === 'checkbox' || node.type === 'radio' ) {
				// We might have a situation like this: 
				//
				//     <input type='radio' name='{{colour}}' value='red'>
				//     <input type='radio' name='{{colour}}' value='blue'>
				//     <input type='radio' name='{{colour}}' value='green'>
				//
				// In this case we want to set `colour` to the value of whichever option
				// is checked. (We assume that a value attribute has been supplied.)

				if ( this.propertyName === 'name' ) {
					// replace actual name attribute
					node.name = '{{' + this.keypath + '}}';

					this.updateViewModel = function () {
						if ( node.checked ) {
							self.root.set( self.keypath, node.value );
						}
					};
				}


				// Or, we might have a situation like this:
				//
				//     <input type='checkbox' checked='{{active}}'>
				//
				// Here, we want to set `active` to true or false depending on whether
				// the input is checked.

				else if ( this.propertyName === 'checked' ) {
					this.updateViewModel = function () {
						self.root.set( self.keypath, node.checked );
					};
				}
			}

			else {
				// Otherwise we've probably got a situation like this:
				//
				//     <input value='{{name}}'>
				//
				// in which case we just want to set `name` whenever the user enters text.
				// The same applies to selects and textareas 
				this.updateViewModel = function () {
					var value;

					value = node.value;

					// special cases
					if ( value === '0' ) {
						value = 0;
					}

					else if ( value !== '' ) {
						value = +value || value;
					}

					// Note: we're counting on `this.root.set` recognising that `value` is
					// already what it wants it to be, and short circuiting the process.
					// Rather than triggering an infinite loop...
					self.root.set( self.keypath, value );
				};
			}
			

			// if we figured out how to bind changes to the viewmodel, add the event listeners
			if ( this.updateViewModel ) {
				this.twoway = true;

				node.addEventListener( 'change', this.updateViewModel );
				node.addEventListener( 'click',  this.updateViewModel );
				node.addEventListener( 'blur',   this.updateViewModel );

				if ( !lazy ) {
					node.addEventListener( 'keyup',    this.updateViewModel );
					node.addEventListener( 'keydown',  this.updateViewModel );
					node.addEventListener( 'keypress', this.updateViewModel );
					node.addEventListener( 'input',    this.updateViewModel );
				}
			}
		},

		updateBindings: function () {
			// if the fragment this attribute belongs to gets reassigned (as a result of
			// as section being updated via an array shift, unshift or splice), this
			// attribute needs to recognise that its keypath has changed
			this.keypath = this.interpolator.keypath || this.interpolator.r;

			// if we encounter the special case described above, update the name attribute
			if ( this.propertyName === 'name' ) {
				// replace actual name attribute
				this.parentNode.name = '{{' + this.keypath + '}}';
			}
		},

		teardown: function () {
			// remove the event listeners we added, if we added them
			if ( this.updateViewModel ) {
				this.parentNode.removeEventListener( 'change', this.updateViewModel );
				this.parentNode.removeEventListener( 'click', this.updateViewModel );
				this.parentNode.removeEventListener( 'blur', this.updateViewModel );
				this.parentNode.removeEventListener( 'keyup', this.updateViewModel );
				this.parentNode.removeEventListener( 'keydown', this.updateViewModel );
				this.parentNode.removeEventListener( 'keypress', this.updateViewModel );
				this.parentNode.removeEventListener( 'input', this.updateViewModel );
			}

			// ignore non-dynamic attributes
			if ( this.fragment ) {
				this.fragment.teardown();
			}
		},

		bubble: function () {
			// If an attribute's text fragment contains a single item, we can
			// update the DOM immediately...
			if ( this.selfUpdating ) {
				this.update();
			}

			// otherwise we want to register it as a deferred attribute, to be
			// updated once all the information is in, to prevent unnecessary
			// DOM manipulation
			else if ( !this.deferred && this.ready ) {
				this.root._defAttrs[ this.root._defAttrs.length ] = this;
				this.deferred = true;
			}
		},

		update: function () {
			var value, lowerCaseName;

			if ( !this.ready ) {
				return this; // avoid items bubbling to the surface when we're still initialising
			}

			if ( this.twoway ) {
				// TODO compare against previous?

				lowerCaseName = this.lcName;
				value = this.interpolator.value;

				// special case - if we have an element like this:
				//
				//     <input type='radio' name='{{colour}}' value='red'>
				//
				// and `colour` has been set to 'red', we don't want to change the name attribute
				// to red, we want to indicate that this is the selected option, by setting
				// input.checked = true
				if ( lowerCaseName === 'name' && ( this.parentNode.type === 'checkbox' || this.parentNode.type === 'radio' ) ) {
					if ( value === this.parentNode.value ) {
						this.parentNode.checked = true;
					} else {
						this.parentNode.checked = false;
					}

					return this; 
				}

				// don't programmatically update focused element
				if ( doc.activeElement === this.parentNode ) {
					return this;
				}
			}

			value = this.fragment.getValue();

			if ( value === undefined ) {
				value = '';
			}

			if ( value !== this.value ) {
				if ( this.useProperty ) {
					this.parentNode[ this.propertyName ] = value;
					return this;
				}

				if ( this.namespace ) {
					this.parentNode.setAttributeNS( this.namespace, this.name, value );
					return this;
				}

				if ( this.lcName === 'id' ) {
					if ( this.value !== undefined ) {
						this.root.nodes[ this.value ] = undefined;
					}

					this.root.nodes[ value ] = this.parentNode;
				}

				this.parentNode.setAttribute( this.name, value );

				this.value = value;
			}

			return this;
		}
	};





	// Interpolator
	Interpolator = function ( options, docFrag ) {
		this.type = INTERPOLATOR;

		this.node = doc.createTextNode( '' );
		docFrag.appendChild( this.node );

		// extend Mustache
		initMustache( this, options );
	};

	Interpolator.prototype = {
		update: updateMustache,
		resolve: resolveMustache,

		teardown: function ( detach ) {
			teardown( this );
			
			if ( detach ) {
				this.parentNode.removeChild( this.node );
			}
		},

		render: function ( value ) {
			this.node.data = ( value === undefined ? '' : value );
		},

		firstNode: function () {
			return this.node;
		}
	};


	// Triple
	Triple = function ( options, docFrag ) {
		this.type = TRIPLE;

		this.nodes = [];
		this.docFrag = doc.createDocumentFragment();

		this.initialising = true;
		initMustache( this, options );
		docFrag.appendChild( this.docFrag );
		this.initialising = false;
	};

	Triple.prototype = {
		update: updateMustache,
		resolve: resolveMustache,

		teardown: function ( detach ) {

			// remove child nodes from DOM
			if ( detach ) {
				while ( this.nodes.length ) {
					this.parentNode.removeChild( this.nodes.pop() );
				}
			}

			teardown( this );
		},

		firstNode: function () {
			if ( this.nodes[0] ) {
				return this.nodes[0];
			}

			return this.parentFragment.findNextNode( this );
		},

		render: function ( html ) {
			// remove existing nodes
			while ( this.nodes.length ) {
				this.parentNode.removeChild( this.nodes.pop() );
			}

			if ( html === undefined ) {
				this.nodes = [];
				return;
			}

			// get new nodes
			this.nodes = insertHtml( html, this.docFrag );

			if ( !this.initialising ) {
				this.parentNode.insertBefore( this.docFrag, this.parentFragment.findNextNode( this ) );
			}
		}
	};



	// Section
	Section = function ( options, docFrag ) {
		this.type = SECTION;

		this.fragments = [];
		this.length = 0; // number of times this section is rendered

		this.docFrag = doc.createDocumentFragment();
		
		this.initialising = true;
		initMustache( this, options );
		docFrag.appendChild( this.docFrag );

		this.initialising = false;
	};

	Section.prototype = {
		update: updateMustache,
		resolve: resolveMustache,

		smartUpdate: function ( methodName, args ) {
			var fragmentOptions, i;

			if ( methodName === 'push' || methodName === 'unshift' || methodName === 'splice' ) {
				fragmentOptions = {
					descriptor: this.descriptor.f,
					root:       this.root,
					parentNode: this.parentNode,
					owner:      this
				};

				if ( this.descriptor.i ) {
					fragmentOptions.indexRef = this.descriptor.i;
				}
			}

			if ( this[ methodName ] ) { // if not, it's sort or reverse, which doesn't affect us (i.e. our length)
				this[ methodName ]( fragmentOptions, args );
			}
		},

		pop: function () {
			// teardown last fragment
			if ( this.length ) {
				this.fragments.pop().teardown( true );
				this.length -= 1;
			}
		},

		push: function ( fragmentOptions, args ) {
			var start, end, i;

			// append list item to context stack
			start = this.length;
			end = start + args.length;

			for ( i=start; i<end; i+=1 ) {
				fragmentOptions.contextStack = this.contextStack.concat( this.keypath + '.' + i );
				fragmentOptions.index = i;

				this.fragments[i] = this.createFragment( fragmentOptions );
			}
			
			this.length += args.length;

			// append docfrag in front of next node
			this.parentNode.insertBefore( this.docFrag, this.parentFragment.findNextNode( this ) );
		},

		shift: function () {
			this.splice( null, [ 0, 1 ] );
		},

		unshift: function ( fragmentOptions, args ) {
			this.splice( fragmentOptions, [ 0, 0 ].concat( new Array( args.length ) ) );
		},

		splice: function ( fragmentOptions, args ) {
			var insertionPoint, addedItems, removedItems, balance, i, start, end, spliceArgs, reassignStart, reassignEnd, reassignBy;

			if ( !args.length ) {
				return;
			}

			// figure out where the changes started...
			start = +( args[0] < 0 ? this.length + args[0] : args[0] );

			// ...and how many items were added to or removed from the array
			addedItems = Math.max( 0, args.length - 2 );
			removedItems = ( args[1] !== undefined ? args[1] : this.length - start );

			balance = addedItems - removedItems;

			if ( !balance ) {
				// The array length hasn't changed - we don't need to add or remove anything
				return;
			}

			// If more items were removed than added, we need to remove some things from the DOM
			if ( balance < 0 ) {
				end = start - balance;

				for ( i=start; i<end; i+=1 ) {
					this.fragments[i].teardown( true );
				}

				// Keep in sync
				this.fragments.splice( start, -balance );
			}

			// Otherwise we need to add some things to the DOM
			else {
				end = start + balance;

				// Figure out where these new nodes need to be inserted
				insertionPoint = ( this.fragments[ start ] ? this.fragments[ start ].firstNode() : this.parentFragment.findNextNode( this ) );

				// Make room for the new fragments. (Just trust me, this works...)
				spliceArgs = [ start, 0 ].concat( new Array( balance ) );
				this.fragments.splice.apply( this.fragments, spliceArgs );

				for ( i=start; i<end; i+=1 ) {
					fragmentOptions.contextStack = this.contextStack.concat( this.keypath + '.' + i );
					fragmentOptions.index = i;

					this.fragments[i] = this.createFragment( fragmentOptions );
				}

				// Append docfrag in front of insertion point
				this.parentNode.insertBefore( this.docFrag, insertionPoint );
			}

			this.length += balance;


			// Now we need to reassign existing fragments (e.g. items.4 -> items.3 - the keypaths,
			// context stacks and index refs will have changed)
			reassignStart = ( start + addedItems );

			reassignAffectedFragments( this.root, this, reassignStart, this.length, balance );
		},

		teardown: function ( detach ) {
			this.teardownFragments( detach );

			teardown( this );
		},

		firstNode: function () {
			if ( this.fragments[0] ) {
				return this.fragments[0].firstNode();
			}

			return this.parentFragment.findNextNode( this );
		},

		findNextNode: function ( fragment ) {
			if ( this.fragments[ fragment.index + 1 ] ) {
				return this.fragments[ fragment.index + 1 ].firstNode();
			}

			return this.parentFragment.findNextNode( this );
		},

		teardownFragments: function ( detach ) {
			while ( this.fragments.length ) {
				this.fragments.shift().teardown( detach );
			}
		},

		render: function ( value ) {
			
			updateSection( this, value );

			if ( !this.initialising ) {
				// we need to insert the contents of our document fragment into the correct place
				this.parentNode.insertBefore( this.docFrag, this.parentFragment.findNextNode( this ) );
			}
		},

		createFragment: function ( options ) {
			var fragment = new DomFragment( options );
			
			this.docFrag.appendChild( fragment.docFrag );
			return fragment;
		}
	};


	var reassignAffectedFragments = function ( root, section, start, end, by ) {
		var fragmentsToReassign, i, fragment, indexRef, oldIndex, newIndex, oldKeypath, newKeypath;

		indexRef = section.descriptor.i;

		for ( i=start; i<end; i+=1 ) {
			fragment = section.fragments[i];

			oldIndex = i - by;
			newIndex = i;

			oldKeypath = section.keypath + '.' + ( i - by );
			newKeypath = section.keypath + '.' + i;

			// change the fragment index
			fragment.index += by;

			reassignFragment( fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
		}

		processDeferredUpdates( root );
	};

	var reassignFragment = function ( fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i, j, item, context;

		if ( fragment.indexRefs && fragment.indexRefs[ indexRef ] !== undefined ) {
			fragment.indexRefs[ indexRef ] = newIndex;
		}

		// fix context stack
		i = fragment.contextStack.length;
		while ( i-- ) {
			context = fragment.contextStack[i];
			if ( context.substr( 0, oldKeypath.length ) === oldKeypath ) {
				fragment.contextStack[i] = context.replace( oldKeypath, newKeypath );
			}
		}

		i = fragment.items.length;
		while ( i-- ) {
			item = fragment.items[i];

			switch ( item.type ) {
				case ELEMENT:
				reassignElement( item, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;

				case PARTIAL:
				reassignFragment( item.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;

				case SECTION:
				case INTERPOLATOR:
				case TRIPLE:
				reassignMustache( item, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;
			}
		}
	};

	var reassignElement = function ( element, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i, attribute;

		i = element.attributes.length;
		while ( i-- ) {
			attribute = element.attributes[i];

			if ( attribute.fragment ) {
				reassignFragment( attribute.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );

				if ( attribute.twoway ) {
					attribute.updateBindings();
				}
			}
		}

		// reassign proxy argument fragments TODO and intro/outro param fragments
		if ( element.proxyFrags ) {
			i = element.proxyFrags.length;
			while ( i-- ) {
				reassignFragment( element.proxyFrags[i], indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
			}
		}

		if ( element.node._ractive ) {
			if ( element.node._ractive.keypath.substr( 0, oldKeypath.length ) === oldKeypath ) {
				element.node._ractive.keypath = element.node._ractive.keypath.replace( oldKeypath, newKeypath );
			}

			element.node._ractive.index[ indexRef ] = newIndex;
		}

		// reassign children
		if ( element.fragment ) {
			reassignFragment( element.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
		}
	};

	var reassignMustache = function ( mustache, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i;

		// expression mustache?
		if ( mustache.descriptor.x ) {
			if ( mustache.keypath ) {
				unregisterDependant( mustache );
			}
			
			if ( mustache.expressionResolver ) {
				mustache.expressionResolver.teardown();
			}

			mustache.expressionResolver = new ExpressionResolver( mustache );
		}

		// normal keypath mustache?
		if ( mustache.keypath ) {
			if ( mustache.keypath.substr( 0, oldKeypath.length ) === oldKeypath ) {
				unregisterDependant( mustache );

				mustache.keypath = mustache.keypath.replace( oldKeypath, newKeypath );
				registerDependant( mustache );
			}
		}

		// index ref mustache?
		else if ( mustache.indexRef === indexRef ) {
			mustache.refIndex = newIndex;
			mustache.render( newIndex );
		}

		// otherwise, it's an unresolved reference. the context stack has been updated
		// so it will take care of itself

		// if it's a section mustache, we need to go through any children
		if ( mustache.fragments ) {
			i = mustache.fragments.length;
			while ( i-- ) {
				reassignFragment( mustache.fragments[i], indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
			}
		}
	};

}());

(function () {

	var Text, Interpolator, Triple, Section;

	TextFragment = function TextFragment ( options ) {
		initFragment( this, options );
	};

	TextFragment.prototype = {
		createItem: function ( options ) {
			if ( typeof options.descriptor === 'string' ) {
				return new Text( options.descriptor );
			}

			switch ( options.descriptor.t ) {
				case INTERPOLATOR: return new Interpolator( options );
				case TRIPLE: return new Triple( options );
				case SECTION: return new Section( options );

				default: throw 'Something went wrong in a rather interesting way';
			}
		},


		bubble: function () {
			this.owner.bubble();
		},

		teardown: function () {
			var numItems, i;

			numItems = this.items.length;
			for ( i=0; i<numItems; i+=1 ) {
				this.items[i].teardown();
			}
		},

		getValue: function () {
			var value;
			
			// Accommodate boolean attributes
			if ( this.items.length === 1 && this.items[0].type === INTERPOLATOR ) {
				value = this.items[0].value;
				if ( value !== undefined ) {
					return value;
				}
			}
			
			return this.toString();
		},

		toString: function () {
			return this.items.join( '' );
		},

		toJson: function () {
			var str, json;

			str = this.toString();

			try {
				json = JSON.parse( str );
			} catch ( err ) {
				json = str;
			}

			return json;
		}
	};



	// Plain text
	Text = function ( text ) {
		this.type = TEXT;
		this.text = text;
	};

	Text.prototype = {
		toString: function () {
			return this.text;
		},

		teardown: function () {} // no-op
	};


	// Mustaches

	// Interpolator or Triple
	Interpolator = function ( options ) {
		this.type = INTERPOLATOR;
		initMustache( this, options );
	};

	Interpolator.prototype = {
		update: updateMustache,
		resolve: resolveMustache,

		render: function ( value ) {
			this.value = value;
			this.parentFragment.bubble();
		},

		teardown: function () {
			teardown( this );
		},

		toString: function () {
			return ( this.value === undefined ? '' : this.value );
		}
	};

	// Triples are the same as Interpolators in this context
	Triple = Interpolator;


	// Section
	Section = function ( options ) {
		this.type = SECTION;
		this.fragments = [];
		this.length = 0;

		initMustache( this, options );
	};

	Section.prototype = {
		update: updateMustache,
		resolve: resolveMustache,

		teardown: function () {
			this.teardownFragments();

			teardown( this );
		},

		teardownFragments: function () {
			while ( this.fragments.length ) {
				this.fragments.shift().teardown();
			}
			this.length = 0;
		},

		bubble: function () {
			this.value = this.fragments.join( '' );
			this.parentFragment.bubble();
		},

		render: function ( value ) {
			updateSection( this, value );
			this.parentFragment.bubble();
		},

		createFragment: function ( options ) {
			return new TextFragment( options );
		},

		toString: function () {
			return this.fragments.join( '' );
		}
	};

}());
var makeTransitionManager = function ( root, callback ) {
	var transitionManager;

	transitionManager = {
		active: 0,
		info: { i: 0 },
		push: function () {
			transitionManager.active += 1;
			transitionManager.info.i += 1;
		},
		pop: function () {
			transitionManager.active -= 1;
			if ( callback && !transitionManager.active && transitionManager.ready ) {
				callback.call( root );
			}
		}
	};

	return transitionManager;
};
splitKeypath =  function ( keypath ) {
	var index, startIndex, keys, remaining, part;

	// We should only have to do all the heavy regex stuff once... caching FTW
	if ( keypathCache[ keypath ] ) {
		return keypathCache[ keypath ].concat();
	}

	keys = [];
	remaining = keypath;
	
	startIndex = 0;

	// Split into keys
	while ( remaining.length ) {
		// Find next dot
		index = remaining.indexOf( '.', startIndex );

		// Final part?
		if ( index === -1 ) {
			part = remaining;
			remaining = '';
		}

		else {
			// If this dot is preceded by a backslash, which isn't
			// itself preceded by a backslash, we consider it escaped
			if ( remaining.charAt( index - 1) === '\\' && remaining.charAt( index - 2 ) !== '\\' ) {
				// we don't want to keep this part, we want to keep looking
				// for the separator
				startIndex = index + 1;
				continue;
			}

			// Otherwise, we have our next part
			part = remaining.substr( 0, index );
			startIndex = 0;
		}

		if ( /\[/.test( part ) ) {
			keys = keys.concat( part.replace( /\[\s*([0-9]+)\s*\]/g, '.$1' ).split( '.' ) );
		} else {
			keys[ keys.length ] = part;
		}
		
		remaining = remaining.substring( index + 1 );
	}

	
	keypathCache[ keypath ] = keys;
	return keys.concat();
};


toString = Object.prototype.toString;

// thanks, http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
isArray = function ( obj ) {
	return toString.call( obj ) === '[object Array]';
};

isEqual = function ( a, b ) {
	if ( a === null && b === null ) {
		return true;
	}

	if ( typeof a === 'object' || typeof b === 'object' ) {
		return false;
	}

	return a === b;
};

// http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
isNumeric = function ( n ) {
	return !isNaN( parseFloat( n ) ) && isFinite( n );
};

isObject = function ( obj ) {
	return ( toString.call( obj ) === '[object Object]' ) && ( typeof obj !== 'function' );
};


	
getEl = function ( input ) {
	var output;

	if ( typeof window === 'undefined' ) {
		return;
	}

	if ( !input ) {
		throw new Error( 'No container element specified' );
	}

	// We already have a DOM node - no work to do
	if ( input.tagName ) {
		return input;
	}

	// Get node from string
	if ( typeof input === 'string' ) {
		// try ID first
		output = doc.getElementById( input );

		// then as selector, if possible
		if ( !output && doc.querySelector ) {
			output = doc.querySelector( input );
		}

		// did it work?
		if ( output.tagName ) {
			return output;
		}
	}

	// If we've been given a collection (jQuery, Zepto etc), extract the first item
	if ( input[0] && input[0].tagName ) {
		return input[0];
	}

	throw new Error( 'Could not find container element' );
};
stripCommentTokens = function ( tokens ) {
	var i, current, previous, next;

	for ( i=0; i<tokens.length; i+=1 ) {
		current = tokens[i];
		previous = tokens[i-1];
		next = tokens[i+1];

		// if the current token is a comment or a delimiter change, remove it...
		if ( current.mustacheType === COMMENT || current.mustacheType === DELIMCHANGE ) {
			
			tokens.splice( i, 1 ); // remove comment token

			// ... and see if it has text nodes either side, in which case
			// they can be concatenated
			if ( previous && next ) {
				if ( previous.type === TEXT && next.type === TEXT ) {
					previous.value += next.value;
					
					tokens.splice( i, 1 ); // remove next token
				}
			}

			i -= 1; // decrement i to account for the splice(s)
		}
	}

	return tokens;
};


stripHtmlComments = function ( html ) {
	var commentStart, commentEnd, processed;

	processed = '';

	while ( html.length ) {
		commentStart = html.indexOf( '<!--' );
		commentEnd = html.indexOf( '-->' );

		// no comments? great
		if ( commentStart === -1 && commentEnd === -1 ) {
			processed += html;
			break;
		}

		// comment start but no comment end
		if ( commentStart !== -1 && commentEnd === -1 ) {
			throw 'Illegal HTML - expected closing comment sequence (\'-->\')';
		}

		// comment end but no comment start, or comment end before comment start
		if ( ( commentEnd !== -1 && commentStart === -1 ) || ( commentEnd < commentStart ) ) {
			throw 'Illegal HTML - unexpected closing comment sequence (\'-->\')';
		}

		processed += html.substr( 0, commentStart );
		html = html.substring( commentEnd + 3 );
	}

	return processed;
};


stripStandalones = function ( tokens ) {
	var i, current, backOne, backTwo, leadingLinebreak, trailingLinebreak;

	leadingLinebreak = /^\s*\r?\n/;
	trailingLinebreak = /\r?\n\s*$/;

	for ( i=2; i<tokens.length; i+=1 ) {
		current = tokens[i];
		backOne = tokens[i-1];
		backTwo = tokens[i-2];

		// if we're at the end of a [text][mustache][text] sequence...
		if ( current.type === TEXT && ( backOne.type === MUSTACHE ) && backTwo.type === TEXT ) {
			
			// ... and the mustache is a standalone (i.e. line breaks either side)...
			if ( trailingLinebreak.test( backTwo.value ) && leadingLinebreak.test( current.value ) ) {
			
				// ... then we want to remove the whitespace after the first line break
				// if the mustache wasn't a triple or interpolator or partial
				if ( backOne.mustacheType !== INTERPOLATOR && backOne.mustacheType !== TRIPLE ) {
					backTwo.value = backTwo.value.replace( trailingLinebreak, '\n' );
				}

				// and the leading line break of the second text token
				current.value = current.value.replace( leadingLinebreak, '' );

				// if that means the current token is now empty, we should remove it
				if ( current.value === '' ) {
					tokens.splice( i--, 1 ); // splice and decrement
				}
			}
		}
	}

	return tokens;
};
var getFragmentStubFromTokens;

(function () {

	var getItem,
	getText,
	getMustache,
	getElement,

	Fragment,
	Text,
	Mustache,
	Section,
	Element,
	Expression,

	stringify,
	jsonify;


	getFragmentStubFromTokens = function ( tokens, priority, options, preserveWhitespace ) {
		var parser, stub;

		parser = {
			pos: 0,
			tokens: tokens || [],
			next: function () {
				return parser.tokens[ parser.pos ];
			},
			options: options
		};

		stub = new Fragment( parser, priority, preserveWhitespace );

		return stub;
	};

	getItem = function ( parser, priority, preserveWhitespace ) {
		if ( !parser.next() ) {
			return null;
		}

		return getText( parser, preserveWhitespace )
		    || getMustache( parser, priority, preserveWhitespace )
		    || getElement( parser, priority, preserveWhitespace );
	};

	getText = function ( parser, preserveWhitespace ) {
		var next = parser.next();

		if ( next.type === TEXT ) {
			parser.pos += 1;
			return new Text( next, preserveWhitespace );
		}

		return null;
	};

	getMustache = function ( parser, priority, preserveWhitespace ) {
		var next = parser.next();

		if ( next.type === MUSTACHE || next.type === TRIPLE ) {
			if ( next.mustacheType === SECTION || next.mustacheType === INVERTED ) {
				return new Section( next, parser, priority, preserveWhitespace );				
			}

			return new Mustache( next, parser, priority );
		}

		return null;
	};

	getElement = function ( parser, priority, preserveWhitespace ) {
		var next = parser.next(), stub;

		if ( next.type === TAG ) {
			stub = new Element( next, parser, priority, preserveWhitespace );

			// sanitize			
			if ( parser.options.sanitize && parser.options.sanitize.elements ) {
				if ( parser.options.sanitize.elements.indexOf( stub.lcTag ) !== -1 ) {
					return null;
				}
			}

			return stub;
		}

		return null;
	};

	stringify = function ( items ) {
		var str = '', itemStr, i, len;

		if ( !items ) {
			return '';
		}

		for ( i=0, len=items.length; i<len; i+=1 ) {
			itemStr = items[i].toString();
			
			if ( itemStr === false ) {
				return false;
			}

			str += itemStr;
		}

		return str;
	};

	jsonify = function ( items, noStringify ) {
		var str, json;

		if ( !noStringify ) {
			str = stringify( items );
			if ( str !== false ) {
				return str;
			}
		}

		json = items.map( function ( item ) {
			return item.toJson( noStringify );
		});

		return json;
	};



	Fragment = function ( parser, priority, preserveWhitespace ) {
		var items, item;

		items = this.items = [];

		item = getItem( parser, priority, preserveWhitespace );
		while ( item !== null ) {
			items[ items.length ] = item;
			item = getItem( parser, priority, preserveWhitespace );
		}
	};

	Fragment.prototype = {
		toJson: function ( noStringify ) {
			var json = jsonify( this.items, noStringify );
			return json;
		},

		toString: function () {
			var str = stringify( this.items );
			return str;
		}
	};


	// text
	(function () {
		var htmlEntities, decodeCharacterReferences, whitespace;

		Text = function ( token, preserveWhitespace ) {
			this.type = TEXT;
			this.text = ( preserveWhitespace ? token.value : token.value.replace( whitespace, ' ' ) );
		};

		Text.prototype = {
			toJson: function () {
				// this will be used as text, so we need to decode things like &amp;
				return this.decoded || ( this.decoded = decodeCharacterReferences( this.text) );
			},

			toString: function () {
				// this will be used as straight text
				return this.text;
			}
		};

		htmlEntities = { quot: 34, amp: 38, apos: 39, lt: 60, gt: 62, nbsp: 160, iexcl: 161, cent: 162, pound: 163, curren: 164, yen: 165, brvbar: 166, sect: 167, uml: 168, copy: 169, ordf: 170, laquo: 171, not: 172, shy: 173, reg: 174, macr: 175, deg: 176, plusmn: 177, sup2: 178, sup3: 179, acute: 180, micro: 181, para: 182, middot: 183, cedil: 184, sup1: 185, ordm: 186, raquo: 187, frac14: 188, frac12: 189, frac34: 190, iquest: 191, Agrave: 192, Aacute: 193, Acirc: 194, Atilde: 195, Auml: 196, Aring: 197, AElig: 198, Ccedil: 199, Egrave: 200, Eacute: 201, Ecirc: 202, Euml: 203, Igrave: 204, Iacute: 205, Icirc: 206, Iuml: 207, ETH: 208, Ntilde: 209, Ograve: 210, Oacute: 211, Ocirc: 212, Otilde: 213, Ouml: 214, times: 215, Oslash: 216, Ugrave: 217, Uacute: 218, Ucirc: 219, Uuml: 220, Yacute: 221, THORN: 222, szlig: 223, agrave: 224, aacute: 225, acirc: 226, atilde: 227, auml: 228, aring: 229, aelig: 230, ccedil: 231, egrave: 232, eacute: 233, ecirc: 234, euml: 235, igrave: 236, iacute: 237, icirc: 238, iuml: 239, eth: 240, ntilde: 241, ograve: 242, oacute: 243, ocirc: 244, otilde: 245, ouml: 246, divide: 247, oslash: 248, ugrave: 249, uacute: 250, ucirc: 251, uuml: 252, yacute: 253, thorn: 254, yuml: 255, OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376, fnof: 402, circ: 710, tilde: 732, Alpha: 913, Beta: 914, Gamma: 915, Delta: 916, Epsilon: 917, Zeta: 918, Eta: 919, Theta: 920, Iota: 921, Kappa: 922, Lambda: 923, Mu: 924, Nu: 925, Xi: 926, Omicron: 927, Pi: 928, Rho: 929, Sigma: 931, Tau: 932, Upsilon: 933, Phi: 934, Chi: 935, Psi: 936, Omega: 937, alpha: 945, beta: 946, gamma: 947, delta: 948, epsilon: 949, zeta: 950, eta: 951, theta: 952, iota: 953, kappa: 954, lambda: 955, mu: 956, nu: 957, xi: 958, omicron: 959, pi: 960, rho: 961, sigmaf: 962, sigma: 963, tau: 964, upsilon: 965, phi: 966, chi: 967, psi: 968, omega: 969, thetasym: 977, upsih: 978, piv: 982, ensp: 8194, emsp: 8195, thinsp: 8201, zwnj: 8204, zwj: 8205, lrm: 8206, rlm: 8207, ndash: 8211, mdash: 8212, lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222, dagger: 8224, Dagger: 8225, bull: 8226, hellip: 8230, permil: 8240, prime: 8242, Prime: 8243, lsaquo: 8249, rsaquo: 8250, oline: 8254, frasl: 8260, euro: 8364, image: 8465, weierp: 8472, real: 8476, trade: 8482, alefsym: 8501, larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, harr: 8596, crarr: 8629, lArr: 8656, uArr: 8657, rArr: 8658, dArr: 8659, hArr: 8660, forall: 8704, part: 8706, exist: 8707, empty: 8709, nabla: 8711, isin: 8712, notin: 8713, ni: 8715, prod: 8719, sum: 8721, minus: 8722, lowast: 8727, radic: 8730, prop: 8733, infin: 8734, ang: 8736, and: 8743, or: 8744, cap: 8745, cup: 8746, 'int': 8747, there4: 8756, sim: 8764, cong: 8773, asymp: 8776, ne: 8800, equiv: 8801, le: 8804, ge: 8805, sub: 8834, sup: 8835, nsub: 8836, sube: 8838, supe: 8839, oplus: 8853, otimes: 8855, perp: 8869, sdot: 8901, lceil: 8968, rceil: 8969, lfloor: 8970, rfloor: 8971, lang: 9001, rang: 9002, loz: 9674, spades: 9824, clubs: 9827, hearts: 9829, diams: 9830	};

		decodeCharacterReferences = function ( html ) {
			var result;

			// named entities
			result = html.replace( /&([a-zA-Z]+);/, function ( match, name ) {
				if ( htmlEntities[ name ] ) {
					return String.fromCharCode( htmlEntities[ name ] );
				}

				return match;
			});

			// hex references
			result = result.replace( /&#x([0-9]+);/, function ( match, hex ) {
				return String.fromCharCode( parseInt( hex, 16 ) );
			});

			// decimal references
			result = result.replace( /&#([0-9]+);/, function ( match, num ) {
				return String.fromCharCode( num );
			});

			return result;
		};

		whitespace = /\s+/g;
	}());


	// mustache
	(function () {
		Mustache = function ( token, parser, priority ) {
			this.type = ( token.type === TRIPLE ? TRIPLE : token.mustacheType );

			if ( token.ref ) {
				this.ref = token.ref;
			}
			
			if ( token.expression ) {
				this.expr = new Expression( token.expression );
			}
			
			this.priority = priority;

			parser.pos += 1;
		};

		Mustache.prototype = {
			toJson: function () {
				var json;

				if ( this.json ) {
					return this.json;
				}

				json = {
					t: this.type
				};

				if ( this.ref ) {
					json.r = this.ref;
				}

				if ( this.expr ) {
					json.x = this.expr.toJson();
				}

				if ( this.priority ) {
					json.p = this.priority;
				}

				this.json = json;
				return json;
			},

			toString: function () {
				// mustaches cannot be stringified
				return false;
			}
		};


		Section = function ( firstToken, parser, priority, preserveWhitespace ) {
			var next;

			this.ref = firstToken.ref;
			this.indexRef = firstToken.indexRef;
			this.priority = priority || 0;

			this.inverted = ( firstToken.mustacheType === INVERTED );

			if ( firstToken.expression ) {
				this.expr = new Expression( firstToken.expression );
			}

			parser.pos += 1;

			this.items = [];
			next = parser.next();

			while ( next ) {
				if ( next.mustacheType === CLOSING ) {
					if ( ( next.ref === this.ref ) || ( next.expr && this.expr ) ) {
						parser.pos += 1;
						break;
					}

					else {
						throw new Error( 'Could not parse template: Illegal closing section' );
					}
				}

				this.items[ this.items.length ] = getItem( parser, this.priority + 1, preserveWhitespace );
				next = parser.next();
			}
		};

		Section.prototype = {
			toJson: function ( noStringify ) {
				var json, str, i, len, itemStr;

				if ( this.json ) {
					return this.json;
				}

				json = { t: SECTION };

				if ( this.ref ) {
					json.r = this.ref;
				}

				if ( this.indexRef ) {
					json.i = this.indexRef;
				}

				if ( this.inverted ) {
					json.n = true;
				}

				if ( this.expr ) {
					json.x = this.expr.toJson();
				}

				if ( this.items.length ) {
					json.f = jsonify( this.items, noStringify );
				}

				if ( this.priority ) {
					json.p = this.priority;
				}

				this.json = json;
				return json;
			},

			toString: function () {
				// sections cannot be stringified
				return false;
			}
		};
	}());


	// element
	(function () {
		var voidElementNames, allElementNames, mapToLowerCase, svgCamelCaseElements, svgCamelCaseElementsMap, svgCamelCaseAttributes, svgCamelCaseAttributesMap, closedByParentClose, siblingsByTagName, sanitize, onlyAttrs, onlyProxies, filterAttrs, proxyPattern;

		Element = function ( firstToken, parser, priority, preserveWhitespace ) {
			var closed, next, i, len, attrs, filtered, proxies, attr, getFrag, processProxy, item;

			this.lcTag = firstToken.name.toLowerCase();
			this.priority = priority = priority || 0;

			// enforce lower case tag names by default. HTML doesn't care. SVG does, so if we see an SVG tag
			// that should be camelcased, camelcase it
			this.tag = ( svgCamelCaseElementsMap[ this.lcTag ] ? svgCamelCaseElementsMap[ this.lcTag ] : this.lcTag );

			parser.pos += 1;

			// if this is a <pre> element, preserve whitespace within
			preserveWhitespace = ( preserveWhitespace || this.lcTag === 'pre' );

			if ( firstToken.attrs ) {
				filtered = filterAttrs( firstToken.attrs );
				
				attrs = filtered.attrs;
				proxies = filtered.proxies;

				// remove event attributes (e.g. onclick='doSomething()') if we're sanitizing
				if ( parser.options.sanitize && parser.options.sanitize.eventAttributes ) {
					attrs = attrs.filter( sanitize );
				}

				getFrag = function ( attr ) {
					var lcName = attr.name.toLowerCase();

					return {
						name: ( svgCamelCaseAttributesMap[ lcName ] ? svgCamelCaseAttributesMap[ lcName ] : lcName ),
						value: getFragmentStubFromTokens( attr.value, priority + 1 )
					};
				};

				processProxy = function ( proxy ) {
					var processed, domEventName, match, tokens, proxyName, proxyArgs, colonIndex, throwError;

					throwError = function () {
						throw new Error( 'Illegal proxy event' );
					};

					if ( !proxy.name || !proxy.value ) {
						throwError();
					}

					processed = { domEventName: proxy.name };

					tokens = proxy.value;

					// proxy event names must start with a string (no mustaches)
					if ( tokens[0].type !== TEXT ) {
						throwError();
					}

					colonIndex = tokens[0].value.indexOf( ':' );
					
					// if no arguments are specified...
					if ( colonIndex === -1 ) {
						
						// ...the proxy name must be string-only (no mustaches)
						if ( tokens.length > 1 ) {
							throwError();
						}

						processed.name = tokens[0].value;
					}

					else {
						processed.name = tokens[0].value.substr( 0, colonIndex );
						tokens[0].value = tokens[0].value.substring( colonIndex + 1 );

						if ( !tokens[0].value ) {
							tokens.shift();
						}

						// can we parse it yet?
						if ( tokens.length === 1 && tokens[0].type === TEXT ) {
							try {
								processed.args = JSON.parse( tokens[0].value );
							} catch ( err ) {
								processed.args = tokens[0].value;
							}
						}

						processed.dynamicArgs = getFragmentStubFromTokens( tokens, priority + 1 );
					}

					return processed;
				};

				if ( attrs.length ) {
					this.attributes = attrs.map( getFrag );
				}

				if ( proxies.length ) {
					this.proxies = proxies.map( processProxy );
				}

				// TODO rename this helper function
				if ( filtered.intro ) {
					this.intro = processProxy( filtered.intro );
				}

				if ( filtered.outro ) {
					this.outro = processProxy( filtered.outro );
				}
			}

			if ( firstToken.selfClosing ) {
				this.selfClosing = true;
			}

			if ( voidElementNames.indexOf( this.lcTag ) !== -1 ) {
				this.isVoid = true;
			}

			// if self-closing or a void element, close
			if ( this.selfClosing || this.isVoid ) {
				return;
			}

			this.siblings = siblingsByTagName[ this.lcTag ];

			this.items = [];

			next = parser.next();
			while ( next ) {

				// section closing mustache should also close this element, e.g.
				// <ul>{{#items}}<li>{{content}}{{/items}}</ul>
				if ( next.mustacheType === CLOSING ) {
					break;
				}
				
				if ( next.type === TAG ) {

					// closing tag
					if ( next.closing ) {
						// it's a closing tag, which means this element is closed...
						if ( next.name.toLowerCase() === this.lcTag ) {
							parser.pos += 1;
						}

						break;
					}

					// sibling element, which closes this element implicitly
					else if ( this.siblings && ( this.siblings.indexOf( next.name.toLowerCase() ) !== -1 ) ) {
						break;
					}
					
				}

				this.items[ this.items.length ] = getItem( parser, this.priority + 1 );

				next = parser.next();
			}


			// if we're not preserving whitespace, we can eliminate inner leading and trailing whitespace
			if ( !preserveWhitespace ) {
				item = this.items[0];
				if ( item && item.type === TEXT ) {
					item.text = item.text.replace( leadingWhitespace, '' );
					if ( !item.text ) {
						this.items.shift();
					}
				}

				item = this.items[ this.items.length - 1 ];
				if ( item && item.type === TEXT ) {
					item.text = item.text.replace( trailingWhitespace, '' );
					if ( !item.text ) {
						this.items.pop();
					}
				}
			}
		};

		Element.prototype = {
			toJson: function ( noStringify ) {
				var json, name, value, str, itemStr, proxy, match, i, len;

				json = {
					t: ELEMENT,
					e: this.tag
				};

				if ( this.attributes && this.attributes.length ) {
					json.a = {};

					len = this.attributes.length;
					for ( i=0; i<len; i+=1 ) {
						name = this.attributes[i].name;

						if ( json.a[ name ] ) {
							throw new Error( 'You cannot have multiple elements with the same name' );
						}

						// empty attributes (e.g. autoplay, checked)
						if( this.attributes[i].value === undefined ) {
							value = null;
						}

						value = jsonify( this.attributes[i].value.items, noStringify );

						json.a[ name ] = value;
					}
				}

				if ( this.items && this.items.length ) {
					json.f = jsonify( this.items, noStringify );
				}

				if ( this.proxies && this.proxies.length ) {
					json.v = {};

					len = this.proxies.length;
					for ( i=0; i<len; i+=1 ) {
						proxy = this.proxies[i];

						// TODO rename domEventName, since transitions use the same mechanism
						if ( proxy.args ) {
							json.v[ proxy.domEventName ] = {
								n: proxy.name,
								a: proxy.args
							};
						} else if ( proxy.dynamicArgs ) {
							json.v[ proxy.domEventName ] = {
								n: proxy.name,
								d: jsonify( proxy.dynamicArgs.items, noStringify )
							};
						} else {
							json.v[ proxy.domEventName ] = proxy.name;
						}
					}
				}

				if ( this.intro ) {
					if ( this.intro.args ) {
						json.t1 = {
							n: this.intro.name,
							a: this.intro.args
						};
					} else if ( this.intro.dynamicArgs ) {
						json.t1 = {
							n: this.intro.name,
							d: jsonify( this.intro.dynamicArgs.items, noStringify )
						};
					} else {
						json.t1 = this.intro.name;
					}
				}

				if ( this.outro ) {
					if ( this.outro.args ) {
						json.t2 = {
							n: this.outro.name,
							a: this.outro.args
						};
					} else if ( this.outro.dynamicArgs ) {
						json.t2 = {
							n: this.outro.name,
							d: jsonify( this.outro.dynamicArgs.items, noStringify )
						};
					} else {
						json.t2 = this.outro.name;
					}
				}

				this.json = json;
				return json;
			},

			toString: function () {
				var str, i, len, attrStr, lcName, attrValueStr, fragStr, isVoid;

				if ( this.str !== undefined ) {
					return this.str;
				}

				// if this isn't an HTML element, it can't be stringified (since the only reason to stringify an
				// element is to use with innerHTML, and SVG doesn't support that method
				if ( allElementNames.indexOf( this.tag.toLowerCase() ) === -1 ) {
					return ( this.str = false );
				}

				// see if children can be stringified (i.e. don't contain mustaches)
				fragStr = stringify( this.items );
				if ( fragStr === false ) {
					return ( this.str = false );
				}

				// do we have proxies? if so we can't use innerHTML
				if ( this.proxies ) {
					return ( this.str = false );
				}

				// is this a void element?
				isVoid = ( voidElementNames.indexOf( this.tag.toLowerCase() ) !== -1 );

				str = '<' + this.tag;
				
				if ( this.attributes ) {
					for ( i=0, len=this.attributes.length; i<len; i+=1 ) {

						lcName = this.attributes[i].name.toLowerCase();
						
						// does this look like a namespaced attribute? if so we can't stringify it
						if ( lcName.indexOf( ':' ) !== -1 ) {
							return ( this.str = false );
						}

						// if this element has an id attribute, it can't be stringified (since references are stored
						// in ractive.nodes). Similarly, intro and outro transitions
						if ( lcName === 'id' || lcName === 'intro' || lcName === 'outro' ) {
							return ( this.str = false );
						}

						attrStr = ' ' + this.attributes[i].name;

						// empty attributes
						if ( this.attributes[i].value !== undefined ) {
							attrValueStr = this.attributes[i].value.toString();

							if ( attrValueStr === false ) {
								return ( this.str = false );
							}

							if ( attrValueStr !== '' ) {
								attrStr += '=';

								// does it need to be quoted?
								if ( /[\s"'=<>`]/.test( attrValueStr ) ) {
									attrStr += '"' + attrValueStr.replace( /"/g, '&quot;' ) + '"';
								} else {
									attrStr += attrValueStr;
								}
							}
						}

						str += attrStr;
					}
				}

				// if this isn't a void tag, but is self-closing, add a solidus. Aaaaand, we're done
				if ( this.selfClosing && !isVoid ) {
					str += '/>';
					return ( this.str = str );
				}

				str += '>';

				// void element? we're done
				if ( isVoid ) {
					return ( this.str = str );
				}

				// if this has children, add them
				str += fragStr;

				str += '</' + this.tag + '>';
				return ( this.str = str );
			}
		};


		voidElementNames = 'area base br col command embed hr img input keygen link meta param source track wbr'.split( ' ' );
		allElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol optgroup option p param pre q s samp script select small span strike strong style sub sup table tbody td textarea tfoot th thead title tr tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split( ' ' );
		closedByParentClose = 'li dd rt rp optgroup option tbody tfoot tr td th'.split( ' ' );

		svgCamelCaseElements = 'altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject glyphRef linearGradient radialGradient textPath vkern'.split( ' ' );
		svgCamelCaseAttributes = 'attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits contentScriptType contentStyleType diffuseConstant edgeMode externalResourcesRequired filterRes filterUnits glyphRef glyphRef gradientTransform gradientTransform gradientUnits gradientUnits kernelMatrix kernelUnitLength kernelUnitLength kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur requiredExtensions requiredFeatures specularConstant specularExponent specularExponent spreadMethod spreadMethod startOffset stdDeviation stitchTiles surfaceScale surfaceScale systemLanguage tableValues targetX targetY textLength textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan'.split( ' ' );
		
		mapToLowerCase = function ( items ) {
			var map = {}, i = items.length;
			while ( i-- ) {
				map[ items[i].toLowerCase() ] = items[i];
			}
			return map;
		};

		svgCamelCaseElementsMap = mapToLowerCase( svgCamelCaseElements );
		svgCamelCaseAttributesMap = mapToLowerCase( svgCamelCaseAttributes );

		siblingsByTagName = {
			li: [ 'li' ],
			dt: [ 'dt', 'dd' ],
			dd: [ 'dt', 'dd' ],
			p: 'address article aside blockquote dir div dl fieldset footer form h1 h2 h3 h4 h5 h6 header hgroup hr menu nav ol p pre section table ul'.split( ' ' ),
			rt: [ 'rt', 'rp' ],
			rp: [ 'rp', 'rt' ],
			optgroup: [ 'optgroup' ],
			option: [ 'option', 'optgroup' ],
			thead: [ 'tbody', 'tfoot' ],
			tbody: [ 'tbody', 'tfoot' ],
			tr: [ 'tr' ],
			td: [ 'td', 'th' ],
			th: [ 'td', 'th' ]
		};

		sanitize = function ( attr ) {
			return attr.name.substr( 0, 2 ) !== 'on';
		};

		onlyAttrs = function ( attr ) {
			return attr.name.substr( 0, 6 ) !== 'proxy-';
		};

		onlyProxies = function ( attr ) {
			if ( attr.name.substr( 0, 6 ) === 'proxy-' ) {
				attr.name = attr.name.substring( 6 );
				return true;
			}
			return false;
		};

		filterAttrs = function ( items ) {
			var attrs, proxies, filtered, i, len, item;

			filtered = {};
			attrs = [];
			proxies = [];

			len = items.length;
			for ( i=0; i<len; i+=1 ) {
				item = items[i];

				// Transition?
				if ( item.name === 'intro' ) {
					if ( filtered.intro ) {
						throw new Error( 'An element can only have one intro transition' );
					}

					filtered.intro = item;
				} else if ( item.name === 'outro' ) {
					if ( filtered.outro ) {
						throw new Error( 'An element can only have one outro transition' );
					}

					filtered.outro = item;
				}

				// Proxy?
				else if ( item.name.substr( 0, 6 ) === 'proxy-' ) {
					item.name = item.name.substring( 6 );
					proxies[ proxies.length ] = item;
				}

				// Attribute?
				else {
					attrs[ attrs.length ] = item;
				}
			}

			filtered.attrs = attrs;
			filtered.proxies = proxies;

			return filtered;
		};

		proxyPattern = /^([a-zA-Z_$][a-zA-Z_$0-9]*)(?::(.+))?$/;
	}());


	// expression
	(function () {

		var getRefs, stringify;

		Expression = function ( token ) {
			this.refs = [];

			getRefs( token, this.refs );
			this.str = stringify( token, this.refs );
		};

		Expression.prototype = {
			toJson: function () {
				return {
					r: this.refs,
					s: this.str
				};
			}
		};


		// TODO maybe refactor this?
		getRefs = function ( token, refs ) {
			var i;

			if ( token.t === REFERENCE ) {
				if ( refs.indexOf( token.n ) === -1 ) {
					refs.unshift( token.n );
				}
			}

			if ( token.o ) {
				if ( isObject( token.o ) ) {
					getRefs( token.o, refs );
				} else {
					i = token.o.length;
					while ( i-- ) {
						getRefs( token.o[i], refs );
					}
				}
			}

			if ( token.x ) {
				getRefs( token.x, refs );
			}

			if ( token.r ) {
				getRefs( token.r, refs );
			}
		};


		stringify = function ( token, refs ) {
			var map = function ( item ) {
				return stringify( item, refs );
			};

			switch ( token.t ) {
				case BOOLEAN_LITERAL:
				case GLOBAL:
				case NUMBER_LITERAL:
				return token.v;

				case STRING_LITERAL:
				return "'" + token.v.replace( /'/g, "\\'" ) + "'";

				case ARRAY_LITERAL:
				return '[' + token.m.map( map ).join( ',' ) + ']';

				case PREFIX_OPERATOR:
				return ( token.s === 'typeof' ? 'typeof ' : token.s ) + stringify( token.o, refs );

				case INFIX_OPERATOR:
				return stringify( token.o[0], refs ) + token.s + stringify( token.o[1], refs );

				case INVOCATION:
				return stringify( token.x, refs ) + '(' + ( token.o ? token.o.map( map ).join( ',' ) : '' ) + ')';

				case BRACKETED:
				return '(' + stringify( token.x, refs ) + ')';

				case MEMBER:
				return stringify( token.x, refs ) + stringify( token.r, refs );

				case REFINEMENT:
				return ( token.n ? '.' + token.n : '[' + stringify( token.x, refs ) + ']' );

				case CONDITIONAL:
				return stringify( token.o[0], refs ) + '?' + stringify( token.o[1], refs ) + ':' + stringify( token.o[2], refs );

				case REFERENCE:
				return '❖' + refs.indexOf( token.n );

				default:
				throw new Error( 'Could not stringify expression token. This error is unexpected' );
			}
		};
	}());

}());
var getToken;

(function () {

	var getStringMatch,
	getRegexMatcher,
	allowWhitespace,

	getMustache,
	getTriple,
	getTag,
	getText,
	getExpression,

	getDelimiter,
	getDelimiterChange,
	getName,
	getMustacheRef,
	getRefinement,
	getDotRefinement,
	getArrayRefinement,
	getArrayMember,

	getSingleQuotedString,
	getUnescapedSingleQuotedChars,
	getDoubleQuotedString,
	getUnescapedDoubleQuotedChars,
	getEscapedChars,
	getEscapedChar,

	fail;


	getToken = function ( tokenizer ) {
		var token = getMustache( tokenizer ) ||
		        getTriple( tokenizer ) ||
		        getTag( tokenizer ) ||
		        getText( tokenizer );

		return token;
	};



	// helpers
	fail = function ( tokenizer, expected ) {
		var remaining = tokenizer.remaining().substr( 0, 40 );
		if ( remaining.length === 40 ) {
			remaining += '...';
		}
		throw new Error( 'Tokenizer failed: unexpected string "' + remaining + '" (expected ' + expected + ')' );
	};

	getStringMatch = function ( tokenizer, string ) {
		var substr;

		substr = tokenizer.str.substr( tokenizer.pos, string.length );

		if ( substr === string ) {
			tokenizer.pos += string.length;
			return string;
		}

		return null;
	};

	getRegexMatcher = function ( regex ) {
		return function ( tokenizer ) {
			var match = regex.exec( tokenizer.str.substring( tokenizer.pos ) );

			if ( !match ) {
				return null;
			}

			tokenizer.pos += match[0].length;
			return match[1] || match[0];
		};
	};

	allowWhitespace = function ( tokenizer ) {
		var match = leadingWhitespace.exec( tokenizer.str.substring( tokenizer.pos ) );

		if ( !match ) {
			return null;
		}

		tokenizer.pos += match[0].length;
		return match[0];
	};


	// shared
	getDelimiter = getRegexMatcher( /^[^\s=]+/ );

	getDelimiterChange = function ( tokenizer ) {
		var start, opening, closing;

		if ( !getStringMatch( tokenizer, '=' ) ) {
			return null;
		}

		start = tokenizer.pos;

		// allow whitespace before new opening delimiter
		allowWhitespace( tokenizer );

		opening = getDelimiter( tokenizer );
		if ( !opening ) {
			tokenizer.pos = start;
			return null;
		}

		// allow whitespace (in fact, it's necessary...)
		allowWhitespace( tokenizer );

		closing = getDelimiter( tokenizer );
		if ( !closing ) {
			tokenizer.pos = start;
			return null;
		}

		// allow whitespace before closing '='
		allowWhitespace( tokenizer );

		if ( !getStringMatch( tokenizer, '=' ) ) {
			tokenizer.pos = start;
			return null;
		}

		return [ opening, closing ];
	};

	getName = getRegexMatcher( /^[a-zA-Z_$][a-zA-Z_$0-9]*/ );

	getMustacheRef = function ( tokenizer ) {
		var start, ref, member, dot, name;

		start = tokenizer.pos;

		dot = getStringMatch( tokenizer, '.' ) || '';
		name = getName( tokenizer ) || '';

		if ( dot && !name ) {
			return dot;
		}

		ref = dot + name;
		if ( !ref ) {
			return null;
		}

		member = getRefinement( tokenizer );
		while ( member !== null ) {
			ref += member;
			member = getRefinement( tokenizer );
		}

		return ref;
	};

	getRefinement = function ( tokenizer ) {
		return getDotRefinement( tokenizer ) || getArrayRefinement( tokenizer );
	};

	getDotRefinement = getRegexMatcher( /^\.[a-zA-Z_$][a-zA-Z_$0-9]*/ );

	getArrayRefinement = function ( tokenizer ) {
		var num = getArrayMember( tokenizer );

		if ( num ) {
			return '.' + num;
		}

		return null;
	};

	getArrayMember = getRegexMatcher( /^\[(0|[1-9][0-9]*)\]/ );

	getSingleQuotedString = function ( tokenizer ) {
		var start, string, escaped, unescaped, next;

		start = tokenizer.pos;

		string = '';

		escaped = getEscapedChars( tokenizer );
		if ( escaped ) {
			string += escaped;
		}

		unescaped = getUnescapedSingleQuotedChars( tokenizer );
		if ( unescaped ) {
			string += unescaped;
		}
		if ( string ) {
			next = getSingleQuotedString( tokenizer );
			while ( next ) {
				string += next;
				next = getSingleQuotedString( tokenizer );
			}
		}

		return string;
	};

	getUnescapedSingleQuotedChars = getRegexMatcher( /^[^\\']+/ );

	getDoubleQuotedString = function ( tokenizer ) {
		var start, string, escaped, unescaped, next;

		start = tokenizer.pos;

		string = '';

		escaped = getEscapedChars( tokenizer );
		if ( escaped ) {
			string += escaped;
		}

		unescaped = getUnescapedDoubleQuotedChars( tokenizer );
		if ( unescaped ) {
			string += unescaped;
		}

		if ( !string ) {
			return '';
		}

		next = getDoubleQuotedString( tokenizer );
		while ( next !== '' ) {
			string += next;
		}

		return string;
	};

	getUnescapedDoubleQuotedChars = getRegexMatcher( /^[^\\"]+/ );

	getEscapedChars = function ( tokenizer ) {
		var chars = '', character;

		character = getEscapedChar( tokenizer );
		while ( character ) {
			chars += character;
			character = getEscapedChar( tokenizer );
		}

		return chars || null;
	};

	getEscapedChar = function ( tokenizer ) {
		var character;

		if ( !getStringMatch( tokenizer, '\\' ) ) {
			return null;
		}

		character = tokenizer.str.charAt( tokenizer.pos );
		tokenizer.pos += 1;

		return character;
	};

	



	// mustache / triple
	(function () {
		var getMustacheContent,
			getMustacheType,
			getIndexRef,
			mustacheTypes;

		getMustache = function ( tokenizer ) {
			var start = tokenizer.pos, content;

			if ( !getStringMatch( tokenizer, tokenizer.delimiters[0] ) ) {
				return null;
			}

			// delimiter change?
			content = getDelimiterChange( tokenizer );
			if ( content ) {
				// find closing delimiter or abort...
				if ( !getStringMatch( tokenizer, tokenizer.delimiters[1] ) ) {
					tokenizer.pos = start;
					return null;
				}

				// ...then make the switch
				tokenizer.delimiters = content;
				return { type: MUSTACHE, mustacheType: DELIMCHANGE };
			}

			content = getMustacheContent( tokenizer );

			if ( content === null ) {
				tokenizer.pos = start;
				return null;
			}

			// allow whitespace before closing delimiter
			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, tokenizer.delimiters[1] ) ) {
				fail( tokenizer, '"' + tokenizer.delimiters[1] + '"' );
			}

			return content;
		};

		getTriple = function ( tokenizer ) {
			var start = tokenizer.pos, content;

			if ( !getStringMatch( tokenizer, tokenizer.tripleDelimiters[0] ) ) {
				return null;
			}

			// delimiter change?
			content = getDelimiterChange( tokenizer );
			if ( content ) {
				// find closing delimiter or abort...
				if ( !getStringMatch( tokenizer, tokenizer.delimiters[1] ) ) {
					tokenizer.pos = start;
					return null;
				}

				// ...then make the switch
				tokenizer.tripleDelimiters = content;
				return { type: DELIMCHANGE };
			}

			// allow whitespace between opening delimiter and reference
			allowWhitespace( tokenizer );

			content = getMustacheContent( tokenizer, true );

			if ( content === null ) {
				tokenizer.pos = start;
				return null;
			}

			// allow whitespace between reference and closing delimiter
			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, tokenizer.tripleDelimiters[1] ) ) {
				tokenizer.pos = start;
				return null;
			}

			return content;
		};

		getMustacheContent = function ( tokenizer, isTriple ) {
			var start, mustache, type, expr, i, remaining, index;

			start = tokenizer.pos;

			mustache = { type: isTriple ? TRIPLE : MUSTACHE };

			// mustache type
			if ( !isTriple ) {
				type = getMustacheType( tokenizer );
				mustache.mustacheType = type || INTERPOLATOR; // default

				// if it's a comment, allow any contents except '}}'
				if ( type === COMMENT ) {
					remaining = tokenizer.remaining();
					index = remaining.indexOf( tokenizer.delimiters[1] );

					if ( index !== -1 ) {
						tokenizer.pos += index;
						return mustache;
					}
				}
			}

			// allow whitespace
			allowWhitespace( tokenizer );

			// is this an expression?
			if ( getStringMatch( tokenizer, '(' ) ) {
				
				// looks like it...
				allowWhitespace( tokenizer );

				expr = getExpression( tokenizer );

				allowWhitespace( tokenizer );

				if ( !getStringMatch( tokenizer, ')' ) ) {
					fail( tokenizer, '")"' );
				}

				mustache.expression = expr;
			}

			else {
				// mustache reference
				mustache.ref = getMustacheRef( tokenizer );
				if ( !mustache.ref ) {
					tokenizer.pos = start;
					return null;
				}
			}

			// optional index reference
			i = getIndexRef( tokenizer );
			if ( i !== null ) {
				mustache.indexRef = i;
			}

			return mustache;
		};

		mustacheTypes = {
			'#': SECTION,
			'^': INVERTED,
			'/': CLOSING,
			'>': PARTIAL,
			'!': COMMENT,
			'&': INTERPOLATOR
		};

		getMustacheType = function ( tokenizer ) {
			var type = mustacheTypes[ tokenizer.str.charAt( tokenizer.pos ) ];

			if ( !type ) {
				return null;
			}

			tokenizer.pos += 1;
			return type;
		};

		getIndexRef = getRegexMatcher( /^\s*:\s*([a-zA-Z_$][a-zA-Z_$0-9]*)/ );
	}());


	// tag
	(function () {
		var getOpeningTag,
		getClosingTag,
		getTagName,
		getAttributes,
		getAttribute,
		getAttributeName,
		getAttributeValue,
		getUnquotedAttributeValue,
		getUnquotedAttributeValueToken,
		getUnquotedAttributeValueText,
		getSingleQuotedAttributeValue,
		getSingleQuotedStringToken,
		getDoubleQuotedAttributeValue,
		getDoubleQuotedStringToken;

		getTag = function ( tokenizer ) {
			return ( getOpeningTag( tokenizer ) || getClosingTag( tokenizer ) );
		};

		getOpeningTag = function ( tokenizer ) {
			var start, tag, attrs;

			start = tokenizer.pos;

			if ( !getStringMatch( tokenizer, '<' ) ) {
				return null;
			}

			tag = {
				type: TAG
			};

			// tag name
			tag.name = getTagName( tokenizer );
			if ( !tag.name ) {
				tokenizer.pos = start;
				return null;
			}

			// attributes
			attrs = getAttributes( tokenizer );
			if ( attrs ) {
				tag.attrs = attrs;
			}

			// self-closing solidus?
			if ( getStringMatch( tokenizer, '/' ) ) {
				tag.selfClosing = true;
			}

			// closing angle bracket
			if ( !getStringMatch( tokenizer, '>' ) ) {
				tokenizer.pos = start;
				return null;
			}

			return tag;
		};

		getClosingTag = function ( tokenizer ) {
			var start, tag;

			start = tokenizer.pos;

			if ( !getStringMatch( tokenizer, '<' ) ) {
				return null;
			}

			tag = { type: TAG, closing: true };

			// closing solidus
			if ( !getStringMatch( tokenizer, '/' ) ) {
				throw new Error( 'Unexpected character ' + tokenizer.remaining().charAt( 0 ) + ' (expected "/")' );
			}

			// tag name
			tag.name = getTagName( tokenizer );
			if ( !tag.name ) {
				throw new Error( 'Unexpected character ' + tokenizer.remaining().charAt( 0 ) + ' (expected tag name)' );
			}

			// closing angle bracket
			if ( !getStringMatch( tokenizer, '>' ) ) {
				throw new Error( 'Unexpected character ' + tokenizer.remaining().charAt( 0 ) + ' (expected ">")' );
			}

			return tag;
		};

		getTagName = getRegexMatcher( /^[a-zA-Z][a-zA-Z0-9]*/ );

		getAttributes = function ( tokenizer ) {
			var start, attrs, attr;

			start = tokenizer.pos;

			allowWhitespace( tokenizer );

			attr = getAttribute( tokenizer );

			if ( !attr ) {
				tokenizer.pos = start;
				return null;
			}

			attrs = [];

			while ( attr !== null ) {
				attrs[ attrs.length ] = attr;

				allowWhitespace( tokenizer );
				attr = getAttribute( tokenizer );
			}

			return attrs;
		};

		getAttribute = function ( tokenizer ) {
			var attr, name, value;

			name = getAttributeName( tokenizer );
			if ( !name ) {
				return null;
			}

			attr = {
				name: name
			};

			value = getAttributeValue( tokenizer );
			if ( value ) {
				attr.value = value;
			}

			return attr;
		};

		getAttributeName = getRegexMatcher( /^[^\s"'>\/=]+/ );

		

		getAttributeValue = function ( tokenizer ) {
			var start, value;

			start = tokenizer.pos;

			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, '=' ) ) {
				tokenizer.pos = start;
				return null;
			}

			value = getSingleQuotedAttributeValue( tokenizer ) || getDoubleQuotedAttributeValue( tokenizer ) || getUnquotedAttributeValue( tokenizer );

			if ( value === null ) {
				tokenizer.pos = start;
				return null;
			}

			return value;
		};

		getUnquotedAttributeValueText = getRegexMatcher( /^[^\s"'=<>`]+/ );

		getUnquotedAttributeValueToken = function ( tokenizer ) {
			var start, text, index;

			start = tokenizer.pos;

			text = getUnquotedAttributeValueText( tokenizer );

			if ( !text ) {
				return null;
			}

			if ( ( index = text.indexOf( tokenizer.delimiters[0] ) ) !== -1 ) {
				text = text.substr( 0, index );
				tokenizer.pos = start + text.length;
			}

			return {
				type: TEXT,
				value: text
			};
		};

		getUnquotedAttributeValue = function ( tokenizer ) {
			var tokens, token;

			tokens = [];

			token = getMustache( tokenizer ) || getUnquotedAttributeValueToken( tokenizer );
			while ( token !== null ) {
				tokens[ tokens.length ] = token;
				token = getMustache( tokenizer ) || getUnquotedAttributeValueToken( tokenizer );
			}

			if ( !tokens.length ) {
				return null;
			}

			return tokens;
		};


		getSingleQuotedStringToken = function ( tokenizer ) {
			var start, text, index;

			start = tokenizer.pos;

			text = getSingleQuotedString( tokenizer );

			if ( !text ) {
				return null;
			}

			if ( ( index = text.indexOf( tokenizer.delimiters[0] ) ) !== -1 ) {
				text = text.substr( 0, index );
				tokenizer.pos = start + text.length;
			}

			return {
				type: TEXT,
				value: text
			};
		};

		getSingleQuotedAttributeValue = function ( tokenizer ) {
			var start, tokens, token;

			start = tokenizer.pos;

			if ( !getStringMatch( tokenizer, "'" ) ) {
				return null;
			}

			tokens = [];

			token = getMustache( tokenizer ) || getSingleQuotedStringToken( tokenizer );
			while ( token !== null ) {
				tokens[ tokens.length ] = token;
				token = getMustache( tokenizer ) || getSingleQuotedStringToken( tokenizer );
			}

			if ( !getStringMatch( tokenizer, "'" ) ) {
				tokenizer.pos = start;
				return null;
			}

			return tokens;

		};

		getDoubleQuotedStringToken = function ( tokenizer ) {
			var start, text, index;

			start = tokenizer.pos;

			text = getDoubleQuotedString( tokenizer );

			if ( !text ) {
				return null;
			}

			if ( ( index = text.indexOf( tokenizer.delimiters[0] ) ) !== -1 ) {
				text = text.substr( 0, index );
				tokenizer.pos = start + text.length;
			}

			return {
				type: TEXT,
				value: text
			};
		};

		getDoubleQuotedAttributeValue = function ( tokenizer ) {
			var start, tokens, token;

			start = tokenizer.pos;

			if ( !getStringMatch( tokenizer, '"' ) ) {
				return null;
			}

			tokens = [];

			token = getMustache( tokenizer ) || getDoubleQuotedStringToken( tokenizer );
			while ( token !== null ) {
				tokens[ tokens.length ] = token;
				token = getMustache( tokenizer ) || getDoubleQuotedStringToken( tokenizer );
			}

			if ( !getStringMatch( tokenizer, '"' ) ) {
				tokenizer.pos = start;
				return null;
			}

			return tokens;

		};
	}());


	// text
	(function () {
		getText = function ( tokenizer ) {
			var minIndex, text;

			minIndex = tokenizer.str.length;

			// anything goes except opening delimiters or a '<'
			[ tokenizer.delimiters[0], tokenizer.tripleDelimiters[0], '<' ].forEach( function ( substr ) {
				var index = tokenizer.str.indexOf( substr, tokenizer.pos );

				if ( index !== -1 ) {
					minIndex = Math.min( index, minIndex );
				}
			});

			if ( minIndex === tokenizer.pos ) {
				return null;
			}

			text = tokenizer.str.substring( tokenizer.pos, minIndex );
			tokenizer.pos = minIndex;

			return {
				type: TEXT,
				value: text
			};

		};
	}());


	// expression
	(function () {
		var getExpressionList,
		makePrefixSequenceMatcher,
		makeInfixSequenceMatcher,
		getRightToLeftSequenceMatcher,
		getBracketedExpression,
		getPrimary,
		getMember,
		getInvocation,
		getTypeOf,
		getLogicalOr,
		getConditional,
		
		getDigits,
		getExponent,
		getFraction,
		getInteger,
		
		getReference,
		getRefinement,

		getLiteral,
		getArrayLiteral,
		getBooleanLiteral,
		getNumberLiteral,
		getStringLiteral,
		getObjectLiteral,
		getGlobal,

		getKeyValuePairs,
		getKeyValuePair,
		getKey,

		globals;

		getExpression = function ( tokenizer ) {

			var start, expression, fns, fn, i, len;

			start = tokenizer.pos;

			// The conditional operator is the lowest precedence operator (except yield,
			// assignment operators, and commas, none of which are supported), so we
			// start there. If it doesn't match, it 'falls through' to progressively
			// higher precedence operators, until it eventually matches (or fails to
			// match) a 'primary' - a literal or a reference. This way, the abstract syntax
			// tree has everything in its proper place, i.e. 2 + 3 * 4 === 14, not 20.
			expression = getConditional( tokenizer );

			return expression;
		};

		getExpressionList = function ( tokenizer ) {
			var start, expressions, expr, next;

			start = tokenizer.pos;

			allowWhitespace( tokenizer );

			expr = getExpression( tokenizer );

			if ( expr === null ) {
				return null;
			}

			expressions = [ expr ];

			// allow whitespace between expression and ','
			allowWhitespace( tokenizer );

			if ( getStringMatch( tokenizer, ',' ) ) {
				next = getExpressionList( tokenizer );
				if ( next === null ) {
					tokenizer.pos = start;
					return null;
				}

				expressions = expressions.concat( next );
			}

			return expressions;
		};

		getBracketedExpression = function ( tokenizer ) {
			var start, expr;

			start = tokenizer.pos;

			if ( !getStringMatch( tokenizer, '(' ) ) {
				return null;
			}

			allowWhitespace( tokenizer );

			expr = getExpression( tokenizer );
			if ( !expr ) {
				tokenizer.pos = start;
				return null;
			}

			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, ')' ) ) {
				tokenizer.pos = start;
				return null;
			}

			return {
				t: BRACKETED,
				x: expr
			};
		};

		getPrimary = function ( tokenizer ) {
			return getLiteral( tokenizer )
			    || getReference( tokenizer )
			    || getBracketedExpression( tokenizer );
		};

		getMember = function ( tokenizer ) {
			var start, expression, name, refinement, member;

			expression = getPrimary( tokenizer );
			if ( !expression ) {
				return null;
			}

			refinement = getRefinement( tokenizer );
			if ( !refinement ) {
				return expression;
			}

			while ( refinement !== null ) {
				member = {
					t: MEMBER,
					x: expression,
					r: refinement
				};

				expression = member;
				refinement = getRefinement( tokenizer );
			}

			return member;
		};

		getInvocation = function ( tokenizer ) {
			var start, expression, expressionList, result;

			expression = getMember( tokenizer );
			if ( !expression ) {
				return null;
			}

			start = tokenizer.pos;

			if ( !getStringMatch( tokenizer, '(' ) ) {
				return expression;
			}

			allowWhitespace( tokenizer );
			expressionList = getExpressionList( tokenizer );

			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, ')' ) ) {
				tokenizer.pos = start;
				return expression;
			}

			result = {
				t: INVOCATION,
				x: expression
			};

			if ( expressionList ) {
				result.o = expressionList;
			}

			return result;
		};

		// right-to-left
		makePrefixSequenceMatcher = function ( symbol, fallthrough ) {
			return function ( tokenizer ) {
				var start, expression;

				if ( !getStringMatch( tokenizer, symbol ) ) {
					return fallthrough( tokenizer );
				}

				start = tokenizer.pos;

				allowWhitespace( tokenizer );

				expression = getExpression( tokenizer );
				if ( !expression ) {
					fail( tokenizer, 'an expression' );
				}

				return {
					s: symbol,
					o: expression,
					t: PREFIX_OPERATOR
				};
			};
		};

		// create all prefix sequence matchers
		(function () {
			var i, len, matcher, prefixOperators, fallthrough;

			prefixOperators = '! ~ + - typeof'.split( ' ' );

			// An invocation operator is higher precedence than logical-not
			fallthrough = getInvocation;
			for ( i=0, len=prefixOperators.length; i<len; i+=1 ) {
				matcher = makePrefixSequenceMatcher( prefixOperators[i], fallthrough );
				fallthrough = matcher;
			}

			// typeof operator is higher precedence than multiplication, so provides the
			// fallthrough for the multiplication sequence matcher we're about to create
			// (we're skipping void and delete)
			getTypeOf = fallthrough;
		}());


		makeInfixSequenceMatcher = function ( symbol, fallthrough ) {
			return function ( tokenizer ) {
				var start, left, right;

				left = fallthrough( tokenizer );
				if ( !left ) {
					return null;
				}

				start = tokenizer.pos;

				allowWhitespace( tokenizer );

				if ( !getStringMatch( tokenizer, symbol ) ) {
					tokenizer.pos = start;
					return left;
				}

				allowWhitespace( tokenizer );

				right = getExpression( tokenizer );
				if ( !right ) {
					tokenizer.pos = start;
					return left;
				}

				return {
					t: INFIX_OPERATOR,
					s: symbol,
					o: [ left, right ]
				};
			};
		};

		// create all infix sequence matchers
		(function () {
			var i, len, matcher, infixOperators, fallthrough;

			// All the infix operators on order of precedence (source: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Operators/Operator_Precedence)
			// Each sequence matcher will initially fall through to its higher precedence
			// neighbour, and only attempt to match if one of the higher precedence operators
			// (or, ultimately, a literal, reference, or bracketed expression) already matched
			infixOperators = '* / % + - << >> >>> < <= > >= in instanceof == != === !== & ^ | && ||'.split( ' ' );

			// A typeof operator is higher precedence than multiplication
			fallthrough = getTypeOf;
			for ( i=0, len=infixOperators.length; i<len; i+=1 ) {
				matcher = makeInfixSequenceMatcher( infixOperators[i], fallthrough );
				fallthrough = matcher;
			}

			// Logical OR is the fallthrough for the conditional matcher
			getLogicalOr = fallthrough;
		}());
		

		// The conditional operator is the lowest precedence operator, so we start here
		getConditional = function ( tokenizer ) {
			var start, expression, ifTrue, ifFalse;

			expression = getLogicalOr( tokenizer );
			if ( !expression ) {
				return null;
			}

			start = tokenizer.pos;

			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, '?' ) ) {
				tokenizer.pos = start;
				return expression;
			}

			allowWhitespace( tokenizer );

			ifTrue = getExpression( tokenizer );
			if ( !ifTrue ) {
				tokenizer.pos = start;
				return expression;
			}

			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, ':' ) ) {
				tokenizer.pos = start;
				return expression;
			}

			allowWhitespace( tokenizer );

			ifFalse = getExpression( tokenizer );
			if ( !ifFalse ) {
				tokenizer.pos = start;
				return expression;
			}

			return {
				t: CONDITIONAL,
				o: [ expression, ifTrue, ifFalse ]
			};
		};
		


		getDigits = getRegexMatcher( /^[0-9]+/ );
		getExponent = getRegexMatcher( /^[eE][\-+]?[0-9]+/ );
		getFraction = getRegexMatcher( /^\.[0-9]+/ );
		getInteger = getRegexMatcher( /^(0|[1-9][0-9]*)/ );


		getReference = function ( tokenizer ) {
			var name, dot, combo;

			// could be an implicit iterator ('.'), a prefixed reference ('.name') or a
			// standard reference ('name')
			dot = getStringMatch( tokenizer, '.' ) || '';
			name = getName( tokenizer ) || '';

			combo = dot + name;

			if ( !combo ) {
				return null;
			}

			return {
				t: REFERENCE,
				n: combo
			};
		};

		getRefinement = function ( tokenizer ) {
			var start, refinement, name, expr;

			start = tokenizer.pos;

			allowWhitespace( tokenizer );

			// "." name
			if ( getStringMatch( tokenizer, '.' ) ) {
				allowWhitespace( tokenizer );

				if ( name = getName( tokenizer ) ) {
					return {
						t: REFINEMENT,
						n: name
					};
				}

				fail( 'a property name' );
			}

			// "[" expression "]"
			if ( getStringMatch( tokenizer, '[' ) ) {
				allowWhitespace( tokenizer );

				expr = getExpression( tokenizer );
				if ( !expr ) {
					fail( 'an expression' );
				}

				allowWhitespace( tokenizer );

				if ( !getStringMatch( tokenizer, ']' ) ) {
					fail( '"]"' );
				}

				return {
					t: REFINEMENT,
					x: expr
				};
			}

			return null;
		};

		// Any literal except function and regexp literals, which aren't supported (yet?)
		getLiteral = function ( tokenizer ) {
			var literal = getNumberLiteral( tokenizer )   ||
			              getBooleanLiteral( tokenizer )  ||
			              getGlobal( tokenizer )          ||
			              getStringLiteral( tokenizer )   ||
			              getObjectLiteral( tokenizer )   ||
			              getArrayLiteral( tokenizer );

			return literal;
		};

		getArrayLiteral = function ( tokenizer ) {
			var start, array, expressions;

			start = tokenizer.pos;

			// allow whitespace before '['
			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, '[' ) ) {
				tokenizer.pos = start;
				return null;
			}

			expressions = expressionList( tokenizer );

			if ( !getStringMatch( tokenizer, ']' ) ) {
				tokenizer.pos = start;
				return null;
			}

			return {
				t: ARRAY_LITERAL,
				o: expressions
			};
		};

		getBooleanLiteral = function ( tokenizer ) {
			var remaining = tokenizer.remaining();

			if ( remaining.substr( 0, 4 ) === 'true' ) {
				tokenizer.pos += 4;
				return {
					t: BOOLEAN_LITERAL,
					v: 'true'
				};
			}

			if ( remaining.substr( 0, 5 ) === 'false' ) {
				tokenizer.pos += 5;
				return {
					t: BOOLEAN_LITERAL,
					v: 'false'
				};
			}

			return null;
		};

		globals = /^(?:Array|Date|RegExp|decodeURIComponent|decodeURI|encodeURIComponent|encodeURI|isFinite|isNaN|parseFloat|parseInt|JSON|Math|NaN|undefined|null)/;

		// Not strictly literals, but we can treat them as such because they
		// never need to be dereferenced.

		// Allowed globals:
		// ----------------
		//
		// Array, Date, RegExp, decodeURI, decodeURIComponent, encodeURI, encodeURIComponent, isFinite, isNaN, parseFloat, parseInt, JSON, Math, NaN, undefined, null
		getGlobal = function ( tokenizer ) {
			var start, name, match, global;

			start = tokenizer.pos;
			name = getName( tokenizer );

			if ( !name ) {
				return null;
			}

			match = globals.exec( name );
			if ( match ) {
				tokenizer.pos = start + match[0].length;
				return {
					t: GLOBAL,
					v: match[0]
				};
			}

			tokenizer.pos = start;
			return null;
		};

		getNumberLiteral = function ( tokenizer ) {
			var start, result;

			start = tokenizer.pos;

			// special case - we may have a decimal without a literal zero (because
			// some programmers are plonkers)
			if ( result = getFraction( tokenizer ) ) {
				return {
					t: NUMBER_LITERAL,
					v: result
				};
			}

			result = getInteger( tokenizer );
			if ( result === null ) {
				return null;
			}

			result += getFraction( tokenizer ) || '';
			result += getExponent( tokenizer ) || '';

			return {
				t: NUMBER_LITERAL,
				v: result
			};
		};

		getObjectLiteral = function ( tokenizer ) {
			var start, pairs, keyValuePairs, i, pair;

			start = tokenizer.pos;

			// allow whitespace
			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, '{' ) ) {
				tokenizer.pos = start;
				return null;
			}

			keyValuePairs = getKeyValuePairs( tokenizer );

			// allow whitespace between final value and '}'
			allowWhitespace( tokenizer );

			if ( !getStringMatch( tokenizer, '}' ) ) {
				tokenizer.pos = start;
				return null;
			}

			return {
				t: OBJECT_LITERAL,
				m: keyValuePairs
			};
		};

		getKeyValuePairs = function ( tokenizer ) {
			var start, pairs, pair, keyValuePairs;

			start = tokenizer.pos;

			pair = getKeyValuePair( tokenizer );
			if ( pair === null ) {
				return null;
			}

			pairs = [ pair ];

			if ( getStringMatch( tokenizer, ',' ) ) {
				keyValuePairs = getKeyValuePairs( tokenizer );

				if ( !keyValuePairs ) {
					tokenizer.pos = start;
					return null;
				}

				return pairs.concat( keyValuePairs );
			}

			return pairs;
		};

		getKeyValuePair = function ( tokenizer ) {
			var start, pair, key, value;

			start = tokenizer.pos;

			// allow whitespace between '{' and key
			allowWhitespace( tokenizer );

			key = getKey( tokenizer );
			if ( key === null ) {
				tokenizer.pos = start;
				return null;
			}

			// allow whitespace between key and ':'
			allowWhitespace( tokenizer );

			// next character must be ':'
			if ( !getStringMatch( tokenizer, ':' ) ) {
				tokenizer.pos = start;
				return null;
			}

			// allow whitespace between ':' and value
			allowWhitespace( tokenizer );

			// next expression must be a, well... expression
			value = getExpression( tokenizer );
			if ( value === null ) {
				tokenizer.pos = start;
				return null;
			}

			return {
				t: KEY_VALUE_PAIR,
				k: key,
				v: value
			};
		};

		// http://mathiasbynens.be/notes/javascript-properties
		// can be any name, string literal, or number literal
		getKey = function ( tokenizer ) {
			return getName( tokenizer ) || getStringLiteral( tokenizer ) || getNumberLiteral( tokenizer );
		};

		getStringLiteral = function ( tokenizer ) {
			var start, string;

			start = tokenizer.pos;

			if ( getStringMatch( tokenizer, '"' ) ) {
				string = getDoubleQuotedString( tokenizer );
			
				if ( !getStringMatch( tokenizer, '"' ) ) {
					tokenizer.pos = start;
					return null;
				}

				return {
					t: STRING_LITERAL,
					v: string
				};
			}

			if ( getStringMatch( tokenizer, "'" ) ) {
				string = getSingleQuotedString( tokenizer );

				if ( !getStringMatch( tokenizer, "'" ) ) {
					tokenizer.pos = start;
					return null;
				}

				return {
					t: STRING_LITERAL,
					v: string
				};
			}

			return null;
		};
		
	}());


}());
// Ractive.parse
// ===============
//
// Takes in a string, and returns an object representing the parsed template.
// A parsed template is an array of 1 or more 'descriptors', which in some
// cases have children.
//
// The format is optimised for size, not readability, however for reference the
// keys for each descriptor are as follows:
//
// * r - Reference, e.g. 'mustache' in {{mustache}}
// * t - Type code (e.g. 1 is text, 2 is interpolator...)
// * f - Fragment. Contains a descriptor's children
// * e - Element name
// * a - map of element Attributes, or proxy event/transition Arguments
// * d - Dynamic proxy event/transition arguments
// * n - indicates an iNverted section
// * p - Priority. Higher priority items are updated before lower ones on model changes
// * i - Index reference, e.g. 'num' in {{#section:num}}content{{/section}}
// * v - eVent proxies (i.e. when user e.g. clicks on a node, fire proxy event)
// * c - Conditionals (e.g. ['yes', 'no'] in {{condition ? yes : no}})
// * x - eXpressions
// * t1 - intro Transition
// * t2 - outro Transition

var parse;

(function () {

	var onlyWhitespace, inlinePartialStart, inlinePartialEnd, parseCompoundTemplate;

	onlyWhitespace = /^\s*$/;

	inlinePartialStart = /<!--\s*\{\{\s*>\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*}\}\s*-->/;
	inlinePartialEnd = /<!--\s*\{\{\s*\/\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*}\}\s*-->/;

	parse = function ( template, options ) {
		var tokens, fragmentStub, json, token;

		options = options || {};

		// does this template include inline partials?
		if ( inlinePartialStart.test( template ) ) {
			return parseCompoundTemplate( template, options );
		}


		if ( options.sanitize === true ) {
			options.sanitize = {
				// blacklist from https://code.google.com/p/google-caja/source/browse/trunk/src/com/google/caja/lang/html/html4-elements-whitelist.json
				elements: 'applet base basefont body frame frameset head html isindex link meta noframes noscript object param script style title'.split( ' ' ),
				eventAttributes: true
			};
		}

		tokens = tokenize( template, options );

		if ( !options.preserveWhitespace ) {
			// remove first token if it only contains whitespace
			token = tokens[0];
			if ( token && ( token.type === TEXT ) && onlyWhitespace.test( token.value ) ) {
				tokens.shift();
			}

			// ditto last token
			token = tokens[ tokens.length - 1 ];
			if ( token && ( token.type === TEXT ) && onlyWhitespace.test( token.value ) ) {
				tokens.pop();
			}
		}
		
		fragmentStub = getFragmentStubFromTokens( tokens, 0, options, options.preserveWhitespace );
		
		json = fragmentStub.toJson();

		if ( typeof json === 'string' ) {
			// If we return it as a string, Ractive will attempt to reparse it!
			// Instead we wrap it in an array. Ractive knows what to do then
			return [ json ];
		}

		return json;
	};

	
	parseCompoundTemplate = function ( template, options ) {
		var mainTemplate, remaining, partials, name, startMatch, endMatch;

		partials = {};

		mainTemplate = '';
		remaining = template;

		while ( startMatch = inlinePartialStart.exec( remaining ) ) {
			name = startMatch[1];

			mainTemplate += remaining.substr( 0, startMatch.index );
			remaining = remaining.substring( startMatch.index + startMatch[0].length );

			endMatch = inlinePartialEnd.exec( remaining );

			if ( !endMatch || endMatch[1] !== name ) {
				throw new Error( 'Inline partials must have a closing delimiter, and cannot be nested' );
			}

			partials[ name ] = parse( remaining.substr( 0, endMatch.index ), options );

			remaining = remaining.substring( endMatch.index + endMatch[0].length );
		}

		return {
			template: parse( mainTemplate, options ),
			partials: partials
		};
	};

}());
var tokenize = function ( template, options ) {
	var tokenizer, tokens, token, last20, next20;

	options = options || {};

	tokenizer = {
		str: stripHtmlComments( template ),
		pos: 0,
		delimiters: options.delimiters || [ '{{', '}}' ],
		tripleDelimiters: options.tripleDelimiters || [ '{{{', '}}}' ],
		remaining: function () {
			return tokenizer.str.substring( tokenizer.pos );
		}
	};

	tokens = [];

	while ( tokenizer.pos < tokenizer.str.length ) {
		token = getToken( tokenizer );

		if ( token === null && tokenizer.remaining() ) {
			last20 = tokenizer.str.substr( 0, tokenizer.pos ).substr( -20 );
			if ( last20.length === 20 ) {
				last20 = '...' + last20;
			}

			next20 = tokenizer.remaining().substr( 0, 20 );
			if ( next20.length === 20 ) {
				next20 = next20 + '...';
			}

			throw new Error( 'Could not parse template: ' + ( last20 ? last20 + '<- ' : '' ) + 'failed at character ' + tokenizer.pos + ' ->' + next20 );
		}

		tokens[ tokens.length ] = token;
	}

	stripStandalones( tokens );
	stripCommentTokens( tokens );
	
	return tokens;
};
Ractive.prototype = proto;

Ractive.adaptors = adaptors;
Ractive.eventDefinitions = eventDefinitions;
Ractive.partials = {};

Ractive.easing = easing;
Ractive.extend = extend;
Ractive.interpolate = interpolate;
Ractive.interpolators = interpolators;
Ractive.parse = parse;

// TODO add some more transitions
Ractive.transitions = transitions;


// export as Common JS module...
if ( typeof module !== "undefined" && module.exports ) {
	module.exports = Ractive;
}

// ... or as AMD module
else if ( typeof define === "function" && define.amd ) {
	define('Ractive',[], function () {
		return Ractive;
	});
}

// ... or as browser global
else {
	global.Ractive = Ractive;
}

}( this ));
// Divvy v0.1.4
// Copyright (2013) Rich Harris
// Released under the MIT License

// https://github.com/Rich-Harris/Divvy

;(function ( global ) {

'use strict';

var Divvy;

(function () {

	'use strict';

	var Block,
		Control,

		// touch support?
		touch = ( 'ontouchstart' in document ),

		// shims for shit browsers
		indexOf,
		addClass,
		removeClass,

		// internal helper functions
		getState,
		setState,
		cursor,
		fire,

		// a few string constants
		ROW = 'row',
		COLUMN = 'column',
		LEFT = 'left',
		TOP = 'top',
		WIDTH = 'width',
		HEIGHT = 'height',
		VERTICAL = 'vertical',
		HORIZONTAL = 'horizontal',
		CLIENTX = 'clientX',
		CLIENTY = 'clientY';

	

	Divvy = function ( options ) {
		var self = this, fragment, i, blocks, type;

		this.el = options.el;
		fragment = document.createDocumentFragment();

		if ( options.columns && options.rows ) {
			throw new Error( 'You can\'t have top level rows and top level columns - one or the other' );
		}

		if ( options.columns ) {
			this.type = ROW;
			blocks = options.columns;
		} else if ( options.rows ) {
			this.type = COLUMN;
			blocks = options.rows;
		}

		this.blocks = {};
		this.subs = {}; // events

		this.min = options.min || 10;

		this.root = new Block( this, this, fragment, 'divvy-0', { children: blocks }, 0, 100, this.type, { top: true, right: true, bottom: true, left: true });
		addClass( this.root.node, 'divvy-root' );
		this.el.appendChild( fragment );

		if ( options.shakeOnResize !== false ) {
			window.addEventListener( 'resize', function () {
				self._changedSinceLastResize = {};
				self.shake();
				fire( self, 'resize', self._changedSinceLastResize );
			});
		}

		this._changed = {};
		this._changedSinceLastResize = {};
		this.shake();
	};

	Divvy.prototype = {
		shake: function () {
			this.bcr = this.el.getBoundingClientRect();

			if ( ( this.bcr.width === this.width ) && ( this.bcr.height === this.height ) ) {
				return; // nothing to do
			}

			this.width = this.bcr.width;
			this.height = this.bcr.height;

			this.pixelSize = this[ this.type === COLUMN ? HEIGHT : WIDTH ];

			this.root.shake();

			return this;
		},

		changed: function () {
			var changed = this._changed;
			this._changed = {};

			return changed;
		},

		getState: function () {
			var state = {};

			getState( this.root, state );
			return state;
		},

		setState: function ( state ) {
			var changed = {}, key;

			setState( this, this.root, state, changed );

			// if any of the sizes have changed, fire a resize event...
			for ( key in changed ) {
				if ( changed.hasOwnProperty( key ) ) {
					fire( this, 'resize', changed );
					
					// ...but only the one
					break;
				}
			}
			return this;
		},

		save: function ( id ) {
			var key, value;

			if ( !localStorage ) {
				return;
			}

			key = ( id ? 'divvy_' + id : 'divvy' );
			value = JSON.stringify( this.getState() );

			localStorage.setItem( key, value );

			return this;
		},

		restore: function ( id ) {
			var key, value;

			if ( !localStorage ) {
				return;
			}

			key = ( id ? 'divvy_' + id : 'divvy' );
			value = JSON.parse( localStorage.getItem( key ) );

			if ( value ) {
				this.setState( value );
			}

			return this;
		},

		on: function ( eventName, callback ) {
			var self = this, subs;

			if ( !( subs = this.subs[ eventName ] ) ) {
				this.subs[ eventName ] = [ callback ];
			} else {
				subs[ subs.length ] = callback;
			}

			return {
				cancel: function () {
					self.off( eventName, callback );
				}
			};
		},

		off: function ( eventName, callback ) {
			var index, subs;

			if ( !eventName ) {
				// remove all listeners
				this.subs = {};
				return this;
			}

			if ( !callback ) {
				// remove all listeners of eventName
				delete this.subs[ eventName ];
				return this;
			}

			if ( !( subs = this.subs[ eventName ] ) ) {
				return this;
			}

			index = subs.indexOf( callback );

			if ( index !== -1 ) {
				subs.splice( index, 1 );
				if ( !subs.length ) {
					delete this.subs[ eventName ];
				}
			}

			return this;
		}
	};


	// internal helpers
	fire = function ( divvy, eventName ) {
		var args, subs, i, len;

		subs = divvy.subs[ eventName ];

		if ( !subs ) {
			return;
		}

		args = Array.prototype.slice.call( arguments, 2 );

		// call is faster if we can use it instead of apply
		if ( !args.length ) {
			for ( i=0, len=subs.length; i<len; i+=1 ) {
				subs[i].call( divvy );
			}
			return;
		}

		for ( i=0, len=subs.length; i<len; i+=1 ) {
			subs[i].apply( divvy, args );
		}
		return divvy;
	};

	getState = function ( block, state ) {
		var i;

		state[ block.id ] = [ block.start, block.size ];

		if ( !block.children ) {
			return;
		}

		i = block.children.length;
		while ( i-- ) {
			getState( block.children[i], state );
		}
	};

	setState = function ( divvy, block, state, changed, noShake ) {
		var i, len, child, totalSize, blockState;

		blockState = state[ block.id ];

		if ( !blockState ) {
			return; // something went wrong...
		}

		if ( block.start !== blockState[0] || block.size !== blockState[1] ) {
			divvy._changed[ block.id ] = changed[ block.id ] = true;
		}

		block.start = blockState[0];
		block.size = blockState[1];
		block.end = block.start + block.size;

		block.node.style[ block.type === COLUMN ? LEFT : TOP ] = block.start + '%';
		block.node.style[ block.type === COLUMN ? WIDTH : HEIGHT ] = block.size + '%';

		if ( block.children ) {
			totalSize = 0;
			len = block.children.length;

			for ( i=0; i<len; i+=1 ) {
				child = block.children[i];

				setState( divvy, child, state, changed, true );
				totalSize += child.size;

				if ( block.controls[i] ) {
					block.controls[i].setPosition( totalSize );
				}
			}

			i = block.children.length;
			while ( i-- ) {
				setState( divvy, block.children[i], state, changed, true );	
			}
		}

		//if ( !noShake ) {
			block.shake();
		//}
	};

	cursor = function ( divvy, direction ) {
		if ( !direction ) {
			divvy.el.style.cursor = divvy._cursor;
			return;
		}

		divvy._cursor = divvy.el.style.cursor;
		divvy.el.style.cursor = direction + '-resize';
	};


	// internal constructors
	Block = function ( divvy, parent, parentNode, id, data, start, size, type, edges ) {
		var totalSize, i, total, childData, childSize, node, before, after, childEdges;

		this.start = start;
		this.size = size;
		this.end = this.start + this.size;

		this.type = type;
		this.divvy = divvy;
		this.parent = parent;
		this.edges = edges;

		this.min = data.min || divvy.min;
		this.max = data.max;

		// were we given an existing node?
		if ( data instanceof Element ) {
			data = { node: data };
		}

		// or an ID string?
		if ( typeof data === 'string' ) {
			data = { id: data };
		}

		// ...or an array of children?
		if ( Object.prototype.toString.call( data ) === '[object Array]' ) {
			data = { children: data };
		}

		this.id = data.id || id;


		if ( data.children && data.children.length ) {
			// Branch block
			this.node = document.createElement( 'div' );
			addClass( this.node, 'divvy-block' );
			addClass( this.node, 'divvy-branch' );

			this.node.id = this.id;
		}

		else {
			// Leaf block
			this.node = document.createElement( 'div' );
			addClass( this.node, 'divvy-block' );
			addClass( this.node, 'divvy-leaf' );

			// do we have an ID that references an existing node?
			if ( !data.node && data.id && ( node = document.getElementById( data.id ) ) ) {
				data.node = node;
			}

			if ( data.node ) {
				this.inner = data.node;
			} else {
				this.inner = document.createElement( 'div' );
			}

			addClass( this.inner, 'divvy-inner' );
			this.node.appendChild( this.inner );

			divvy.blocks[ this.id ] = this.inner;

			this.inner.id = this.id;
		}

		if ( edges.top ) { addClass( this.node, 'divvy-top' ); }
		if ( edges.right ) { addClass( this.node, 'divvy-right' ); }
		if ( edges.bottom ) { addClass( this.node, 'divvy-bottom' ); }
		if ( edges.left ) { addClass( this.node, 'divvy-left' ); }
		
		this.node.style[ type === COLUMN ? LEFT : TOP ] = start + '%';
		this.node.style[ type === COLUMN ? WIDTH : HEIGHT ] = size + '%';

		if ( data.children ) {
			// find total size of children
			totalSize = data.children.reduce( function ( prev, curr ) {
				return prev + ( curr.size || 1 );
			}, 0 );

			this.children = [];
			this.controls = [];

			total = 0;
			for ( i=0; i<data.children.length; i+=1 ) {
				childData = data.children[i];
				childSize = 100 * ( ( childData.size || 1 ) / totalSize );

				childEdges = {};
				if ( type === COLUMN ) {
					childEdges.top = edges.top && ( i === 0 );
					childEdges.bottom = edges.bottom && ( i === ( data.children.length - 1 ) );
					childEdges.left = edges.left;
					childEdges.right = edges.right;
				} else {
					childEdges.left = edges.left && ( i === 0 );
					childEdges.right = edges.right && ( i === ( data.children.length - 1 ) );
					childEdges.top = edges.top;
					childEdges.bottom = edges.bottom;
				}



				this.children[i] = new Block( divvy, this, this.node, ( id + i ), childData, total, childSize, type === COLUMN ? ROW : COLUMN, childEdges );
				
				total += childSize;
			}

			for ( i=0; i<data.children.length - 1; i+=1 ) {
				before = this.children[i];
				after = this.children[ i + 1 ];
				this.controls[i] = new Control( divvy, this, this.node, before, after, type === ROW ? VERTICAL : HORIZONTAL );
			}
		}

		parentNode.appendChild( this.node );
	};

	Block.prototype = {
		setStart: function ( start ) {
			var previousStart, previousSize, change, size;

			previousStart = this.start;
			previousSize = this.size;

			change = start - previousStart;
			size = previousSize - change;

			this.node.style[ this.type === COLUMN ? LEFT : TOP ] = start + '%';
			this.node.style[ this.type === COLUMN ? WIDTH : HEIGHT ] = size + '%';

			this.start = start;
			this.size = size;

			this.shake();
		},

		setEnd: function ( end ) {
			var previousEnd, previousSize, change, size;

			previousEnd = this.end;
			previousSize = this.size;

			change = end - previousEnd;
			size = previousSize + change;

			//this.node.style[ this.type === COLUMN ? LEFT : TOP ] = start + '%';
			this.node.style[ this.type === COLUMN ? WIDTH : HEIGHT ] = size + '%';

			this.end = end;
			this.size = size;

			this.shake();
		},

		shake: function () {
			var i, len, a, b, control, size;

			this.bcr = this.node.getBoundingClientRect();

			if ( ( this.bcr.width === this.width ) && ( this.bcr.height === this.height ) ) {
				return; // nothing to do, no need to shake children
			}

			this.width = this.bcr.width;
			this.height = this.bcr.height;
			this.divvy._changed[ this.id ] = this.divvy._changedSinceLastResize[ this.id ] = true;

			// if we don't have any children, we don't need to go any further
			if ( !this.children ) {
				return;
			}

			this.pixelSize = this.bcr[ this.type === COLUMN ? HEIGHT : WIDTH ];

			// enforce minima and maxima - first go forwards
			len = this.children.length;
			for ( i=0; i<len - 1; i+=1 ) {
				a = this.children[i];
				b = this.children[ i+1 ];
				control = this.controls[i];

				size = a.minPc();
				if ( a.size < size ) {
					a.setEnd( a.start + size );
					b.setStart( a.start + size );
					control.setPosition( a.start + size );
				}

				size = a.maxPc();
				if ( a.size > size ) {
					a.setEnd( a.start + size );
					b.setStart( a.start + size );
					control.setPosition( a.start + size );
				}
			}

			// then backwards
			for ( i=len -1; i>0; i-=1 ) {
				a = this.children[ i-1 ];
				b = this.children[i];
				control = this.controls[ i-1 ];

				size = b.minPc();
				if ( b.size < size ) {
					a.setEnd( b.end - size );
					b.setStart( b.end - size );
					control.setPosition( b.end - size );
				}

				size = b.maxPc();
				if ( b.size > size ) {
					a.setEnd( b.end - size );
					b.setStart( b.end - size );
					control.setPosition( b.end - size );
				}
			}

			i = this.children.length;
			while ( i-- ) {
				this.children[i].shake();
			}
		},

		minPc: function () {
			var totalPixels;

			// calculate minimum % width from pixels
			totalPixels = this.parent.pixelSize;
			return ( this.min / totalPixels ) * 100;
		},

		maxPc: function () {
			var totalPixels;

			if ( !this.max ) {
				return 100;
			}

			// calculate minimum % width from pixels
			totalPixels = this.parent.pixelSize;
			return ( this.max / totalPixels ) * 100;
		}
	};


	Control = function ( divvy, parent, parentNode, before, after, type ) {
		var self = this;

		this.divvy = divvy;
		this.parent = parent;
		this.before = before;
		this.after = after;
		this.type = type;

		this.parentNode = parentNode;

		this.node = document.createElement( 'div' );
		addClass( this.node, 'divvy-' + type + '-control' );

		if ( touch ) {
			addClass( this.node, 'divvy-touch-control' );
		}

		// initialise position to the start of the next block
		this.setPosition( after.start );

		this.node.addEventListener( 'mousedown', function ( event ) {
			var start, min, max, afterEnd, move, up, cancel;

			event.preventDefault();

			// constraints
			min = Math.max( before.start + before.minPc(), after.end - after.maxPc() );
			max = Math.min( before.start + before.maxPc(), after.end - after.minPc() );

			move = function ( event ) {
				var position;

				position = self.getPosition( event[ type === VERTICAL ? CLIENTX : CLIENTY ] );
				position = Math.max( min, Math.min( max, position ) );

				before.setEnd( position );
				after.setStart( position );

				self.setPosition( position );

				fire( self.divvy, 'resize', self.divvy._changedSinceLastResize );
				self.divvy._changedSinceLastResize = {};
			};

			up = function ( event ) {
				self.setInactive();
				cancel();
			};

			cancel = function () {
				window.removeEventListener( 'mousemove', move );
				window.removeEventListener( 'mouseup', up );
			};

			window.addEventListener( 'mousemove', move );
			window.addEventListener( 'mouseup', up );
		});

		if ( touch ) {
			this.node.addEventListener( 'touchstart', function ( event ) {
				var touch, pos, finger, start, min, max, afterEnd, move, up, cancel;

				if ( event.touches.length !== 1 ) {
					return;
				}

				event.preventDefault();

				touch = event.touches[0];
				finger = touch.identifier;

				self.setActive();

				// constraints
				min = Math.max( before.start + before.minPc(), after.end - after.maxPc() );
				max = Math.min( before.start + before.maxPc(), after.end - after.minPc() );

				move = function ( event ) {
					var position, touch;

					if ( event.touches.length !== 1 || event.touches[0].identifier !== finger ) {
						cancel();
					}

					touch = event.touches[0];

					position = self.getPosition( touch[ type === VERTICAL ? CLIENTX : CLIENTY ] );
					position = Math.max( min, Math.min( max, position ) );

					before.setEnd( position );
					after.setStart( position );

					self.setPosition( position );

					fire( self.divvy, 'resize', self.divvy._changedSinceLastResize );
					self.divvy._changedSinceLastResize = {};
				};

				up = function ( event ) {
					self.setInactive();
					cancel();
				};

				cancel = function () {
					window.removeEventListener( 'touchmove', move );
					window.removeEventListener( 'touchend', up );
					window.removeEventListener( 'touchcancel', up );
				};

				window.addEventListener( 'touchmove', move );
				window.addEventListener( 'touchend', up );
				window.addEventListener( 'touchcancel', up );
			});
		}

		parentNode.appendChild( this.node );
	};

	Control.prototype = {
		setActive: function ( pos ) {
			addClass( this.node, 'divvy-active' );
			cursor( this.divvy, this.type === VERTICAL ? 'ew' : 'ns' );
		},

		setInactive: function ( pos ) {
			removeClass( this.node, 'divvy-active' );
			cursor( this.divvy, false );
		},

		getPosition: function ( px ) {
			var bcr, bcrStart, bcrSize, position;

			bcr = this.parent.bcr;
			bcrStart = bcr[ this.type === VERTICAL ? LEFT : TOP ];
			bcrSize = bcr[ this.type === VERTICAL ? WIDTH : HEIGHT ];

			position = 100 * ( px - bcrStart ) / bcrSize;

			return position;
		},

		setPosition: function ( pos ) {
			this.node.style[ this.type === VERTICAL ? LEFT : TOP ] = pos + '%';
			this.pos = pos;
		}
	};


	// shims
	indexOf = function ( needle, haystack ) {
		var i, len;

		for ( i=0, len=haystack.length; i<len; i+=1 ) {
			if ( haystack[i] === needle ) {
				return needle;
			}
		}

		return -1;
	};

	addClass = function ( node, className ) {
		var trim;

		if ( node.classList && node.classList.add ) {
			addClass = function ( node, className ) {
				node.classList.add( className );
			};
		}

		else {
			trim = function ( str ) {
				return str.replace( /^\s*/, '' ).replace( /\s*$/ );
			};

			addClass = function ( node, className ) {
				var classNames, index;

				classNames = node.className.split( ' ' ).map( trim );

				if ( classNames.indexOf ) {
					index = classNames.indexOf( className );
				} else {
					index = indexOf( className, classNames );
				}

				if ( index === -1 ) {
					node.className = classNames.concat( className ).join( ' ' );
				}
			};
		}

		addClass( node, className );
	};

	removeClass = function ( node, className ) {
		var trim;

		if ( node.classList && node.classList.remove ) {
			removeClass = function ( node, className ) {
				node.classList.remove( className );
			};
		}

		else {
			trim = function ( str ) {
				return str.replace( /^\s*/, '' ).replace( /\s*$/ );
			};

			removeClass = function ( node, className ) {
				var classNames, index;

				classNames = node.className.split( ' ' ).map( trim );

				if ( classNames.indexOf ) {
					index = classNames.indexOf( className );
				} else {
					index = indexOf( className, classNames );
				}

				if ( index !== -1 ) {
					classNames.splice( index, 1 );
					node.className = classNames.join( ' ' );
				}
			};
		}

		removeClass( node, className );
	};

}());

if ( typeof module !== "undefined" && module.exports ) { module.exports = Divvy; }
else if ( typeof define !== "undefined" && define.amd ) { define('Divvy',[], function () { return Divvy; }); }
else { global.Divvy = Divvy; }

}( this ));
/**
 * @license RequireJS text 2.0.5+ Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('text',['module'], function (module) {
    'use strict';

    var text, fs, Cc, Ci,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = [],
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.5+',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node)) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback) {
            var file = fs.readFileSync(url, 'utf8');
            //Remove BOM (Byte Mark Order) from utf8 files if it is there.
            if (file.indexOf('\uFEFF') === 0) {
                file = file.substring(1);
            }
            callback(file);
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        errback(err);
                    } else {
                        callback(xhr.responseText);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                stringBuffer.append(line);

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes,
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');

        text.get = function (url, callback) {
            var inStream, convertStream,
                readData = {},
                fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});
/*global define, XMLHttpRequest */

define('rv', [ 'text', 'Ractive' ], function ( text, Ractive ) {

	'use strict';

	var buildMap = {};

	return {
		load: function ( name, req, onload, config ) {
			var filename;

			// add .html extension
			filename = name + ( ( name.substr( -5 ) !== '.html' ) ? '.html' : '' );

			text.get( req.toUrl( filename ), function ( template ) {
				var result = Ractive.parse( template );

				if ( config.isBuild ) {
					buildMap[ name ] = result;
				}

				onload( result );
			}, onload.error );
		},

		write: function ( pluginName, name, write ) {
			if ( buildMap[ name ] === undefined ) {
				throw 'Could not parse template ' + name;
			}

			write( 'define("' + pluginName + '!' + name + '",function(){return ' + JSON.stringify( buildMap[ name ] ) + ';})' );
		}
	};

});
define("rv!templates/main",function(){return [{"t":7,"e":"div","a":{"id":"header"},"f":[{"t":7,"e":"h1","f":"Learn Ractive.js"}," ",{"t":7,"e":"div","a":{"class":"tutorial-buttons"},"f":[{"t":7,"e":"a","a":{"class":["button ",{"t":2,"r":"prevTutorialDisabled","p":3}]},"f":"&laquo;","v":{"tap":"prevTutorial"}}," ",{"t":7,"e":"strong","f":[{"t":2,"r":"tutorialNum","p":3},"/",{"t":2,"r":"numTutorials","p":3}]}," ",{"t":7,"e":"a","a":{"class":["button ",{"t":2,"r":"nextTutorialDisabled","p":3}]},"f":"&raquo;","v":{"tap":"nextTutorial"}}]}," ",{"t":7,"e":"h2","f":[{"t":2,"r":"title","p":2}]}]}," ",{"t":7,"e":"div","a":{"id":"content"},"f":[{"t":7,"e":"div","a":{"id":"copy-block","class":"block copy-block"},"f":[{"t":7,"e":"div","a":{"class":"info"},"f":[{"t":7,"e":"div","a":{"class":"buttons"},"f":[{"t":7,"e":"a","a":{"class":"button"},"f":"reset","v":{"tap":"reset"}}]}," ",{"t":7,"e":"div","a":{"class":"buttons-left"},"f":[{"t":7,"e":"a","a":{"class":["button ",{"t":2,"r":"prevDisabled","p":5}]},"f":"&laquo;","v":{"tap":"prev"}}," ",{"t":7,"e":"strong","f":[{"t":2,"r":"stepNum","p":5},"/",{"t":2,"r":"numSteps","p":5}]}," ",{"t":7,"e":"a","a":{"class":["button ",{"t":2,"r":"nextDisabled","p":5}]},"f":"&raquo;","v":{"tap":"next"}}]}]}," ",{"t":7,"e":"div","a":{"id":"copy","class":"content"},"f":[{"t":3,"r":"copy","p":3}," ",{"t":7,"e":"div","a":{"class":"button-container-left"},"f":[{"t":7,"e":"a","a":{"class":["button block-button ",{"t":2,"r":"fixDisabled","p":5}]},"f":"fix code","v":{"tap":"fix"}}]}," ",{"t":7,"e":"div","a":{"class":"button-container-right"},"f":[{"t":7,"e":"a","a":{"class":"button block-button"},"f":["next ",{"t":2,"r":"stepOrTutorial","p":5}," »"],"v":{"tap":"next"}}]}]}]}," ",{"t":7,"e":"div","a":{"id":"output-block","class":"block output-block"},"f":[{"t":7,"e":"div","a":{"class":"info"},"f":"<strong>#output</strong>"}," ",{"t":7,"e":"div","a":{"id":"output","class":"content"}}]}," ",{"t":7,"e":"div","a":{"id":"template","class":"block code-block"},"f":[{"t":7,"e":"div","a":{"class":"info"},"f":"<strong>#template</strong>"}," ",{"t":7,"e":"div","a":{"class":"content","id":"template-editor"}}]}," ",{"t":7,"e":"div","a":{"id":"javascript","class":"block code-block"},"f":[{"t":7,"e":"div","a":{"class":"info"},"f":[{"t":7,"e":"div","a":{"class":"buttons"},"f":[{"t":7,"e":"a","a":{"class":"button"},"f":"execute (Shift-Enter)","v":{"tap":"execute-js"}}]}," ",{"t":7,"e":"strong","f":"#javascript"}]}," ",{"t":7,"e":"div","a":{"class":"content","id":"javascript-editor"}}]}," ",{"t":7,"e":"div","a":{"id":"console","class":"block code-block"},"f":[{"t":7,"e":"div","a":{"class":"info"},"f":[{"t":7,"e":"div","a":{"class":"buttons"},"f":[{"t":7,"e":"a","a":{"class":"button"},"f":"execute (Shift-Enter)","v":{"tap":"execute-console"}}]}," ",{"t":7,"e":"strong","f":"#console"}]}," ",{"t":7,"e":"div","a":{"class":"content","id":"console-editor"}}]}]}," ",{"t":7,"e":"style","a":{"type":"text/css"},"f":[{"t":2,"r":"css","p":1}]}];});
/*global define, document */

define('views/Main', [ 'Ractive', 'Divvy', 'rv!templates/main' ], function ( Ractive, Divvy, main ) {
	
	'use strict';

	return Ractive.extend({
		template: main,

		init: function ( options ) {
			this.divvy = new Divvy({
				el: document.getElementById( 'content' ),
				columns: [
					{
						size: 45,
						children: [{ id: 'copy-block', size: 3 }, { id: 'output-block', size: 2 }]
					},
					{
						size: 55,
						children: [{ id: 'template', size: 3 }, { id: 'javascript', size: 5 }, { id: 'console', size: 2 }]
					}
				]
			});
		}
	});

});
/*global window, define, CodeMirror, document, prettyPrint */

define('controllers/main', [ 'Ractive', 'views/Main' ], function ( Ractive, Main ) {
	
	'use strict';

	var eval2, teardown, teardownQueue, onResizeHandlers, prop, timeouts, _setTimeout, _clearTimeout;

	eval2 = eval; // changes to global context. Bet you didn't know that! Thanks, http://stackoverflow.com/questions/8694300/how-eval-in-javascript-changes-the-calling-context

	teardownQueue = [];
	timeouts = [];

	_setTimeout = window.setTimeout;
	_clearTimeout = window.clearTimeout;

	window.setTimeout = function ( fn, delay ) {
		var timeout = _setTimeout.apply( null, arguments );
		timeouts[ timeouts.length ] = timeout;
	};

	window.clearTimeout = function ( timeout ) {
		var index = timeouts.indexOf( timeout );
		if ( index !== -1 ) {
			timeouts.splice( index, 1 );
		}

		_clearTimeout( timeout );
	};

	teardown = function () {
		while ( teardownQueue.length ) {
			teardownQueue.pop().teardown();
		}

		// neuter any onResize handlers
		onResizeHandlers = [];

		// clear any timeouts
		while ( timeouts[0] ) {
			window.clearTimeout( timeouts[0] );
		}
	};


	window.Ractive = function () {
		// we need to override the constructor so we can keep track of
		// which views need to be torn down during the tutorial
		Ractive.apply( this, arguments );

		teardownQueue[ teardownQueue.length ] = this;
	};

	window.Ractive.prototype = Ractive.prototype;

	for ( prop in Ractive ) {
		if ( Ractive.hasOwnProperty( prop ) ) {
			window.Ractive[ prop ] = Ractive[ prop ];
		}
	}

	onResizeHandlers = [];
	window.onResize = function ( handler ) {
		onResizeHandlers[ onResizeHandlers.length ] = handler;
	};

	return function ( app ) {
		var mainView,
			editors,
			blocks,
			tutorial,
			tutorials,
			tutorialBySlug,
			tutorialIndex,
			currentTutorial,
			stepIndex,
			currentStep,
			executeJs,
			executeConsole,
			slugify,
			hashPattern,
			parseHash,
			reset,
			divvyState;

		slugify = function ( str ) {
			if ( !str ) {
				return '';
			}
			return str.toLowerCase().replace( /[^a-z]/g, '-' ).replace( /-{2,}/g, '-' ).replace( /^-/, '' ).replace( /-$/, '' );
		};

		tutorialBySlug = {};
		window.tutorials = tutorials = app.data.tutorials.map( function ( tutorial, i ) {
			tutorial.slug = slugify( tutorial.title );
			tutorial.index = i;

			tutorialBySlug[ tutorial.slug ] = tutorial;

			return tutorial;
		});


		executeJs = function () {
			var code = editors.javascript.getValue();

			teardown();

			window.template = editors.template.getValue();
			window.output = document.getElementById( 'output' );

			try {
				eval2( code );
			} catch ( err ) {
				throw err; // TODO - feedback to user
			}
		};

		executeConsole = function () {
			var code = editors.console.getValue();

			try {
				eval2( code );
			} catch ( err ) {
				throw err; // TODO - feedback to user
			}
		};

		mainView = new Main({
			el: 'container',
			data: {
				numTutorials: tutorials.length
			}
		});

		mainView.divvy.restore();

		mainView.divvy.on( 'resize', function ( changed ) {
			var state;

			this.save();

			if ( !changed[ 'output-block' ] ) {
				return;
			}
			
			var i = onResizeHandlers.length;
			while ( i-- ) {
				onResizeHandlers[i].call();
			}
		});

		blocks = {
			copy: document.getElementById( 'copy' ),
			output: document.getElementById( 'output' ),
			templateEditor: document.getElementById( 'template-editor' ),
			javascriptEditor: document.getElementById( 'javascript-editor' ),
			consoleEditor: document.getElementById( 'console-editor' )
		};

		editors = {};

		editors.template = new CodeMirror( blocks.templateEditor, {
			mode: 'htmlmixed',
			theme: 'ractive',
			lineNumbers: true,
			lineWrapping: true
		});

		editors.javascript = new CodeMirror( blocks.javascriptEditor, {
			mode: 'javascript',
			theme: 'ractive',
			lineNumbers: true,
			lineWrapping: true,
			extraKeys: { 'Shift-Enter': executeJs }
		});

		editors.console = new CodeMirror( blocks.consoleEditor, {
			mode: 'javascript',
			theme: 'ractive',
			lineNumbers: true,
			lineWrapping: true,
			extraKeys: { 'Shift-Enter': executeConsole }
		});


		// find current tutorial, and step (if not tutorial 1, step 1)
		hashPattern = /#!\/([a-z\-]+)\/([0-9]+)/;
		parseHash = function () {
			var match = hashPattern.exec( window.location.hash );
			if ( match ) {
				tutorial = tutorialBySlug[ match[1] ];
				if ( tutorial ) {
					app.state.set({
						tutorialIndex: tutorial.index || 0,
						stepIndex: ( +match[2] - 1 ) || 0
					});
				}
			}
		};
		
		app.state.set( 'tutorials', app.data.tutorials );
		if ( window.location.hash ) {
			parseHash();
		} else {
			app.state.set({
				tutorialIndex: 0,
				stepIndex: 0
			});
		}

		window.addEventListener( 'hashchange', parseHash );
		

		app.state.compute({
			currentTutorial: '${tutorials}[ ${tutorialIndex } ]',
			currentStep: '${currentTutorial}.steps[ ${stepIndex} ]',
			nextStepDisabled: '${stepIndex} >= ( ${currentTutorial}.steps.length - 1 )',
			prevStepDisabled: '${stepIndex} === 0',
			nextTutorialDisabled: '${tutorialIndex} >= ( ${tutorials}.length - 1 )',
			prevTutorialDisabled: '${tutorialIndex} === 0'
		});

		app.state.observe({
			stepIndex: function ( index ) {
				var isFirst, isLast;

				isFirst = ( index === 0 );
				isLast = ( index === this.get( 'currentTutorial.steps.length' ) - 1 );

				mainView.set({
					stepNum: index + 1,
					// prevDisabled: ( isFirst ? 'disabled' : '' ),
					// nextDisabled: ( isLast ? 'disabled' : '' ),
					stepOrTutorial: ( isLast ? 'tutorial' : 'step' )
				});
			},
			nextStepDisabled: function ( disabled ) {
				mainView.set( 'nextDisabled', disabled ? 'disabled' : '' );
			},
			prevStepDisabled: function ( disabled ) {
				mainView.set( 'prevDisabled', disabled ? 'disabled' : '' );
			},
			nextTutorialDisabled: function ( disabled ) {
				mainView.set( 'nextTutorialDisabled', disabled ? 'disabled' : '' );
			},
			prevTutorialDisabled: function ( disabled ) {
				mainView.set( 'prevTutorialDisabled', disabled ? 'disabled' : '' );
			}
		});

		reset = function ( step ) {
			if ( !step ) {
				return;
			}

			// teardown any Ractive instances that have been created
			teardown();

			editors.template.setValue( step.template || '' );
			editors.javascript.setValue( step.javascript || '' );
			editors.console.setValue( step.console || '' );

			mainView.set({
				copy: step.copy,
				css: step.styles || app.state.get( 'currentTutorial.styles' ),
				fixDisabled: ( step.fixed ? '' : 'disabled' )
			});

			if ( step.init ) {
				executeJs();
			}

			prettyPrint();

			// update hash
			window.location.hash = '!/' + app.state.get( 'currentTutorial.slug' ) + '/' + ( app.state.get( 'stepIndex' ) + 1 );

			// scroll all blocks back to top - TODO
			blocks.copy.scrollTop = 0;
			blocks.output.scrollTop = 0;
			editors.template.scrollTo( 0, 0 );
			editors.javascript.scrollTo( 0, 0 );
			editors.console.scrollTo( 0, 0 );
		};

		app.state.observe( 'currentStep', reset );

		app.state.observe( 'tutorialIndex', function ( index ) {
			mainView.set( 'tutorialNum', index + 1 );
		});

		app.state.observe( 'currentTutorial', function ( tutorial ) {
			if ( !tutorial ) {
				return;
			}

			mainView.set({
				title: tutorial.title,
				numSteps: tutorial.steps.length
			});
		});



		mainView.on({
			'execute-js': executeJs,
			'execute-console': executeConsole,
			prev: function () {
				var currentStepIndex = app.state.get( 'stepIndex' );

				if ( currentStepIndex > 0 ) {
					app.state.set( 'stepIndex', currentStepIndex - 1 );
				}
			},
			next: function () {
				var currentStepIndex, numSteps, currentTutorialIndex, numTutorials;

				currentStepIndex = app.state.get( 'stepIndex' );
				numSteps = app.state.get( 'currentTutorial.steps.length' );

				if ( currentStepIndex < numSteps - 1 ) {
					app.state.set( 'stepIndex', currentStepIndex + 1 );
				}

				else {
					// advance to next tutorial
					currentTutorialIndex = app.state.get( 'tutorialIndex' );
					numTutorials = app.state.get( 'tutorials.length' );

					if ( currentTutorialIndex < numTutorials - 1 ) {
						app.state.set({
							tutorialIndex: currentTutorialIndex + 1,
							stepIndex: 0
						});
					}
				}
			},
			prevTutorial: function () {
				var currentTutorialIndex;

				currentTutorialIndex = app.state.get( 'tutorialIndex' );

				if ( currentTutorialIndex > 0 ) {
					app.state.set({
						tutorialIndex: currentTutorialIndex - 1,
						stepIndex: 0
					});
				}
			},
			nextTutorial: function () {
				var currentTutorialIndex;

				currentTutorialIndex = app.state.get( 'tutorialIndex' );

				if ( currentTutorialIndex < tutorials.length - 1 ) {
					app.state.set({
						tutorialIndex: currentTutorialIndex + 1,
						stepIndex: 0
					});
				}
			},
			fix: function () {
				var fixed, currentStep, currentTutorial;

				currentStep = app.state.get( 'currentStep' );

				fixed = currentStep.fixed;

				if ( !fixed ) {
					throw new Error( 'Missing completed code for this step' );
				}

				editors.template.setValue( fixed.template || currentStep.template || '' );
				editors.javascript.setValue( fixed.javascript || currentStep.javascript || '' );
				editors.console.setValue( fixed.console || currentStep.console || '' );

				executeJs();
			},
			reset: function () {
				reset( app.state.get( 'currentStep' ) );
			}
		});
	};

});
/*global define, window, document */

define('app',[ 'domReady', 'Statesman', 'data', 'controllers/main' ], function ( domReady, Statesman, data, main ) {

	'use strict';
	
	var app;

	app = {
		data: data,
		state: new Statesman()
	};

	domReady( function () {
		app.el = document.getElementById( 'container' );

		main( app );
	});


	window.app = app; // useful for debugging!

	return app;

});
/*global require */
(function () {

	'use strict';

	require.config({
		baseUrl: 'js',
		paths: {
			Ractive: 'lib/Ractive',
			Statesman: 'lib/Statesman',
			Divvy: 'lib/Divvy'
		},
		urlArgs: 'bust=' + Date.now()
	});

	require([ 'app' ]);

}());
define("main", function(){});
}());