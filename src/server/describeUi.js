jasmineui.define('server/describeUi', ['logger', 'server/jasmineApi', 'server/testwindow', 'server/waitsForAsync', 'remote!client/loadEventSupport', 'scriptAccessor', 'globals'], function (logger, jasmineApi, testwindow, waitsForAsync, loadEventSupportRemote, scriptAccessor, globals) {

    var currentBeforeLoadCallbacks;
    var uiTestScriptUrls = [];

    function addJasmineUiScriptUrl() {
        if (globals.jasmineui.scripturl) {
            uiTestScriptUrls.push(globals.jasmineui.scripturl);
        }
    }

    addJasmineUiScriptUrl();

    /**
     * Registers the current script as a utility script for ui tests.
     * The callback will only be executed on the client.
     * @param callback
     */
    function utilityScript(callback) {
        addCurrentScriptToTestWindow();
    }

    function addCurrentScriptToTestWindow() {
        scriptAccessor.afterCurrentScript(globals.document, function (url) {
            for (var i = 0; i < uiTestScriptUrls.length; i++) {
                if (uiTestScriptUrls[i] == url) {
                    return;
                }
            }
            uiTestScriptUrls.push(url);
        });
    }

    /**
     * Just like describe, but opens a window with the given url during the test.
     * Also needed for beforeLoad to work.
     * @param name
     * @param pageUrl
     * @param callback
     */
    function describeUi(name, pageUrl, callback) {
        addCurrentScriptToTestWindow();
        function execute() {
            var beforeLoadCallbacks = [];
            jasmineApi.beforeEach(function () {
                jasmineApi.runs(function () {
                    logger.log('Begin open url ' + pageUrl);
                    testwindow(pageUrl, uiTestScriptUrls, function (win) {
                        loadEventSupportRemote().addBeforeLoadListener(function () {
                            for (var i = 0; i < beforeLoadCallbacks.length; i++) {
                                beforeLoadCallbacks[i]();
                            }
                        });
                    });
                });
                waitsForAsync();
                jasmineApi.runs(function () {
                    logger.log('Finished open url ' + pageUrl);
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
        beforeLoad:beforeLoad,
        utilityScript:utilityScript
    }
});