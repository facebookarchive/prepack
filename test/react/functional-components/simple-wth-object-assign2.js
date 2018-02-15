var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function A(props) {
  var copyOfProps = Object.assign({}, props.bag);
  Object.assign(copyOfProps, "y", {
    get() {
      return 30;
    },
    set(x) {
      return x;
    },
  })
  return <div>Hello {copyOfProps.x} {copyOfProps.y}</div>;
}

function App(props) {
	var copyOfProps = Object.assign({}, props, {x: 20});
  return (
    <A bag={copyOfProps} />
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