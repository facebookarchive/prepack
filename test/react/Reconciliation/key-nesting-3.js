var React = require('react');

// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function Child() {
	var x = [];

	for (let i = 0; i < 10; i++) {
		x.push(<span key={i} />)
	}
  return x;
}

function App() {
  return <div>
    <span />
    <Child />
    <Child />
		<span />
  </div>
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['key nesting 3', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
