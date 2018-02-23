var React = require('react');
this['React'] = React;

function App(props) {
  return <div {...props.inner} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root inner={{className: 'foo'}} />);
  return [['simple render with jsx spread 6', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;