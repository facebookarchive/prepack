var React = require("React");
var { QueryRenderer } = require("RelayModern");
// this is needed otherwise QueryRenderer gets inlined
this["QueryRenderer"] = QueryRenderer;

function App(props) {
  return (
    <QueryRenderer
      render={data => {
        return <span>Hello world</span>;
      }}
    />
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render props relay", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
