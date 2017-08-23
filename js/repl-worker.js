self.importScripts('prepack.min.js');

onmessage = function(e) {
  var buffer = [];

  function errorHandler(error) {
    buffer.push({
      severity: error.severity,
      location: error.location,
      message: error.message,
      errorCode: error.errorCode,
    });
    return error.severity === 'FatalError' ? 'Fail' : 'Recover';
  }

  try {
    var sources = [{ filePath: '', fileContents: e.data }];
    var result = Prepack.prepackSources(sources, {
      compatibility: 'browser',
      filename: 'repl',
      timeout: 1000,
      serialize: true,
      errorHandler,
    });
    if (result) {
      postMessage({ type: 'success', data: result.code });
    } else {
      // A well-defined error occurred.
      //postMessage({ type: 'error', data: buffer });
      postMessage({ type: 'error', data: ['one', 'two'] });
    }
  } catch (err) {
    var data;
    if (err.message.startsWith('A fatal error occurred')) {
      data = buffer;
    } else {
      // Something went horribly wrong.
      var message = err.message;
      data = message;
    }
    postMessage({ type: 'error', data });
  }
};
