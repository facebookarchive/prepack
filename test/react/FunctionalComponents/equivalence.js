var React = require("React");

function App(props) {
  return React.createElement(
    "div",
    { className: "test" },
    React.createElement(
      "div",
      {
        className: "foo/wrapper",
      },
      React.createElement("span", {
        className: "public/foo/dot",
      }),

      React.createElement("span", {
        className: "public/foo/dot",
      }),

      React.createElement("span", {
        className: "public/foo/dot",
      })
    ),
    React.createElement("div", null, React.createElement("span")),
    React.createElement("a", null, React.createElement("span"))
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root x={true} a="1" />);
  results.push(["ReactElement children equivalence", renderer.toJSON()]);
  renderer.update(<Root x={false} a="1" />);
  results.push(["ReactElement children equivalence update", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
