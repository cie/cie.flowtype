define(function(require, exports, module) {
    main.consumes = ["language", "Plugin"];
    main.provides = ["flowtype"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var plugin = new Plugin("flowtype", main.consumes);
        var language = imports.language;

        plugin.on("load", function () {
            language.unregisterLanguageHandler("plugins/c9.ide.language.javascript.tern/worker/tern_worker");
            language.registerLanguageHandler("plugins/cie.flowtype/worker/flowtype_worker", function(err, handler) {
                if (err) { console.error(err) }
            });
        });
        plugin.on("unload", function () {
            language.unregisterLanguageHandler("plugins/cie.flowtype/worker/flowtype_worker");
        });
        register(null, { flowtype: plugin });
    }
});
