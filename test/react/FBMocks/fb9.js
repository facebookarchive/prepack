var React = require("React");

module.exports = this.__evaluatePureFunction(() => {
  function A(props) {
    return (
      <React.Fragment>
        <div>
          Hello {props.x} {props.y}
        </div>
        <B />
        <C />
      </React.Fragment>
    );
  }

  function B() {
    return <div>World</div>;
  }

  function C() {
    return "!";
  }

  function App(props) {
    return React.createElement(
      "div",
      null,
      React.createElement(A, babelHelpers.objectWithoutProperties(props, ["x"])),
      React.createElement(A, babelHelpers.extends({}, props, { x: 30 }))
    );
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(<Root x={10} y={20} />);
    return [["simple render", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App);
  }

  return App;
});
