if (this.__createReactMock) {
  var React = __createReactMock();
} else {
  var React = require('react');
}

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

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
