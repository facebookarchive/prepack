if (this.__createReactMock) {
  var React = __createReactMock();
} else {
  var React = require('react');
}

function A(props) {
  return <div>Hello {props.x}</div>;
}

function B() {
  return <div>World</div>;
}

function C() {
  return "!";
}

function App() {
  return (
    <div>
      <A x={42} />
      <B />
      <C />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  React.createElement("div")
  renderer.update(<Root />);
  return [['simple render', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;