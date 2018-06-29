var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function App(props) {
  var divProps = {};
  Object.defineProperty(divProps, 'className', {
    get() {
      return 'hi';
    }
  })
  return <div {...divProps} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple render with jsx spread 4', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;