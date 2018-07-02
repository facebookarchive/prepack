var React = require("react");

if (!window.__evaluatePureFunction) {
  window.__evaluatePureFunction = function(f) {
    return f();
  };
}

class App extends React.Component {
  constructor() {
    super();
    this.x = <div />;
    this.y = window.__evaluatePureFunction(() => {
      return this.x;
    });
  }
  render() {
    return <div>{this.y}</div>;
  }
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}
