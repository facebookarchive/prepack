var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = {
  createElement() {
    var _react = require("react");
    if (!window.createElementCalls) {
      window.createElementCalls = 1;
    } else {
      window.createElementCalls++;
    }
    return _react.createElement.call(this, arguments);
  }
}

function A(props) {
  return <div>Hello {props.x}</div>;
}

function App(props) {
  return (
    props.x ? <span a={props.a} /> : <div a={props.a} />
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={true} a="1" />);
  let results = [];
  results.push(['lazy branched elements output', renderer.toJSON()]);
  results.push(['lazy branched elements count', window.createElementCalls]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;