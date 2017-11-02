if (this.__createReactMock) {
  var React = __createReactMock();
} else {
  var React = require('react');
}

function A() {
}

function App() {
  return (
    <div>
      <A />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let didError = false;
  try {
    renderer.update(<Root />);
  } catch (err) {
    didError = true;
  }
  return [['error rendering', didError]];
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
