var React = require("react");

function IWantThisToBeInlined(props) {
  return (
    <div>
      {props.text} {props.name} {props.id}
    </div>
  );
}

function Button(props) {
  return props.switch ? <IWantThisToBeInlined {...props} /> : null;
}

Button.defaultProps = {
  name: "Dominic",
};

function App(props) {
  return <Button {...props} id={"5"} {...props} switch={true} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root text={"Hello world"} id="6" switch={false} />);
  return [["simple render with jsx spread", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
