var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function A(props) {
  return <div>Hello {props.x}</div>;
}

function App(props) {
	var copyOfProps = Object.assign({}, props);
  return (
    <div>
      <A x={copyOfProps.x} />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={10} />);
  return [['simple render with object assign', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;