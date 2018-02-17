var React = require('react');
this['React'] = React;

// Regression test for
// https://github.com/facebook/prepack/pull/1458/
function App(props) {
  var obj1 = Object.assign({}, props, {x: 20});
  var obj2 = Object.assign({}, obj1);
  var obj3 = Object.assign({}, {x: 20}, props);
  var obj4 = {};
  var obj5 = {};
  Object.assign(obj4, props, obj5, {x: 20});
  obj5.foo = 2;
  return (
    <div>
      {JSON.stringify(obj1)}
      {JSON.stringify(obj2)}
      {JSON.stringify(obj3)}
      {JSON.stringify(obj4)}
      {JSON.stringify(obj5)}
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={10} />);
  return [['simple render with object assign', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;