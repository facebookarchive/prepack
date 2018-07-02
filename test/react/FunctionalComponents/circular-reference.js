var React = require("React");

function App() {
  // A circular reference
  let selfRef = {};
  selfRef.selfRef = selfRef;

  // A cycle between two references
  let mutualRefA = {};
  let mutualRefB = {};
  mutualRefA.indirect = { b: mutualRefB };
  mutualRefB.indirect = { a: mutualRefA };

  return (
    <div
      data-x={selfRef}
      data-y={mutualRefA}
      data-z={mutualRefB}
      data-a={mutualRefA === mutualRefA.indirect.b.indirect.a}
      data-b={mutualRefB === mutualRefB.indirect.a.indirect.b}
      data-c={selfRef === selfRef.selfRef}
    />
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["circular-reference", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
