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
      var hasOwn = Object.prototype.hasOwnProperty;
      var target = {};
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

var obj = {a: 1, b: 2, c: 3};

// FB www class transform output
const _React$Component = babelHelpers.inherits(Hello, React.Component);
Hello.prototype.componentDidMount = function() {
  // keep the lifecycle to prevent functional conversion
};
Hello.prototype.render = function() {
  return React.createElement(
    "h1",
    // Regression test for bad serialization of computed properties
     babelHelpers['extends']({}, this.__unknownAbstract),
    "Hello world",
    Object.keys(babelHelpers.objectWithoutProperties(obj, ["a", "c"]))
  );
};
function Hello() {
  _React$Component.apply(this, arguments);
}
    
Hello.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['fb2 mocks', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Hello);
}

module.exports = Hello;
