var React = require("react");

var _React$Component = babelHelpers.inherits(Middle, React.Component);
_superProto = _React$Component && _React$Component.prototype;

function Middle(props) {
  _superProto.constructor.call(this, props);
  this.$Middle_renderItem = function() {
    return this.props.item;
  }.bind(this);
}
Middle.prototype.render = function() {
  var children = this.props.children;
  return children({
    renderItem: this.$Middle_renderItem,
  });
};

function App(props) {
  return <Middle {...props} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root item={<span>Hi</span>}>{obj => <h1>{obj.renderItem()}</h1>}</Root>);
  return [["render with bound child function", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;
