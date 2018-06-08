if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

(function() {
  function App() {}
  require('React');

  var ReactRelay = require('RelayModern');

  this.__evaluatePureFunction(() => {
    ReactRelay.createFragmentContainer(App);
  });
})();
