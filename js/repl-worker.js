self.importScripts('prepack-build.js');

onmessage = function(e) {
  try {
    // TODO ADD HERE
    postMessage({type: 'success', data: e.data});
  } catch (err) {
    postMessage({type: 'error', data: err.stack});
  }
};
