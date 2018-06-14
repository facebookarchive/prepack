var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;
var checkRef = false;

function App(props) {
  function fn() {
    // should not be here
  }
  function fn2() {
    return props.bar(fn);
  }
  return (
    <div onClick={fn} ref={fn2} />
  );
}

App.getTrials = function(renderer, Root) {
  let val;
  function func(_val) {
    val = _val;
  }
  renderer.update(<Root bar={func} />);
  let results = [];
  results.push(['simple render', renderer.toJSON()]);
  if (checkRef === true && val !== undefined) {
    throw new Error("Ref was found! :(");
  }
  return results;
};


if (this.__optimizeReactComponentTree) {
  checkRef = true;
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;