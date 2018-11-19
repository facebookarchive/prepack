const React = require("react");

function Lambda(props) {
  return [<div key="0" />, <Omega key="1" />, <Omega key="2" />];
}

function Omega(props) {
  return <div />;
}

if (this.__optimizeReactComponentTree) __optimizeReactComponentTree(Lambda);

Lambda.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render", renderer.toJSON()], ["keys are maintained", JSON.stringify(Lambda().map(element => element.key))]];
};

module.exports = Lambda;
