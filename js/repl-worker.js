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
        compatibility: 'browser'
      },
      false
    ).init('repl', e.data, false, false);

    postMessage({type: 'success', data: result.code});
  } catch (err) {
    postMessage({type: 'error', data: buffer || err.nativeStack});
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
};
