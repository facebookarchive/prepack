var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function App(props) {
  return (
    <div>
      {props.x || <div />}
      {props.y && <span />}
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  function externalFunc() {
    // NO-OP
  }
  let results = [];
  renderer.update(<Root x={<span />} y={true} />);
  results.push(['deals with logical expression 1', renderer.toJSON()]);
  renderer.update(<Root x={false} y={true} />);
  results.push(['deals with logical expression 2', renderer.toJSON()]);
  renderer.update(<Root x={false} y={<div />} />);
  results.push(['deals with logical expression 3', renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;