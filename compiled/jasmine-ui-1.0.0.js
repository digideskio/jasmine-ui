/**
 * Jasmine-Ui v1.0.0
 * http://github.com/tigbro/jquery-mobile-angular-adapter
 *
 * Copyright 2011, Tobias Bosch (OPITZ CONSULTING GmbH)
 * Licensed under the MIT license.
 */
(function() {
/**
 * Simple implementation of AMD require/define assuming all
 * modules are named and loaded explicitly, and require is called
 * after all needed modules have been loaded.
 */
var require, define;
(function (window) {

    if (typeof define !== "undefined") {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    var moduleDefs = [];

    define = function (name, deps, value) {
        var dotJs = name.indexOf('.js');
        if (dotJs !== -1) {
            name = name.substring(0, dotJs);
        }
        if (arguments.length == 2) {
            // No deps...
            value = deps;
            deps = [];
        }
        moduleDefs.push({
            name:name,
            deps:deps,
            value:value
        });
    };

    function findModuleDefinition(name) {
        for (var i = 0; i < moduleDefs.length; i++) {
            var mod = moduleDefs[i];
            if (mod.name == name) {
                return mod;
            }
        }
        throw new Error("Could not find the module " + name);
    }


    function factory(name, instanceCache) {
        if (!instanceCache) {
            instanceCache = {};
        }
        var mod = findModuleDefinition(name);
        if (!instanceCache[mod.name]) {
            var resolvedDeps = listFactory(mod.deps, instanceCache);
            var resolvedValue = mod.value;
            if (typeof mod.value === 'function') {
                resolvedValue = mod.value.apply(window, resolvedDeps);
            }
            instanceCache[name] = resolvedValue;
        }
        return instanceCache[name];
    }

    function listFactory(deps, instanceCache) {
        if (!instanceCache) {
            instanceCache = {};
        }
        var resolvedDeps = [];
        for (var i = 0; i < deps.length; i++) {
            resolvedDeps.push(factory(deps[i], instanceCache));
        }
        return resolvedDeps;
    }

    var instanceCache = {};

    require = function (deps, callback) {
        var resolvedDeps = listFactory(deps, instanceCache);
        if (typeof callback === 'function') {
            callback.apply(this, resolvedDeps);
        }
        return resolvedDeps;
    };

    require.factory = factory;

})(window);
define('scriptAccessor', function () {
    /**
     * Loops through the scripts of the current document and
     * calls a callback with their url.
     * @param urlCallback
     */
    function findScripts(document, urlCallback) {
        var scripts = document.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
            var script = scripts[i];
            if (script.src) {
                urlCallback(script.src);
            }
        }
    }

    function writeScriptWithUrl(document, url) {
        document.writeln('<script type="text/javascript" src="' + url + '"></script>');
    }

    function writeInlineScript(document, data) {
        document.writeln('<script type="text/javascript"">' + data + '</script>');
    }


    return {
        findScripts:findScripts,
        writeScriptWithUrl:writeScriptWithUrl,
        writeInlineScript:writeInlineScript
    }
});define('logger', function () {
    function log(msg) {
        if (enabled()) {
            console.log(msg);
        }
    }

    var _enabled;

    function enabled(value) {
        if (value === undefined) {
            return _enabled;
        } else {
            _enabled = value;
        }
    }

    return {
        log:log,
        enabled: enabled
    }

});define('server/asyncWaitServer', ['server/jasmineApi', 'logger', 'server/clientInvoker', 'server/testwindow'], function (jasmineApi, logger, clientInvoker, testwindow) {
    /**
     * Waits for the end of all aynchronous actions.
     * @param timeout
     */
    function waitsForAsync(arg) {
        var timeout
        var requireReload = false;
        if (typeof arg === 'number') {
            timeout = arg;
        } else if (typeof arg === 'object') {
            timeout = arg.timeout;
            requireReload = arg.requireReload;
        }
        var timeout = timeout || 5000;

        jasmineApi.runs(function () {
            if (requireReload) {
                testwindow.requireReload();
            }
            logger.log("begin async waiting");
        });
        // Wait at least 50 ms. Needed e.g.
        // for animations, as the animation start event is
        // not fired directly after the animation css is added.
        // There may also be a gap between changing the location hash
        // and the hashchange event (almost none however...).
        jasmineApi.waits(100);
        jasmineApi.waitsFor(
            function () {
                return clientInvoker.ready() && !clientInvoker.isWaitForAsync();
            }, "end of async work", timeout);
        jasmineApi.runs(function () {
            logger.log("end async waiting");
        });
    }

    return {
        waitsForAsync:waitsForAsync
    }
});/**
 * Invoker to access the testwindow from the server.
 */
define('server/clientInvoker', ['server/testwindow'], function (testwindow) {
    function client() {
        var win = testwindow.get();
        return win && win.jasmineuiclient;
    }

    function addBeforeLoadListener(listener) {
        client().addBeforeLoadListener(listener);
    }

    function isWaitForAsync() {
        return client().isWaitForAsync();
    }

    function executeSpecNode(nodePath) {
        return client().executeSpecNode(nodePath);
    }

    function ready() {
        return testwindow.ready() && !!client();
    }

    return {
        addBeforeLoadListener:addBeforeLoadListener,
        isWaitForAsync:isWaitForAsync,
        executeSpecNode:executeSpecNode,
        ready: ready
    }
});define('server/describeUi', ['server/jasmineApi', 'server/loadHtml', 'server/testwindow', 'server/asyncWaitServer'], function (jasmineApi, loadHtml, testwindow, asyncWait) {

    var currentBeforeLoadCallbacks;

    /**
     * Just like describe, but opens a window with the given url during the test.
     * Also needed for beforeLoad to work.
     * @param name
     * @param pageUrl
     * @param callback
     */
    function describeUi(name, pageUrl, callback) {
        function execute() {
            var beforeLoadCallbacks = [];
            jasmineApi.beforeEach(function () {
                jasmineApi.runs(function () {
                    loadHtml.execute(pageUrl, function () {
                        for (var i = 0; i < beforeLoadCallbacks.length; i++) {
                            beforeLoadCallbacks[i]();
                        }
                    });
                });

            });
            var oldCallbacks = currentBeforeLoadCallbacks;
            currentBeforeLoadCallbacks = beforeLoadCallbacks;
            callback();
            currentBeforeLoadCallbacks = oldCallbacks;
        }

        jasmineApi.describe(name, execute);
    }

    /**
     * Registers a callback that will be called right before the page loads
     * @param callback
     */
    function beforeLoad(callback) {
        if (!currentBeforeLoadCallbacks) {
            throw new Error("beforeLoad must be called inside of a describeUi statement!");
        }
        currentBeforeLoadCallbacks.push(callback);
    }

    return {
        describeUi:describeUi,
        beforeLoad:beforeLoad
    }
});define('server/jasmineApi', function () {
    /**
     * Save the original values, as we are overwriting them in some modules
     */
    return {
        beforeEach:window.beforeEach,
        afterEach: window.afterEach,
        describe:window.describe,
        runs:window.runs,
        it:window.it,
        waitsFor:window.waitsFor,
        waits:window.waits
    }
});define('server/loadHtml', ['logger', 'server/testwindow', 'server/jasmineApi', 'scriptAccessor', 'server/clientInvoker', 'server/asyncWaitServer'], function (logger, testwindow, jasmineApi, scriptAccessor, clientInvoker, asyncWaitServer) {

    /**
     * List of regex. Scripts form the current document that match one of these regex
     * will be injected into the testwindow be loadHtml.
     */
    var _injectScripts = [];

    function injectScripts(scripts) {
        if (!scripts) {
            return _injectScripts;
        } else {
            _injectScripts = scripts;
        }
    }

    /**
     * Loads the given url into the testwindow.
     * Injects the scripts form injectScripts.
     * Dynamically adds an additional beforeLoad eventListener to the frame.
     * Integrates with jasmine and waits until the page is fully loaded.
     * <p>
     * Requires the following line at the beginning of the loaded document:
     * <pre>
     * opener && opener.instrument && opener.instrument(window);
     * </pre>
     * @param url
     * @param beforeLoadCallback A callback that will be executed right before the load event of the page.
     */
    function execute(url, beforeLoadCallback) {
        jasmineApi.runs(function () {

            var scriptUrls = [];
            scriptAccessor.findScripts(document, function (url) {
                for (var i = 0; i < _injectScripts.length; i++) {
                    if (url.match(_injectScripts[i])) {
                        scriptUrls.push(url);
                    }
                }
            });

            window.instrument = function (fr) {
                logger.log("Begin instrumenting frame " + fr.name + " with url " + fr.location.href);
                for (var i = 0; i < scriptUrls.length; i++) {
                    scriptAccessor.writeScriptWithUrl(fr.document, scriptUrls[i]);
                }
                if (beforeLoadCallback) {
                    window.afterScriptInjection = function () {
                        clientInvoker.addBeforeLoadListener(beforeLoadCallback);
                        beforeLoadCallback = null;
                    };
                    scriptAccessor.writeInlineScript(fr.document, 'opener.afterScriptInjection();');
                }
            };
            testwindow.get(url);
        });
        asyncWaitServer.waitsForAsync();
        jasmineApi.runs(function () {
            logger.log("Successfully loaded url " + url);
        });
    }

    return {
        execute: execute,
        injectScripts: injectScripts
    };
});define('server/remoteSpecServer', ['server/jasmineApi', 'server/clientInvoker', 'server/describeUi', 'server/asyncWaitServer'], function (jasmineApi, client, originalDescribeUi, asyncWaitServer) {
    var currentNode;

    function Node(executeCallback) {
        this.executeCallback = executeCallback;
        this.children = {};
        this.childCount = 0;
        this.parent = null;
    }

    Node.prototype = {
        execute:function () {
            this.executed = true;
            var oldNode = currentNode;
            currentNode = this;
            try {
                return this.executeCallback();
            } finally {
                currentNode = oldNode;
            }
        },
        bindExecute:function () {
            var self = this;
            return function () {
                return self.execute();
            }
        },
        addChild:function (type, name, childNode) {
            if (!name) {
                name = '' + this.childCount;
            }
            this.childCount++;
            childNode.name = name;
            childNode.type = type;
            childNode.parent = this;
            this.children[name] = childNode;
        },
        child:function (childId) {
            return this.children[childId];
        },
        path:function () {
            if (this.parent == null) {
                // Ignore Root-Node in the path
                return [];
            } else {
                var res = this.parent.path();
                res.push(this.name);
                return res;
            }
        },
        inDescribeUi:function () {
            if (this.describeUi) {
                return true;
            }
            if (this.parent) {
                return this.parent.inDescribeUi();
            }
            return false;
        },
        toString:function () {
            if (this.parent == null) {
                return [];
            } else {
                var res = this.parent.toString();
                res.push(this.type + ':' + this.name);
                return res;
            }
        }
    };

    var rootNode = new Node(function () {
    });
    currentNode = rootNode;

    function addServerExecutingNode(type, name, callback) {
        var node = new Node(callback);
        currentNode.addChild(type, name, node);
        return node;
    }

    function describe(name, callback) {
        var node = addServerExecutingNode('describe', name, callback);
        jasmineApi.describe(name, node.bindExecute());
    }

    function describeUi(name, pageUrl, callback) {
        var node = addServerExecutingNode('describe', name, callback);
        node.describeUi = true;
        originalDescribeUi.describeUi(name, pageUrl, node.bindExecute());
    }

    function addClientExecutingNode(type, name) {
        var node = new Node(function () {
            return client.executeSpecNode(node.path());
        });
        currentNode.addChild(type, name, node);
        return node;
    }

    function it(name, callback) {
        if (currentNode.inDescribeUi()) {
            callback = addClientExecutingNode('it', name).bindExecute();
        }
        jasmineApi.it(name, callback);
    }

    function beforeEach(callback) {
        if (currentNode.inDescribeUi()) {
            callback = addClientExecutingNode('beforeEach').bindExecute();
        }
        jasmineApi.beforeEach(callback);
    }

    function afterEach(callback) {
        if (currentNode.inDescribeUi()) {
            callback = addClientExecutingNode('afterEach').bindExecute();
        }
        jasmineApi.afterEach(callback);
    }

    function beforeLoad(callback) {
        originalDescribeUi.beforeLoad(addClientExecutingNode('beforeLoad', undefined).bindExecute());
    }


    /**
     * For runs, waitsFor and waits we create the nodes triggered by the testwindow.
     * This is needed as we do not want to execute it, beforeEach and afterEach
     * on the server (which can contain the runs, ... statements).
     * <p>
     * This will be called from the testwindow!
     */
    function addClientDefinedNode(type, name, extraArgs) {
        var node = currentNode.child(name);
        if (!node) {
            node = addClientExecutingNode(type, name);
        }
        extraArgs = extraArgs || [];
        if (type === 'runs') {
            jasmineApi.runs(node.bindExecute());
        } else if (type === 'waitsFor') {
            extraArgs.unshift(node.bindExecute());
            jasmineApi.waitsFor.apply(this, extraArgs);
        } else if (type === 'waits') {
            jasmineApi.waits.apply(this, extraArgs);
        } else if (type === 'waitsForAsync') {
            asyncWaitServer.waitsForAsync.apply(this, extraArgs);
        }
    }

    return {
        it:it,
        beforeEach:beforeEach,
        afterEach:afterEach,
        beforeLoad:beforeLoad,
        describe:describe,
        describeUi:describeUi,
        addClientDefinedSpecNode:addClientDefinedNode
    }
});define('server/testwindow', function () {
    function splitAtHash(url) {
        var hashPos = url.indexOf('#');
        if (hashPos != -1) {
            return [url.substring(0, hashPos), url.substring(hashPos + 1)];
        } else {
            return [url, ''];
        }
    }

    var testwindow;
    var requireReloadFlag = 'testwindow#requiresReload';

    /**
     * testwindow(url): This function is able to create a testframe
     * with a given url.
     */
    function get(url) {
        if (arguments.length > 0) {
            if (!url.charAt(0) == '/') {
                throw new Error("the url for the testframe needs to be absolute!");
            }
            if (!testwindow) {
                testwindow = window.open(url, 'jasmineui');
            } else {
                // Set a flag to detect whether the
                // window is currently in a reload cycle.
                requireReload();
            }
            var oldPath = testwindow.location.pathname;
            // if only the hash changes, the
            // page will not reload by assigning the href but only
            // change the hashpath.
            // So detect this and do a manual reload.
            var urlSplitAtHash = splitAtHash(url);
            if (oldPath === urlSplitAtHash[0]) {
                testwindow.location.hash = urlSplitAtHash[1];
                testwindow.location.reload();
            } else {
                testwindow.location.href = url;
            }
        }
        return testwindow;
    }

    function requireReload() {
        get()[requireReloadFlag] = true;
    }

    function inReload() {
        return get() && get()[requireReloadFlag];
    }

    function ready() {
        return !!get() && !inReload();
    }

    return {
        get:get,
        requireReload:requireReload,
        ready:ready
    };

});define('client/remoteSpecClient', ['client/serverInvoker'], function (serverInvoker) {
    var currentNode;

    function Node(executeCallback) {
        this.executeCallback = executeCallback;
        this.children = {};
        this.childCount = 0;
        this.parent = null;
    }

    Node.prototype = {
        execute:function () {
            this.executed = true;
            var oldNode = currentNode;
            currentNode = this;
            try {
                return this.executeCallback();
            } finally {
                currentNode = oldNode;
            }
        },
        addChild:function (type, name, childNode) {
            if (!name) {
                name = '' + this.childCount;
            }
            this.childCount++;
            childNode.name = name;
            childNode.type = type;
            childNode.parent = this;
            this.children[name] = childNode;
        },
        child:function (childId) {
            if (!this.executed) {
                this.execute();
            }
            return this.children[childId];
        },
        findChild:function (childPath) {
            if (childPath.length === 0) {
                return this;
            }
            var childId = childPath.shift();
            var child = this.child(childId);
            if (!child) {
                throw new Error("Cannot find child " + childId + " in " + this.toString());
            }
            return child.findChild(childPath);
        },
        path:function () {
            if (this.parent == null) {
                // Ignore Root-Node in the path
                return [];
            } else {
                var res = this.parent.path();
                res.push(this.name);
                return res;
            }
        },
        toString:function () {
            if (this.parent == null) {
                return [];
            } else {
                var res = this.parent.toString();
                res.push(this.type + ':' + this.name);
                return res;
            }
        }
    };

    var rootNode = new Node(function () {
    });
    currentNode = rootNode;
    var currentExecuteNode;

    function addNode(type, name, callback) {
        var node = new Node(callback);
        currentNode.addChild(type, name, node);
        return node;
    }

    var beforeLoad = function (callback) {
        addNode('beforeLoad', null, callback);
    };

    var describeUi = function (name, pageUrl, callback) {
        addNode('describe', name, callback);
    };

    var describe = function (name, callback) {
        addNode('describe', name, callback);
    };

    var it = function (name, callback) {
        addNode('it', name, callback);
    };

    var beforeEach = function (callback) {
        addNode('beforeEach', null, callback);
    };

    var afterEach = function (callback) {
        addNode('afterEach', null, callback);
    };

    function addLocallyDefinedNode(type, name, callback, extraArgs) {
        var node = addNode(type, name, callback);
        // Only add a node like runs, waitsFor, ... if the server called us
        // first for the parent node. This is important if
        // we have a page reload within an "it" statement:
        // The server then already knows about all required runs from the
        // first testwindow!
        if (currentNode == currentExecuteNode) {
            serverInvoker.addClientDefinedSpecNode(type, node.name, extraArgs);
        }
    }

    var runs = function (callback) {
        addLocallyDefinedNode('runs', undefined, callback);
    };

    var waitsFor = function (callback, timeout) {
        addLocallyDefinedNode('waitsFor', undefined, callback, [timeout]);
    };

    var waits = function (timeout) {
        addLocallyDefinedNode('waits', undefined, function () {
        }, [timeout]);
    };

    var waitsForAsync = function (timeout) {
        addLocallyDefinedNode('waitsForAsync', undefined, function () {
        }, [timeout]);
    };

    var executeSpecNode = function (nodePath) {
        var oldNode = currentExecuteNode;
        currentExecuteNode = rootNode.findChild(nodePath);
        try {
            return currentExecuteNode.execute();
        } finally {
            oldNode = currentExecuteNode;
        }
    };
    return {
        describe:describe,
        describeUi:describeUi,
        it:it,
        beforeEach:beforeEach,
        afterEach:afterEach,
        beforeLoad:beforeLoad,
        runs:runs,
        waitsFor:waitsFor,
        waits:waits,
        waitsForAsync:waitsForAsync,
        executeSpecNode:executeSpecNode
    }
});define('client/serverInvoker', [], function () {

    function addClientDefinedSpecNode(type, name, extraArgs) {
        window.opener.jasmineuiserver.addClientDefinedSpecNode(type, name, extraArgs);
    }

    function onScriptError(event) {
        opener.jasmine.getEnv().currentSpec.fail("Error from testwindow: " + event.message);
    }

    return {
        addClientDefinedSpecNode:addClientDefinedSpecNode,
        onScriptError: onScriptError
    };
});define('client/asyncWaitClient', ['logger', 'eventListener'], function (logger, eventListener) {
    /**
     * Module for waiting for the end of asynchronous actions.
     */
    var asyncWaitHandlers = {};

    /**
     * Adds a handler to the async wait functionality.
     * A handler is a function that returns whether asynchronous work is going on.
     *
     * @param name
     * @param handler Function that returns true/false.
     */
    function addAsyncWaitHandler(name, handler) {
        asyncWaitHandlers[name] = handler;
    }

    function isWaitForAsync() {
        var handlers = asyncWaitHandlers;
        for (var name in handlers) {
            if (handlers[name]()) {
                logger.log("async waiting for " + name);
                return true;
            }
        }
        if (window.jQuery) {
            if (!window.jQuery.isReady) {
                logger.log("async waiting for jquery ready");
                return true;
            }
        }
        logger.log("end waiting for async");
        return false;
    }

    /**
     * Adds an async wait handler for the load event
     */
    var loadListeners = [];
    (function () {
        var loadEventFired = false;
        addAsyncWaitHandler('loading', function () {
            return !loadEventFired;
        });

        eventListener.addBeforeLoadListener(function () {
            loadEventFired = true;
        });
    })();

    /**
     * Adds an async wait handler for the window.setTimeout function.
     */
    (function () {
        var timeouts = {};
        if (!window.oldTimeout) {
            window.oldTimeout = window.setTimeout;
        }
        window.setTimeout = function (fn, time) {
            logger.log("setTimeout called");
            var handle;
            var callback = function () {
                delete timeouts[handle];
                logger.log("timed out");
                if (typeof fn == 'string') {
                    eval(fn);
                } else {
                    fn();
                }
            };
            handle = window.oldTimeout(callback, time);
            timeouts[handle] = true;
            return handle;
        };

        window.oldClearTimeout = window.clearTimeout;
        window.clearTimeout = function (code) {
            logger.log("clearTimeout called");
            window.oldClearTimeout(code);
            delete timeouts[code];
        };
        addAsyncWaitHandler('timeout', function () {
            var count = 0;
            for (var x in timeouts) {
                count++;
            }
            return count != 0;
        });
    })();

    /**
     * Adds an async wait handler for the window.setInterval function.
     */
    (function () {
        var intervals = {};
        window.oldSetInterval = window.setInterval;
        window.setInterval = function (fn, time) {
            logger.log("setInterval called");
            var callback = function () {
                if (typeof fn == 'string') {
                    eval(fn);
                } else {
                    fn();
                }
            };
            var res = window.oldSetInterval(callback, time);
            intervals[res] = 'true';
            return res;
        };

        window.oldClearInterval = window.clearInterval;
        window.clearInterval = function (code) {
            logger.log("clearInterval called");
            window.oldClearInterval(code);
            delete intervals[code];
        };
        // return a function that allows to check
        // if an interval is running...
        addAsyncWaitHandler('interval', function () {
            var count = 0;
            for (var x in intervals) {
                count++;
            }
            return count != 0;
        });
    })();

    /**
     * Adds an async wait handler for the window.XMLHttpRequest.
     */
    (function () {
        var jasmineWindow = window;
        var copyStateFields = ['readyState', 'responseText', 'responseXML', 'status', 'statusText'];
        var proxyMethods = ['abort', 'getAllResponseHeaders', 'getResponseHader', 'open', 'send', 'setRequestHeader'];

        var oldXHR = window.XMLHttpRequest;
        window.openCallCount = 0;
        var DONE = 4;
        var newXhr = function () {
            var self = this;
            this.origin = new oldXHR();

            function copyState() {
                for (var i = 0; i < copyStateFields.length; i++) {
                    var field = copyStateFields[i];
                    try {
                        self[field] = self.origin[field];
                    } catch (_) {
                    }
                }
            }

            function proxyMethod(name) {
                self[name] = function () {
                    if (name == 'send') {
                        window.openCallCount++;
                    }
                    var res = self.origin[name].apply(self.origin, arguments);
                    copyState();
                    return res;
                }
            }

            for (var i = 0; i < proxyMethods.length; i++) {
                proxyMethod(proxyMethods[i]);
            }
            this.origin.onreadystatechange = function () {
                if (self.origin.readyState == DONE) {
                    window.openCallCount--;
                }
                copyState();
                if (self.onreadystatechange) {
                    self.onreadystatechange.apply(self.origin, arguments);
                }
            };
            copyState();
        };
        window.XMLHttpRequest = newXhr;

        addAsyncWaitHandler('xhr',
            function () {
                return window.openCallCount != 0;
            });
    })();

    /**
     * Adds an async wait handler for the webkitAnimationStart and webkitAnimationEnd events.
     * Note: The animationStart event is usually fired some time
     * after the animation was added to the css of an element (approx 50ms).
     * So be sure to always wait at least that time!
     */
    (function () {
        eventListener.addBeforeLoadListener(function () {
            if (!(window.$ && window.$.fn && window.$.fn.animationComplete)) {
                return;
            }
            var oldFn = window.$.fn.animationComplete;
            window.animationCount = 0;
            window.$.fn.animationComplete = function (callback) {
                window.animationCount++;
                return oldFn.call(this, function () {
                    window.animationCount--;
                    return callback.apply(this, arguments);
                });
            };
            addAsyncWaitHandler('WebkitAnimation',
                function () {
                    return window.animationCount != 0;
                });

        });

    })();

    /**
     * Adds an async wait handler for the webkitTransitionStart and webkitTransitionEnd events.
     * Note: The transitionStart event is usually fired some time
     * after the animation was added to the css of an element (approx 50ms).
     * So be sure to always wait at least that time!
     */
    (function () {
        eventListener.addBeforeLoadListener(function () {
            if (!(window.$ && window.$.fn && window.$.fn.animationComplete)) {
                return;
            }
            window.transitionCount = 0;

            var oldFn = window.$.fn.transitionComplete;
            window.$.fn.transitionComplete = function (callback) {
                window.transitionCount++;
                return oldFn.call(this, function () {
                    window.transitionCount--;
                    return callback.apply(this, arguments);
                });
            };
            addAsyncWaitHandler('WebkitTransition',
                function () {
                    return window.transitionCount != 0;
                });

        });
    })();

    return {
        isWaitForAsync:isWaitForAsync,
        addAsyncWaitHandler:addAsyncWaitHandler
    }
});define('client/errorHandler', ['eventListener', 'client/serverInvoker'], function (eventListener, serverInvoker) {
    /**
     * Error listener in the opened window to make the spec fail on errors.
     */
    eventListener.addEventListener(window, 'error', serverInvoker.onScriptError);
});define('simulateEvent', function () {
    /**
     * Functions to simulate events.
     * Based upon https://github.com/jquery/jquery-ui/blob/master/tests/jquery.simulate.js
     * Can also handle elements from different frames.
     * <p>
     * Provides:
     * simulate(el, type, options)
     */
    function simulate(el, type, options) {
        options = extend({}, simulate.defaults, options || {});
        var document = el.ownerDocument;
        simulateEvent(document, el, type, options);
    }

    function extend(target) {
        for (var i = 1; i < arguments.length; i++) {
            var obj = arguments[i];
            for (var key in obj) {
                target[key] = obj[key];
            }
        }
        return target;
    }

    function simulateEvent(document, el, type, options) {
        var evt = createEvent(document, type, options);
        dispatchEvent(el, type, evt);
        return evt;
    }

    function createEvent(document, type, options) {
        if (/^mouse(over|out|down|up|move)|(dbl)?click$/.test(type)) {
            return mouseEvent(document, type, options);
        } else if (/^key(up|down|press)$/.test(type)) {
            return keyboardEvent(document, type, options);
        } else {
            return otherEvent(document, type, options);
        }
    }

    function mouseEvent(document, type, options) {
        var evt;
        var e = extend({
            bubbles:true, cancelable:(type != "mousemove"), detail:0,
            screenX:0, screenY:0, clientX:0, clientY:0,
            ctrlKey:false, altKey:false, shiftKey:false, metaKey:false,
            button:0, relatedTarget:undefined
        }, options);

        var relatedTarget = e.relatedTarget;

        if (typeof document.createEvent == 'function') {
            evt = document.createEvent("MouseEvents");
            evt.initMouseEvent(type, e.bubbles, e.cancelable, e.view, e.detail,
                e.screenX, e.screenY, e.clientX, e.clientY,
                e.ctrlKey, e.altKey, e.shiftKey, e.metaKey,
                e.button, e.relatedTarget || document.body.parentNode);
        } else if (document.createEventObject) {
            evt = document.createEventObject();
            extend(evt, e);
            evt.button = { 0:1, 1:4, 2:2 }[evt.button] || evt.button;
        }
        return evt;
    }

    function keyboardEvent(document, type, options) {
        var evt;

        var e = extend({ bubbles:true, cancelable:true,
            ctrlKey:false, altKey:false, shiftKey:false, metaKey:false,
            keyCode:0, charCode:0
        }, options);

        if (typeof document.createEvent == 'function') {
            try {
                evt = document.createEvent("KeyEvents");
                evt.initKeyEvent(type, e.bubbles, e.cancelable, e.view,
                    e.ctrlKey, e.altKey, e.shiftKey, e.metaKey,
                    e.keyCode, e.charCode);
            } catch (err) {
                evt = document.createEvent("Events");
                evt.initEvent(type, e.bubbles, e.cancelable);
                extend(evt, { view:e.view,
                    ctrlKey:e.ctrlKey, altKey:e.altKey, shiftKey:e.shiftKey, metaKey:e.metaKey,
                    keyCode:e.keyCode, charCode:e.charCode
                });
            }
        } else if (document.createEventObject) {
            evt = document.createEventObject();
            extend(evt, e);
        }
        return evt;
    }

    function otherEvent(document, type, options) {
        var evt;

        var e = extend({ bubbles:true, cancelable:true
        }, options);

        if (typeof document.createEvent == 'function') {
            evt = document.createEvent("Events");
            evt.initEvent(type, e.bubbles, e.cancelable);
        } else if (document.createEventObject) {
            evt = document.createEventObject();
            extend(evt, e);
        }
        return evt;
    }

    function dispatchEvent(el, type, evt) {
        if (el.dispatchEvent) {
            el.dispatchEvent(evt);
        } else if (el.fireEvent) {
            el.fireEvent('on' + type, evt);
        }
        return evt;
    }

    extend(simulate, {
        defaults:{
            speed:'sync'
        },
        VK_TAB:9,
        VK_ENTER:13,
        VK_ESC:27,
        VK_PGUP:33,
        VK_PGDN:34,
        VK_END:35,
        VK_HOME:36,
        VK_LEFT:37,
        VK_UP:38,
        VK_RIGHT:39,
        VK_DOWN:40
    });

    return simulate;

});define('eventListener', function () {
    function addEventListener(node, event, callback) {
        if (node.addEventListener) {
            node.addEventListener(event, callback, false);
        } else {
            node.attachEvent("on" + event, callback);
        }
    }

    var beforeLoadListeners = [];
    /**
     * Adds a listener for the beforeLoad-Event that will be called every time a new url is loaded
     * @param callback
     */
    var addBeforeLoadListener = function (callback) {
        beforeLoadListeners.push(callback);
    };

    var beforeLoadEventFired = false;

    function callBeforeLoadListeners() {
        beforeLoadEventFired = true;
        var name, listeners, fn;
        listeners = beforeLoadListeners;
        for (name in listeners) {
            fn = listeners[name];
            fn(window);
        }
    }

    function proxyAddEventFunction(baseObject, fnname, eventProxyMap) {
        var oldFnname = 'old' + fnname;
        baseObject[oldFnname] = baseObject[fnname];
        baseObject[fnname] = function () {
            var event = arguments[0];
            var callback = arguments[1];
            var newCallback = callback;
            var proxyCallback = eventProxyMap[event];
            if (proxyCallback) {
                newCallback = function () {
                    proxyCallback.apply(this, arguments);
                    return callback.apply(this, arguments);
                }
            }
            arguments[1] = newCallback;
            return baseObject[oldFnname].apply(this, arguments);
        }
    }

    function addLoadEventListenerToWindow() {
        if (window.beforeLoadSupport) {
            return;
        }
        window.beforeLoadSupport = true;

        var loadCallbackCalled = false;

        function loadCallback() {
            if (loadCallbackCalled) {
                return;
            }
            loadCallbackCalled = true;
            if (!window.require) {
                callBeforeLoadListeners();
                return;
            }
            /*
             * When using require.js, and all libs are in one file,
             * we might not be able to intercept the point in time
             * when everything is loaded, but the ready signal was not yet sent.
             */
            var require = window.require;
            if (require.resourcesDone) {
                callBeforeLoadListeners();
            } else {
                var oldResourcesReady = require.resourcesReady;
                require.resourcesReady = function (ready) {
                    if (ready) {
                        callBeforeLoadListeners();
                    }
                    return oldResourcesReady.apply(this, arguments);
                };
            }
            return true;
        }

        // Mozilla, Opera and webkit nightlies currently support this event
        if (document.addEventListener) {
            // Be sure that our handler gets called before any
            // other handler of the instrumented page!
            proxyAddEventFunction(document, 'addEventListener', {'DOMContentLoaded':loadCallback});
            proxyAddEventFunction(window, 'addEventListener', {'load':loadCallback});

        } else if (document.attachEvent) {
            // If IE event model is used
            // Be sure that our handler gets called before any
            // other handler of the instrumented page!
            proxyAddEventFunction(document, 'attachEvent', {'onreadystatechange':loadCallback});
            proxyAddEventFunction(window, 'attachEvent', {'load':loadCallback});
        }
        // A fallback to window.onload, that will always work
        addEventListener(window, 'load', loadCallback);
    }

    addLoadEventListenerToWindow();

    return {
        addEventListener:addEventListener,
        addBeforeLoadListener:addBeforeLoadListener
    }
});var logEnabled = true;

if (opener && opener.jasmineuiserver) {
    require(['logger', 'client/asyncWaitClient', 'client/remoteSpecClient', 'eventListener', 'simulateEvent', 'client/errorHandler'], function (logger, asyncWaitClient, remoteSpecClient, eventListener, simulate) {
        logger.enabled(logEnabled);
        window.xdescribe = function () {
        };
        window.xdescribeUi = function () {
        };
        window.xit = function () {
        };
        window.expect = opener.expect;
        window.jasmine = opener.jasmine;
        window.spyOn = opener.spyOn;

        window.describe = remoteSpecClient.describe;
        window.describeUi = remoteSpecClient.describeUi;
        window.it = remoteSpecClient.it;
        window.beforeEach = remoteSpecClient.beforeEach;
        window.afterEach = remoteSpecClient.afterEach;
        window.beforeLoad = remoteSpecClient.beforeLoad;
        window.runs = remoteSpecClient.runs;
        window.waitsFor = remoteSpecClient.waitsFor;
        window.waits = remoteSpecClient.waits;
        window.waitsForAsync = remoteSpecClient.waitsForAsync;
        window.jasmineuiclient = {
            executeSpecNode:remoteSpecClient.executeSpecNode,
            isWaitForAsync:asyncWaitClient.isWaitForAsync,
            addBeforeLoadListener:eventListener.addBeforeLoadListener
        };
        window.simulate = simulate;

    });


} else {
    require(['server/remoteSpecServer', 'server/loadHtml', 'logger', 'server/testwindow'], function (remoteSpecServer, loadHtml, logger, testwindow) {
        logger.enabled(logEnabled);

        loadHtml.injectScripts([
            'jasmine-ui[^/]*$', 'UiSpec[^/]*$', 'UiHelper[^/]*$' ]);

        window.it = remoteSpecServer.it;
        window.beforeEach = remoteSpecServer.beforeEach;
        window.afterEach = remoteSpecServer.afterEach;
        window.beforeLoad = remoteSpecServer.beforeLoad;
        window.describeUi = remoteSpecServer.describeUi;
        window.describe = remoteSpecServer.describe;
        window.xdescribeUi = window.xdescribe;

        window.jasmineuiserver = {
            addClientDefinedSpecNode:remoteSpecServer.addClientDefinedSpecNode
        };
    });
}})();