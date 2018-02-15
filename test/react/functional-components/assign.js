var React = require('react');
this['React'] = React;

function App(props) {
  var copyOfProps = {};
  var copyOfProps2 = {};
  Object.assign(copyOfProps, props, {x: 20});
  Object.assign(copyOfProps2, copyOfProps);
  return copyOfProps2.x;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={10} />);
  return [['simple render with object assign', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;