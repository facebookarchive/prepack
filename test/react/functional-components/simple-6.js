var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function App(props) {
  return (
    <div>{String(props.title)}</div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple render', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;