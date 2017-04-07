self.importScripts('prepack.min.js');

onmessage = function(e) {
  try {
    var result = new prepack.default(
      {
        partial: true,
        compatibility: 'browser'
      },
      false
    ).init('repl', e.data, false, false);

    postMessage({type: 'success', data: result.code});
  } catch (err) {
    postMessage({type: 'error', data: err.nativeStack});
  }
};
