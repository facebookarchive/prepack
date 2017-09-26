self.importScripts('prepack.min.js');

onmessage = function(e) {
  var buffer = [];

  function errorHandler(error) {
    // Syntax errors contain their location at the end, remove that
    if (error.errorCode === 'PP1004') {
      let msg = error.message;
      error.message = msg.substring(0, msg.lastIndexOf('('));
    }
    buffer.push({
      severity: error.severity,
      location: error.location,
      message: error.message,
      errorCode: error.errorCode,
    });
    return 'Recover';
  }

  try {
    var sources = [{ filePath: 'dummy', fileContents: e.data }];
    var result = Prepack.prepackSources(sources, {
      compatibility: 'browser',
      filename: 'repl',
      timeout: 1000,
      serialize: true,
      errorHandler,
    });
    if (result && !buffer.length) {
      postMessage({ type: 'success', data: result.code });
    } else {
      // A well-defined error occurred.
      postMessage({ type: 'error', data: buffer });
    }
  } catch (err) {
    postMessage({
      type: 'error',
      data: err.message || 'An unknown error occurred'
    });
  }
};
