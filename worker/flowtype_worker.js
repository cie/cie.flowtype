define(function(require, exports, module) {
    var baseHandler = require("plugins/c9.ide.language/base_handler");
    var handler = module.exports = Object.create(baseHandler);
    var workerUtil = require("plugins/c9.ide.language/worker_util");
    
    
    handler.handlesLanguage = function(language) {
        return language === "javascript" || language === "jsx";
    };

    var path = require("plugins/c9.ide.language.javascript.infer/path");
    
    handler.analyze = function(docValue, ast, callback) {
        console.log(workerUtil, handler);
        var basePath = path.getBasePath(handler.path, handler.workspaceDir);
        var filePath = path.canonicalizePath(handler.path, basePath);
        if (filePath.startsWith("/")) filePath = handler.workspaceDir + filePath
        
        var basename = require("path").basename(filePath)
        
        var timeouted = false
        var finished = false
        setTimeout(function() {
            if (finished) return;
            timeouted = true;
            callback([{ pos: { sl: 0 }, message: "Flowtype is still initializing...", level: "error" }]);
        }, 3000)
        
        workerUtil.execAnalysis(
            "bash",
            {
                mode: "stdin",
                args: ['-c', 'flow check-contents --retry-if-init=false --json ' + filePath.replace(/([^a-zA-Z0-9_\/~.-])/g, "\\$1")], 
                maxCallInterval: 1200,
                timeout: 4000,
                semaphore: null, 
            },
            function(err, stdout, stderr) {
                if (timeouted) return;
                finished = true;
                console.log(stdout, stderr)
                if (!stdout && !stderr) return callback([{ pos: { sl: 0 }, message: "Flowtype is still analyzing...", level: "error" }]); // no flow installed
                if (err && err.code === 127) return callback([{ pos: { sl: 0 }, message: "No flow installed.", level: "error" }]); // no flow installed
                if (err && err.code === 12) return callback([{ pos: { sl: 0 }, message: "No .flowconfig in any parent directory.", level: "info" }]); // no .flowconfig
                
                if (err && err.code !== 255 && err.code !== 2) {
                    return callback([{ pos: { sl: 0 }, message: "Flow problem: " + err.message, level: "error" }]);
                }
    
                // Parse each line of output and create marker objects
                if (typeof stdout === "string") return callback([{ pos: { sl: 0 }, message: "Flow problem: " + stdout + stderr, level: "error" }]);
                
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
                /*(stdout + stderr).split("\n").forEach(function parseLine(line) {
                    console.log(line)
                    var match = line.match(/(hello) (\d+)/);
                    if (!match)
                        return;
                    var message = match[1];
                    var row = match[2];
                    
                    markers.push({
                        pos: { sl: parseInt(row, 10) - 1, sc: 3, ec: 9 },
                        message: message,
                        level: message.match(/error/) ? "error": "warning"
                    });
                });*/
                
                if (markers.length === 0) {
                    markers.push({pos: { sl: 0 }, level: "info", message: "No errors."});
                }
    
                callback(markers);
            }
        );
    };
    
});
