var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function App(props) {
  return React.createElement("div", null, [,,,,,,"div"]);
}


App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['hoely children #2', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;