if (this.__createReactMock) {
  var React = __createReactMock();
} else {
	var React = require('react');
}
function A(props) {
	return props.children;
}

function App(props: any) {
  return (
    <A>
      <A>
        Hi
      </A>
    </A>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple children', renderer.toJSON()]];
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
