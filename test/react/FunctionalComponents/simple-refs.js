var React = require("react");

let refB = false;

function A(foo) {
  return (
    <div>
      <span className="findMe" ref={foo.rootRef} />,
      <span ref={() => (refB = true)} />,
    </div>
  );
}

function App({ rootRef }) {
  return (
    <div>
      <A rootRef={rootRef} />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let refA = false;
  let rootRef = () => {
    refA = true;
  };
  renderer.update(<Root rootRef={rootRef} />);
  let results = [];
  results.push(["simple refs", renderer.toJSON()]);
  results.push(["ref A", refA]);
  results.push(["ref B", refB]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
