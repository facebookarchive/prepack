var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

class Foo extends React.Component {
  render() {
    return null;
  }
}

Foo.__reactCompilerDoNotOptimize = true;

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
    someFunc: function() {
      // do something
    }
  });
  data.someFunc();
  return (
    <div {...data}><Foo {...data}/></div>
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
  if (isCompiled === true && val === undefined) {
    throw new Error("Ref was not found on <Foo> node");
  }
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;