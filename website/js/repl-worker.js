self.importScripts('prepack.min.js');

function onlyWarnings(buffer) {
  return buffer.every(function(error) {
    return error.severity === "Warning" || error.severity === "Information";
  });
}

onmessage = function(e) {
  let buffer = [];

  function errorHandler(error) {
    // Syntax errors contain their location at the end, remove that
    if (error.errorCode === "PP1004") {
      let msg = error.message;
      error.message = msg.substring(0, msg.lastIndexOf("("));
    }
    buffer.push({
      severity: error.severity,
      location: error.location,
      message: error.message,
      errorCode: error.errorCode,
    });
    return "Recover";
  }

  try {
    let sources = [{ filePath: "dummy", fileContents: e.data.code }];
    let options = {
      compatibility: "browser",
      filename: "repl",
      timeout: 1000,
      serialize: true,
      heapGraphFormat: "VISJS",
      errorHandler,
    };
    for (let property in e.data.options) {
      if (e.data.options.hasOwnProperty(property)) {
        options[property] = e.data.options[property];
      }
    }

    let result = Prepack.prepackSources(sources, options);
    let noErrors = onlyWarnings(buffer);
    if (result && noErrors) {
      postMessage({ type: 'success', data: result.code, graph: result.heapGraph, messages: buffer });
    } else {
      // A well-defined error occurred.
      postMessage({ type: 'error', data: buffer });
    }
  } catch (err) {
    buffer.push({
      message: err.stack || 'An unknown error occurred'
    });
    postMessage({ type: 'error', data: buffer });
  }
};
