const React = require("react");

function Root(props) {
  return (
    <React.Fragment>
      <React.Fragment>
        <div />
      </React.Fragment>
    </React.Fragment>
  );
}

Root.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["hoist fragments render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Root);
}

module.exports = Root;
