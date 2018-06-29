var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function A(props) {
  return 'Hello, ';
}

function B(props) {
  return 'world!';
}

function App() {
  return [
    <A key="1" />,
    <B key="2" />,
  ];
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render text', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
