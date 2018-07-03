var React = require("React");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

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
    const propsCopyWithDeletedProp = babelHelpers.extends({}, props);
    delete propsCopyWithDeletedProp.y;
    return React.createElement("div", null, React.createElement(A, propsCopyWithDeletedProp));
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
