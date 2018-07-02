var React = require("react");

function Child2(props) {
  return <span>{props.text}</span>;
}

function Child(props) {
  return (
    <div {...props}>
      <Child2 text={props.item1} />
      <Child2 text={props.item2} />
    </div>
  );
}

Child.defaultProps = {
  className: "foobar",
  children: null,
};

function App(props) {
  return <Child {...props} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root item1="foo" item2="bar" />);
  return [["simple render with jsx spread 10", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
