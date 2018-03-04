var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function A(props) {
  return <div>{[[[[["Hello"], "world"], 1, <span>A span</span>], 2], null, <div>A div</div>]}</div>;
}

function App() {
  return (
    <div>
      <A />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render nested array children', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;