var React = require("react");

function Foo(props) {
  return [<div ref={props.callback} key="0" />];
}

function Bar(props) {
  return props.bar ? [<div ref={props.callback} key="0" />] : [<div ref={props.callback} key="0" />];
}

function App(props) {
  return props.foo ? <Foo {...props} /> : <Bar {...props} />;
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

App.getTrials = function(renderer, Root) {
  let counter = 0;
  let nodes = [];
  function callback(node) {
    nodes.push(node);
    counter++;
  }
  renderer.update(<Root callback={callback} foo={true} />);
  renderer.update(<Root callback={callback} foo={true} />);
  renderer.update(<Root callback={callback} foo={false} />);
  renderer.update(<Root callback={callback} foo={false} />);
  renderer.update(<Root callback={callback} foo={true} />);
  renderer.update(<Root callback={callback} foo={true} />);
  let results = [];
  results.push(["ensure ref is called on every change", counter]);
  results.push(["ensure refs are cleared", nodes.map(Boolean)]);
  results.push(["ensure refs are different", new Set(nodes).size]);
  return results;
};

module.exports = App;
