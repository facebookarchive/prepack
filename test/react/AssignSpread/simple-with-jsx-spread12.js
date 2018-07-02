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
  return <Button {...props} name={undefined} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root text={"Hello world"} />);
  return [["simple render with jsx spread 12", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
