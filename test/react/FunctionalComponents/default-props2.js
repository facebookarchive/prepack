var React = require("React");

function Child(props) {
  return <span>{props.children}</span>;
}

var defaultProps = {
  children: "default text",
};

this.__makePartial && __makePartial(defaultProps);

Child.defaultProps = defaultProps;

function App(props) {
  var newProps = Object.assign({}, props, { children: undefined });
  return <Child {...newProps} />;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root foo={{ children: undefined }} bar={"children prop text"} />);
  results.push(["defaultProps 2", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
