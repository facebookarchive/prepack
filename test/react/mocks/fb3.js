if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

(function() {
  function App() {}
  var ReactRelay = require('RelayModern');

  this.__evaluatePureFunction(() => {
    ReactRelay.createFragmentContainer(App);
  });
})();

// This test just verifies that the file compiles.
// It is pure and doesn't export anything.
