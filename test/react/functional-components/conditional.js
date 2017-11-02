if (this.__createReactMock) {
  var React = __createReactMock();
} else {
  var React = require('react');
}

function MaybeShow(props) {
  if (props.show) {
    return props.children;
  }
  return null;
}

function App() {
  return (
    <MaybeShow show={true}>
      <h1>Hi</h1>
    </MaybeShow>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['conditional render', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
<<<<<<< HEAD
  __registerReactComponentRoot(App);
=======
  // to be used when component folding is added in separate PR
  // __registerReactComponentRoot(App);
>>>>>>> upstream/master
}

module.exports = App;
