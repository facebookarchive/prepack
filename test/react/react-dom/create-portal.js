var React = require('react');
var ReactDOM = require('react-dom');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

var b = document.createElement("div");

function Foo() {
  return <span>Inlined</span>;
}

function Child(props) {
  var x = ReactDOM.createPortal(<Foo />, b);
  return <div>{x}</div>
}

function App(props) {
  return <Child />;
}

App.getTrials = function(renderer, Root) {
  var a = document.createElement("div");
  ReactDOM.render(<Root />, a);
  var results = [];
  results.push(['render props A', a.innerHTML]);
  results.push(['render props B', b.innerHTML]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;