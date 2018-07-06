var React = require("react");

function App(props) {
  if (props.foo) {
    return (
      <div>
        <Foo callback={props.callback} x={props.x} />
      </div>
    );
  }
  return (
    <div>
      <Bar callback={props.callback} x={props.x} />
    </div>
  );
}

function Foo(props) {
  return props.x ? <input ref={props.callback} /> : <input ref={props.callback} />;
}

function Bar(props) {
  return props.x ? <input ref={props.callback} /> : <input ref={props.callback} />;
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
  renderer.update(<Root callback={callback} foo={true} x={true} />);
  renderer.update(<Root callback={callback} foo={true} x={false} />);
  renderer.update(<Root callback={callback} foo={false} x={false} />);
  renderer.update(<Root callback={callback} foo={false} x={true} />);

  let results = [];
  results.push(["ensure refs was called 3 times", counter]);
  results.push(["ensure refs at 0 is not null", nodes[0] !== null]);
  return results;
};

module.exports = App;
