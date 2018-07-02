var React = require("React");
var { QueryRenderer, graphql } = require("RelayModern");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

module.exports = this.__evaluatePureFunction(() => {
  var FBEnvironment = require("FBEnvironment");

  function App({ initialNumComments, someVariables, query, pageSize, onCommit }) {
    return (
      <QueryRenderer
        environment={FBEnvironment}
        query={graphql`
          ${query}
        `}
        variables={someVariables}
        render={data => {
          return <span>Hello world</span>;
        }}
      />
    );
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(<Root />);
    return [["fb1 mocks", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App);
  }

  return App;
});
