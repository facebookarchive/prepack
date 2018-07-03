var React = require("react");

function Foo(props) {
  return <span>{props.name}</span>;
}

Foo.defaultProps = {
  name: "Hello world 1",
};

function Bar(props) {
  return <div>{props.name}</div>;
}

Bar.defaultProps = {
  name: "Hello world 2",
};

function App(props) {
  let Type = props.switch ? Foo : Bar;

  return <Type />;
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
