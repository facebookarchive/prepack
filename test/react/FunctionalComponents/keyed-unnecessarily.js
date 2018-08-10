const React = require("react");

function Lambda(props) {
  return (
    <div>
      <div key="0" />
      {this.__optimizeReactComponentTree ? <Omega key="1" /> : <Omega />}
      {this.__optimizeReactComponentTree ? <Omega key="2" /> : <Omega />}
    </div>
  );
}

function Omega(props) {
  return <div />;
}

if (this.__optimizeReactComponentTree) __optimizeReactComponentTree(Lambda);

Lambda.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [
    ["render", renderer.toJSON()],
    ["keys are not added", JSON.stringify(Lambda().props.children.map(element => element.key))],
  ];
};

module.exports = Lambda;
