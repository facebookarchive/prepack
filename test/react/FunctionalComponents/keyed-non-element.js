const React = require("react");

function Upsilon(props) {
  return [<Delta key="0" />, <Delta key="1" />];
}

function Delta(props) {
  return [];
}

if (this.__optimizeReactComponentTree) __optimizeReactComponentTree(Upsilon);

Upsilon.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render", renderer.toJSON()]];
};

module.exports = Upsilon;
