var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function App(props) {
  function fn() {
    // should not be here
  }
  function fn2() {
    return props.bar(fn);
  }
  var data = Object.assign({}, {x: 1}, props, {
    lol: true,
    onClick: fn,
    ref: fn2,
  });
  props.abstractFunc(data);
  return (
    <div {...data} />
  );
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  let passed = false;
  function abstractFunc(_val) {
    if (_val && _val.lol === true && _val.onClick !== undefined && _val.ref !== undefined) {
      passed = true;
    }
  }
  let val;
  function func(_val) {
    val = _val;
  }
  renderer.update(<Root abstractFunc={abstractFunc} bar={func} />);
  let results = [];
  results.push(['simple render', renderer.toJSON()]);
  if (isCompiled === true) {
    if (val !== undefined) {
      throw new Error("Ref was found on <div> node");
    }
    if (!passed) {
      throw new Error("The object with lol, onClick and ref was stripped on the wrong object");
    }
  }
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;