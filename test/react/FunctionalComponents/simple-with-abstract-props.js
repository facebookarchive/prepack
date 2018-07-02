var React = require("react");

function IWantThisToBeInlined(props) {
  return <div>{props.text}</div>;
}

function Button(props) {
  return <IWantThisToBeInlined {...props} />;
}

function App(props) {
  return <Button {...props} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root text={"Hello world"} />);
  return [["simple render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
