var React = require("react");

if (!window.__evaluatePureFunction) {
  window.__evaluatePureFunction = function(f) {
    return f();
  };
}

class App extends React.Component {
  constructor() {
    super();
    window.__evaluatePureFunction(() => {
      this.x = 5;
    });
  }
  render() {
    return <div>{this.x}</div>;
  }
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}
