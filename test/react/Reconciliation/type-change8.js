var React = require("react");

function App(props) {
  if (props.foo) {
    return <div>{[<Bar callback={props.callback} />]}</div>;
  }
  return (
    <div>
      <Foo callback={props.callback} />
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
  results.push(["ensure refs was called 3 times", counter === 3]);
  results.push(["ensure refs at 0 is not null", nodes[0] !== null]);
  results.push(["ensure refs at 1 is null", nodes[1] === null]);
  results.push(["ensure refs at 2 is not null", nodes[2] !== null]);
  results.push(["ensure refs at 2 is not null", nodes[0] !== nodes[2]]);
  return results;
};

module.exports = App;
