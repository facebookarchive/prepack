var React = require("React");

function Button(props) {
  return props.x ? <span a={props.a} /> : <div a={props.a} />;
}

function App(props) {
  return props.foo ? <Button {...props} /> : <div />;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root x={true} a="1" />);
  results.push(["lazy branched elements output", renderer.toJSON()]);
  renderer.update(<Root x={false} a="1" />);
  results.push(["lazy branched elements output", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
