var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function App() {
  // Simple circular reference
  let selfRef = {};
  selfRef.selfRef = selfRef;

  // A cycle
  let mutualRefA = {};
  let mutualRefB = {};
  mutualRefA.indirect = {b: mutualRefB};
  mutualRefB.indirect = {a: mutualRefA};

  return <div data-x={selfRef} data-y={mutualRefA} data-y={mutualRefB} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['circular-reference', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
