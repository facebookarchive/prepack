var React = require("React");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

module.exports = this.__evaluatePureFunction(() => {
  function nullthrows(x) {
    var message =
      arguments.length <= 1 || arguments[1] === undefined ? "Got unexpected null or undefined" : arguments[1];
    if (x != null) {
      return x;
    }
    var error = new Error(message);

    error.framesToPop = 1;
    throw error;
  }

  function A(props) {
    return (
      <div className={props.className}>
        <div>
          Hello {props.x} {props.y}
        </div>
        <B />
        <C />
      </div>
    );
  }

  function B() {
    return <div>World</div>;
  }

  function C() {
    return "!";
  }

  function App(props) {
    nullthrows(props.className);
    return <A className={props.className} />;
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(<Root className="Rooty McRootface" />);
    return [["simple render", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App);
  }

  return App;
});
