var React = require("React");

function shallowEqual(objA, objB) {
  var keysA = Object.keys(objA);
  var keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return true;
}

var _React$PureComponent, _superProto;

function getStateForProps(props) {
  if (!props.feedback.is_awesome) {
    return { label: null, visible: false };
  }
  return { label: null, visible: false };
}
_React$PureComponent = babelHelpers.inherits(MyComponent, React.PureComponent);

_superProto = _React$PureComponent && _React$PureComponent.prototype;
function MyComponent() {
  var _superProto$construct;
  var _temp;
  for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }
  return (
    (_temp = (_superProto$construct = _superProto.constructor).call.apply(_superProto$construct, [this].concat(args))),
    (this.state = getStateForProps(this.props)),
    _temp
  );
}
MyComponent.getDerivedStateFromProps = function(nextProps, prevState) {
  var state = getStateForProps(nextProps);
  return shallowEqual(state, prevState) ? null : state;
};
MyComponent.prototype.render = function() {
  return null;
};

MyComponent.getTrials = function(renderer, Root) {
  renderer.update(<Root feedback={{ is_awesome: true }} />);
  return [["render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(MyComponent, {
    firstRenderOnly: true,
  });
}

module.exports = MyComponent;
