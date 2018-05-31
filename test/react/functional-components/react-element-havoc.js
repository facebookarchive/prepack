var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function App(props) {
  "use strict";
  var x = <div a={1} b={2} c={props.c} />
  props.someAbstractFunction(x);
  return x;
}

App.getTrials = function(renderer, Root) {
  function someAbstractFunction() {
    // NO-OP
  }
  renderer.update(<Root someAbstractFunction={someAbstractFunction} c={3} />);
  return [['react element havoc', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;