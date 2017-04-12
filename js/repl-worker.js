self.importScripts('prepack.min.js');

onmessage = function(e) {
  var buffer = '';
  var originError = console.error;
  var originalWarn = console.warn;

  function redirectOutput() {
    buffer += Array.from(arguments).join(' ') + '\n';
  }

  try {
    console.error = redirectOutput;
    console.warn = redirectOutput;

    var result = new prepack.default(
      {
        partial: true,
        timeout: 1000, // 1s
        compatibility: 'browser'
      },
      false
    ).init('repl', e.data, false, false);
    if (result) {
      postMessage({type: 'success', data: result.code});
    } else {
      // A well-defined error occurred.
      postMessage({type: 'error', data: buffer});
    }
  } catch (err) {
    // Something went horribly wrong.
    postMessage({type: 'error', data: buffer + err.message});
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
};
