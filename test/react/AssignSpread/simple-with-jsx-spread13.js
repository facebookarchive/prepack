var React = require("react");

function Button(props) {
  return (
    <span>
      {props.name}
      {props.text}
    </span>
  );
}

Button.defaultProps = {
  name: "Dominic",
};

function App(props) {
  return <Button {...props} />;
}

function App2(_props) {
  return <Button {..._props} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root text={"Hello world"} />);
  return [["simple render with jsx spread 12", renderer.toJSON()]];
};

App.App2 = App2;

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
  __optimizeReactComponentTree(App2);
}

module.exports = App;
