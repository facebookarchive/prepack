self.importScripts('prepack.min.js');

onmessage = function(e) {
  var buffer = '';
  var originalError = console.error;
  var originalWarn = console.warn;

  function redirectOutput() {
    buffer += Array.from(arguments).join(' ') + '\n';
  }

  try {
    console.error = redirectOutput;
    console.warn = redirectOutput;

    var result = Prepack.prepack(e.data, {
      compatibility: 'browser',
      filename: 'repl',
      timeout: 1000,
      serialize: true,
    });
    if (result) {
      postMessage({type: 'success', data: result.code});
    } else {
      // A well-defined error occurred.
      postMessage({type: 'error', data: buffer});
    }
  } catch (err) {
    // Something went horribly wrong.
    var message = err.message;
    if (err instanceof Prepack.InitializationError) {
      message = '';
    }
    postMessage({type: 'error', data: buffer + message});
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
};
