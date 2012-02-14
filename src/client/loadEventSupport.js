jasmineui.define('client/loadEventSupport', ['globals'], function (globals) {
    var window = globals.window;
    var document = globals.document;

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

    /**
     * We use a capturing event listener to be the first to get the event.
     * jQuery, ... always use non capturing event listeners...
     */
    document.addEventListener('DOMContentLoaded', loadCallback, true);

    function loadCallback() {
        /*
         * When using a script loader,
         * the document might be ready, but not the modules.
         */
        if (scriptLoaderIsReady()) {
            callBeforeLoadListeners();
        } else {
            setScriptLoaderBeforeLoadEvent(callBeforeLoadListeners);
        }
        return true;
    }

    /**
     * Must not be called before the load event of the document!
     */
    function scriptLoaderIsReady() {
        if (window.require) {
            return window.require.resourcesDone;
        }
        return true;
    }

    function setScriptLoaderBeforeLoadEvent(listener) {
        var oldResourcesReady = window.require.resourcesReady;
        window.require.resourcesReady = function (ready) {
            if (ready) {
                listener();
            }
            return oldResourcesReady.apply(this, arguments);
        };
    }

    function loaded() {
        var docReady = document.readyState == 'complete';
        if (docReady) {
            return scriptLoaderIsReady();
        }
        return docReady;
    }

    return {
        addBeforeLoadListener:addBeforeLoadListener,
        loaded:loaded
    }
});