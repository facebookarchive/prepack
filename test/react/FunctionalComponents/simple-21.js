var React = require("React");

function Child(props) {
  return <span>{props.x.toString()}</span>;
}

function App(props) {
  return <div>{props.x !== null && <Child {...props} />}</div>;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root x={null} />);
  results.push(["deals with logical expression 1", renderer.toJSON()]);
  renderer.update(<Root x={5} />);
  results.push(["deals with logical expression 2", renderer.toJSON()]);
  renderer.update(<Root x={"hello world"} />);
  results.push(["deals with logical expression 3", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
