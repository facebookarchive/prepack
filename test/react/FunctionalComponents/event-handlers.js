var React = require("React");

function App(props) {
  // This being a named function is a regression test for a bug
  // that emitted a global.onClick assignment.
  return (
    <div
      onClick={function onClick(x) {
        props.onClick(x * 2);
      }}
    />
  );
}

App.getTrials = function(renderer, Root) {
  let result;
  renderer.update(
    <Root
      onClick={res => {
        result = res;
      }}
    />
  );
  renderer.root.findByType("div").props.onClick(10);
  return [["onClick gets called", result], ["regression: onClick is not global", typeof this.onClick]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
