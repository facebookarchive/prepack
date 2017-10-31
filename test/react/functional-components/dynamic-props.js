if (this.__createReactMock) {
  var React = __createReactMock();
} else {
	var React = require('react');
}

function Fn(props) {
  return <div>Hello {props[props.dynamicKey]}</div>;
}

function App(props/*: {dynamicKey: string}*/) {
  return <Fn foo="World" dynamicKey={props.dynamicKey} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root dynamicKey="foo" />);
  return ['render with dynamic prop access', renderer.toJSON()];
};

if (this.__registerReactComponentRoot) {
  // to be used when component folding is added in separate PR
  // __registerReactComponentRoot(App);
}

module.exports = App;
