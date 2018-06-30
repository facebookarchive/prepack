var React = require("react");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

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
