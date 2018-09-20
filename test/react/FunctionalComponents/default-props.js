var React = require("React");

function Child(props) {
  return <span>{props.children}</span>;
}

Child.defaultProps = {
  children: "default text",
};

function App(props) {
  return <Child {...props.foo}>{props.bar}</Child>;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root foo={{ children: undefined }} bar={undefined} />);
  results.push(["defaultProps", renderer.toJSON()]);
  renderer.update(<Root foo={{ children: "prop children text" }} bar={undefined} />);
  results.push(["defaultProps", renderer.toJSON()]);
  renderer.update(<Root foo={{ children: undefined }} bar={"children prop text"} />);
  results.push(["defaultProps", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
