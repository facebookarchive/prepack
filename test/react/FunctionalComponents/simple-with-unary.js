var React = require("react");

function Child({ targetNumCommentsToDisplay, pageSize, offset }) {
  return <span>{~targetNumCommentsToDisplay + +pageSize + -offset}</span>;
}

function App(props) {
  return (
    <div>
      <Child {...props} />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root targetNumCommentsToDisplay={1} pageSize={2} offset={3} />);
  results.push(["simple render", renderer.toJSON()]);
  renderer.update(<Root targetNumCommentsToDisplay={3} pageSize={2} offset={1} />);
  results.push(["update render", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
