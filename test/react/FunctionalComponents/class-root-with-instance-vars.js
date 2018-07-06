var React = require("react");
this["abstractVal"] = null;

function SubChild(props) {
  return (
    <span>
      {props.title}
      <div>{props.abstractVal}</div>
    </span>
  );
}

function Child(props) {
  return (
    <span>
      <SubChild title={props.title} abstractVal={props.abstractVal} />
    </span>
  );
}

// we can't use ES2015 classes in Prepack yet (they don't serialize)
// so we have to use ES5 instead
var App = (function(superclass) {
  function App(props) {
    superclass.apply(this, arguments);
    this.title = props.title;
    // side-effectful
    this.abstractVal = abstractVal;
  }

  if (superclass) {
    App.__proto__ = superclass;
  }
  App.prototype = Object.create(superclass && superclass.prototype);
  App.prototype.constructor = App;
  App.prototype.render = function render() {
    return <Child title={this.title} abstractVal={this.abstractVal} />;
  };
  App.getTrials = function(renderer, Root) {
    abstractVal = "It works!";
    renderer.update(<Root title="Hello world" />);
    return [["render with class root and instance vars", renderer.toJSON()]];
  };

  return App;
})(React.Component);

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
