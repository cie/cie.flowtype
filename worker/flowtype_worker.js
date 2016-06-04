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
        
        workerUtil.execAnalysis(
            "bash",
            {
                mode: "stdin",
                args: ['-c', 'flow check-contents --json ' + filePath.replace(/([^a-zA-Z0-9_\/~.-])/g, "\\$1")], 
                maxCallInterval: 1200,
            },
            function(err, stdout, stderr) {
                console.log(stdout, stderr)
                if (err && err.code === 127) return callback([]); // no flow installed
                if (err && err.code === 12) return callback([]); // no .flowconfig
                
                if (err && err.code !== 255 && err.code !== 2) {
                    console.error(err);
                    return callback(err);
                }
    
                // Parse each line of output and create marker objects
                if (typeof stdout === "string") return callback(new Error("No JSON outputted from `flow --json`"));
                
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
                
    
                callback(markers);
            }
        );
    };
    
});
