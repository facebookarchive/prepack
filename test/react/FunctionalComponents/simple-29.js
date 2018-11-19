var React = require("react");

function App(props) {
  var arr = [1, 2, 3];

  if (props.cond) {
    arr.push(4);
  } else {
    arr.pop();
  }
  var arr1 = Array.from(arr);
  arr1.reverse();
  var arr2 = Array.from(arr).join(", ");
  var arr3 = Array.from(arr).map(x => x);
  return (
    <div>
      <span>{arr1}</span>
      <span>{arr2}</span>
      <span>{arr3}</span>
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
