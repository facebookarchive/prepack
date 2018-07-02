var React = require("react");

function App(props) {
  if (props.foo) {
    return (
      <div>
        <Foo callback={props.callback} />
        <Foo callback={props.callback} />
      </div>
    );
  }
  return (
    <div>
      <Bar callback={props.callback} />
      <Bar callback={props.callback} />
    </div>
  );
}

function Foo(props) {
  return <input ref={props.callback} />;
}

function Bar(props) {
  return <input ref={props.callback} />;
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

App.getTrials = function(renderer, Root) {
  let counter = 0;
  let nodes = [];
  function callback(node) {
    nodes.push(node);
    counter++;
  }
  renderer.update(<Root callback={callback} foo={true} />);
  renderer.update(<Root callback={callback} foo={false} />);

  let results = [];
  results.push(["ensure refs was called 6 times", counter]);
  return results;
};

module.exports = App;
