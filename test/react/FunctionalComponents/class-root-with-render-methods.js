var React = require("react");

function SubChild() {
  return <span>Hello world</span>;
}

function Child() {
  return (
    <span>
      <SubChild />
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
  App.prototype._renderChild = function() {
    return <Child />;
  };
  App.prototype.render = function render() {
    return <div>{this._renderChild()}</div>;
  };
  App.getTrials = function(renderer, Root) {
    renderer.update(<Root />);
    return [["render with class root", renderer.toJSON()]];
  };

  return App;
})(React.Component);

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
