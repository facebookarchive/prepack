var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

// FB www polyfill, clashes with Jest RN preset
if (!this.__optimizeReactComponentTree) {
  this.babelHelpers = {
    inherits(subClass, superClass) {
      Object.assign(subClass, superClass);
      subClass.prototype = Object.create(superClass && superClass.prototype);
      subClass.prototype.constructor = subClass;
      subClass.__superConstructor__ = superClass;
      return superClass;
    },
    _extends: Object.assign,
    extends: Object.assign,
    objectWithoutProperties(obj, keys) {
      var target = {};
      var hasOwn = Object.prototype.hasOwnProperty;
      for (var i in obj) {
        if (!hasOwn.call(obj, i) || keys.indexOf(i) >= 0) {
          continue;
        }
        target[i] = obj[i];
      }
      return target;
    },
    taggedTemplateLiteralLoose(strings, raw) {
      strings.raw = raw;
      return strings;
    },
    bind: Function.prototype.bind,
  };
}

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
_React$PureComponent = babelHelpers.inherits(
  MyComponent,
  React.PureComponent
);

_superProto = _React$PureComponent && _React$PureComponent.prototype;
function MyComponent() {
  var _superProto$construct;
  var _temp;
  for (
    var _len = arguments.length, args = Array(_len), _key = 0;
    _key < _len;
    _key++
  ) {
    args[_key] = arguments[_key];
  }
  return (
    (_temp = (_superProto$construct = _superProto.constructor).call.apply(
      _superProto$construct,
      [this].concat(args)
    )),
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
  renderer.update(<Root feedback={{is_awesome: true}} />);
  return [['render', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(MyComponent, {
    firstRenderOnly: true,
  });
}

module.exports = MyComponent;