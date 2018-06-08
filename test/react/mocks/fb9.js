var React = require('React');
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

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

module.exports = this.__evaluatePureFunction(() => {  
  function A(props) {
    return (
      <React.Fragment>
        <div>Hello {props.x} {props.y}</div>
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
    return React.createElement('div', null,
      React.createElement(
        A,
        babelHelpers.objectWithoutProperties(props, ['x'])
      ),
      React.createElement(
        A,
        babelHelpers.extends({}, props, {x: 30})
      )
    );
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(<Root x={10} y={20} />);
    return [['simple render', renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App);
  }

  return App;
});