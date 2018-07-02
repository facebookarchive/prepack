var React = require("React");

function Child(props) {
  var x = Object.assign({}, props, {
    a: 1,
    b: 2,
  });
  return (
    <span>
      {x.a}
      {x.b}
      {x.c}
    </span>
  );
}

function App(props) {
  return (
    <div>
      {props.x || <Child {...props} />}
      {props.y && <Child {...props} />}
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root x={<span />} y={true} c={3} />);
  results.push(["deals with logical expression 1", renderer.toJSON()]);
  renderer.update(<Root x={false} y={true} c={4} />);
  results.push(["deals with logical expression 2", renderer.toJSON()]);
  renderer.update(<Root x={false} y={<div />} c={5} />);
  results.push(["deals with logical expression 3", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
