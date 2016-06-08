define(function(require, exports, module) {
    var baseHandler = require("plugins/c9.ide.language/base_handler");
    var handler = module.exports = Object.create(baseHandler);
    var workerUtil = require("plugins/c9.ide.language/worker_util");
    
    
    handler.handlesLanguage = function(language) {
        return language === "javascript" || language === "jsx";
    };

    var path = require("plugins/c9.ide.language.javascript.infer/path");
    
    function callFlow(subcommand, filePath, docValue, callback, problemCallback) {
        var timeouted = false
        var finished = false
        setTimeout(function() {
            if (finished) return;
            timeouted = true;
            problemCallback("Flowtype is still initializing...");
        }, 3000)
        console.log("flow " + subcommand)
        var cmd = 'flow ' + subcommand.replace('%FILE', filePath.replace(/([^a-zA-Z0-9_\/~.-])/g, "\\$1"));
        if (docValue) {
            cmd = 'echo "'+docValue.replace(/([\\"$`])/g, "\\$1")+'" | ' + cmd
        }
        workerUtil.execFile("/bin/bash",
            {
                args: ['-c', cmd], 
                maxCallInterval: 50,
                cwd: require("path").dirname(filePath),
                timeout: 4000,
                semaphore: null, 
            },
            function(err, stdout, stderr) {
                if (timeouted) return;
                finished = true;
                console.log(stdout, stderr)
                if (!stdout && !stderr) return problemCallback("Flowtype is still analyzing...");
                if (err && err.code === 127) return problemCallback("No flow installed.");
                if (err && err.code === 12) return problemCallback("No .flowconfig in any parent directory.", "info");
                if (err && err.code !== 255 && err.code !== 2) { return problemCallback("Flow problem: " + err.message); }
                try {
                    stdout = JSON.parse(stdout)
                } catch (e) {
                }
                if ((typeof stdout === "string") || (typeof stdout === "undefined")) {
                    return problemCallback("Flow problem: " + (stdout || "") + stderr + ", exitcode: " + err.code);
                }
            
                callback(stdout)
            })
    }
    
    function getFilePath()  {
        var basePath = path.getBasePath(handler.path, handler.workspaceDir);
        var filePath = path.canonicalizePath(handler.path, basePath);
        if (filePath.startsWith("/")) filePath = handler.workspaceDir + filePath
        return filePath
    }
    
    handler.analyze = function(docValue, ast, callback) {
        console.log(workerUtil, handler);
        var filePath = getFilePath()
        
        var basename = require("path").basename(filePath)
        
        callFlow("check-contents --retry-if-init=false --json %FILE", filePath, docValue, function(stdout) {
            var markers = [];
            function isThisFile(m) { return m.path.endsWith(basename) } // TODO weak heuristics - possible false positives if filenames are the same
            stdout.errors.forEach(function(e) { 
                var message = e.message.map(function(m){
                    if (!isThisFile(m)) return m.descr + (m.path ? ("("+m.path+":"+m.line+")") : "");
                    return m.descr;
                }).join(": ");
                e.message.forEach(function(m) {
                    if (!isThisFile(m)) return // TODO weak heuristics - possible false positives if filenames are the same
                    markers.push({
                        pos: { sl: m.line - 1, el: m.endline - 1, sc: m.start - 1, ec: m.end },
                        level: e.level,
                        message: message,
                    })
                })
            })
            
            if (markers.length === 0) {
                markers.push({pos: { sl: 0 }, level: "info", message: "No errors."});
            }

            callback(markers);
        },  function(problem, level) {
            callback([{ pos: { sl: 0 }, message: problem, level: level || "error" }]);
        })
    };
    
    handler.complete = function(doc, ast, pos, options, callback) {
        callFlow("autocomplete --json %FILE " + (pos.row + 1) + " " + (pos.column + 1), getFilePath(), doc.getValue(), function(stdout) {
            callback(null, stdout.result.map(function(r) {
                return {
                    name: r.name + (r.func_details ? "()" : ""),
                    replaceText: r.name + (r.func_details ? (r.func_details.params.length ? "(^^)" : "()") : ""),
                    icon: (r.func_details ? "method" : "property") + (r.name.match(/^_/) ? "2" : ""),
                    meta: r.type,
                    doc: r.type,
                    guessTooltip: true,
                    isContextual: true,
                }
            }));
        }, function() {
            callback(Error("Flow is still initializing"))
        })
    };
    
    /*handler.getCompletionRegex = function() {
        return /^\.$/
    }*/
    
    /* TODO
    handler.tooltip = function(doc, ast, pos, options, callback) {
        callback({
        })
    };*/
    
    
    handler.jumpToDefinition = function(doc, ast, pos, options, callback) {
        var filePath = getFilePath()
        callFlow("get-def --json %FILE " + (pos.row + 1) + " " + (pos.column + 1), filePath, null, function(stdout) {
            if (!stdout.line && !stdout.path) return callback(null)
            if (stdout.path.endsWith(require("path").basename(filePath))) { // TODO weak heuristics
                stdout.path = ""
            }
            callback(null, {
                row: stdout.line - 1,
                column: stdout.start - 1,
                path: stdout.path
            });
        }, function(problem) {
            callback(Error(problem))
        })
    };
    
});
