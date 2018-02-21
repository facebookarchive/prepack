if (!window.__evaluatePureFunction) {
  window.__evaluatePureFunction = function(f) {
    return f();
  };
}

(function() {
  function App() {}
  var ReactRelay = require('RelayModern');

  window.__evaluatePureFunction(() => {
    ReactRelay.createFragmentContainer(App);
  });
})();