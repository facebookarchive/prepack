var React = require("react");

function App(props) {
  var obj1 = {};
  var obj2 = {};
  Object.assign(obj1, props, obj2, { x: 20 });
  obj2.foo = 2;
  return (
    <div>
      {obj1.x}
      {obj1.foo}
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={10} />);
  return [["simple render with object assign", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
