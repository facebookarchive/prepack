var React = require("react");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

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
