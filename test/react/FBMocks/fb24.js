var React = require("react");

// FB www polyfill
if (!this.babelHelpers) {
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

function App(props) {
  var data = {};
  var someProps = Object.assign(data, props, {
    text: "Text!",
  })
  var propsWithout = babelHelpers.objectWithoutProperties(data, []);
  return <div>{propsWithout.text}</div>
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  if (isCompiled) {
    var a = App({});
    var b = App({});
    if (a !== b) {
      throw new Error("The values should be the same!");
    }
  }
  renderer.update(<Root />);
  return [["fb24", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;