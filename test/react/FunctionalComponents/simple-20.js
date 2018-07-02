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
  var foo = props.x ? props.y : props.z;
  return (
    <div>
      {foo || <Child {...props} />}
      {foo && <Child {...props} />}
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root x={true} y={true} z={true} c={3} />);
  results.push(["deals with logical expression 1", renderer.toJSON()]);
  renderer.update(<Root x={true} y={true} z={false} c={3} />);
  results.push(["deals with logical expression 2", renderer.toJSON()]);
  renderer.update(<Root x={true} y={false} z={true} c={3} />);
  results.push(["deals with logical expression 3", renderer.toJSON()]);
  renderer.update(<Root x={false} y={true} z={true} c={3} />);
  results.push(["deals with logical expression 4", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
