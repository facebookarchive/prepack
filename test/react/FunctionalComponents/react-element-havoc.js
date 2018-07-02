var React = require("react");

function App(props) {
  "use strict";
  var b = props.b !== null ? (props.b.x !== null ? props.b.x : null) : null;
  var x = <div a={1} b={b} c={props.c} />;
  props.someAbstractFunction(x);
  return x;
}

App.getTrials = function(renderer, Root) {
  function someAbstractFunction() {
    // NO-OP
  }
  renderer.update(<Root someAbstractFunction={someAbstractFunction} b={null} c={3} />);
  return [["react element havoc", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
