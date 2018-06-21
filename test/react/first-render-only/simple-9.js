var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

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

function A(props) {
  return <span {...props}>Hello {props.x}</span>;
}

function B() {
  return <div>World</div>;
}

function C() {
  return "!";
}

function App(props) {
  function fn() {
    
  }
  function fn2() {
    return props.bar(fn);
  }
  var someProps = Object.assign({}, props, {
    a: "foo",
    onClick: fn,
    ref: fn2,
    x: "Hello world!",
  });
  var otherProps = babelHelpers.objectWithoutProperties(someProps, ['a']);

  return (
    <div>
      <A {...otherProps} />
      <B />
      <C />
    </div>
  );
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  let val;
  function func(_val) {
    val = _val;
  }
  renderer.update(<Root bar={func} />);
  let results = [];
  results.push(['simple render', renderer.toJSON()]);
  if (isCompiled === true && val !== undefined) {
    throw new Error("Ref was found on <span> node");
  }
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;