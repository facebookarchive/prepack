var React = require("react");

function App(props) {
  var arr = [1, 2, 3];

  if (props.cond) {
    arr.push(4);
  } else {
    arr.pop();
  }
  arr.reverse();
  return (
    <div>
      <span>{arr[0]}</span>
      <span>{arr[1]}</span>
      <span>{arr[2]}</span>
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root cond={true} />);
  results.push(["abstract array length on prop (cond: true)", renderer.toJSON()]);
  renderer.update(<Root cond={false} />);
  results.push(["abstract array length on prop (cond: false)", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
