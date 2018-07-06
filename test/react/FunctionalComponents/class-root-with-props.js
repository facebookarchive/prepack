var React = require("react");

function SubChild(props) {
  return <span>{props.title}</span>;
}

function Child(props) {
  return (
    <span>
      <SubChild title={props.title} />
    </span>
  );
}

// we can't use ES2015 classes in Prepack yet (they don't serialize)
// so we have to use ES5 instead
var App = (function(superclass) {
  function App() {
    superclass.apply(this, arguments);
  }

  if (superclass) {
    App.__proto__ = superclass;
  }
  App.prototype = Object.create(superclass && superclass.prototype);
  App.prototype.constructor = App;
  App.prototype.render = function render() {
    return <Child title={this.props.title} />;
  };
  App.getTrials = function(renderer, Root) {
    renderer.update(<Root title="Hello world" />);
    return [["render with class root and props", renderer.toJSON()]];
  };

  return App;
})(React.Component);

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
