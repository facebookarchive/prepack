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
  __registerReactComponentRoot(App);
}

module.exports = App;
