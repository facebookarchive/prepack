var React = require("react");

function Foo(props) {
  return <span>{props.name}</span>;
}

function Bar(props) {
  return <div>{props.name}</div>;
}

function App(props) {
  let Type = props.switch ? (props.switch ? Foo : Bar) : Bar;

  return <Type name={"Dan"} />;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root switch={false} />);
  results.push(["render with dynamic type", renderer.toJSON()]);
  renderer.update(<Root switch={true} />);
  results.push(["render with dynamic type update", renderer.toJSON()]);
  renderer.update(<Root switch={false} />);
  results.push(["render with dynamic type update", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
