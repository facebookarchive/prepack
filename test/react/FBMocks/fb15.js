var React = require("React");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

module.exports = this.__evaluatePureFunction(() => {
  function memoize(f) {
    var f1 = f;
    var result = void 0;
    return function() {
      if (f1) {
        result = f1();
        f1 = null;
      }
      return result;
    };
  }

  var getMemoizedArray = memoize(function() {
    return [];
  });

  var React = require("react");

  var _React$Component, _superProto;
  _React$Component = babelHelpers.inherits(Inner, React.Component);
  _superProto = _React$Component && _React$Component.prototype;
  function Inner() {
    var _superProto$construct;
    var _temp;
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    return (
      (_temp = (_superProto$construct = _superProto.constructor).call.apply(
        _superProto$construct,
        [this].concat(args)
      )),
      (this.state = {}),
      _temp
    );
  }
  Inner.prototype.render = function() {
    var res = "Loading...".split("").map(getMemoizedArray);
    return React.createElement("div", null, res);
  };

  function Outer(props) {
    var isChronologicalOrder = props.foo === 42;
    var inner1 = React.createElement(Inner, props.bar);
    var inner2 = React.createElement(Inner, props.bar);
    return isChronologicalOrder ? inner1 : inner2;
  }

  Outer.getTrials = function(renderer, Root) {
    renderer.update(<Root />);
    return [["fb15 mocks", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(Outer, {
      firstRenderOnly: true,
    });
  }

  return Outer;
});
