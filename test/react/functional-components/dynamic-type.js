var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function Foo(props) {
  return <span>{props.name}</span>;
}

function Bar(props) {
  return <div>{props.name}</div>;
}

function App(props) {
  let Type = props.switch ? Foo : Bar;

  return <Type name={"Dominic"} />
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render with dynamic prop access', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
