var React = require("React");

var { Provider, Consumer } = React.createContext(null);

function Child(props) {
  var renderProp = function(value) {
    return <span>{value}</span>;
  };

  return (
    <div>
      <Consumer>{renderProp}</Consumer>
    </div>
  );
}

function App(props) {
  return (
    <Provider value={props.dynamicValue}>
      <Child />
    </Provider>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root dynamicValue={5} />);
  results.push(["render props context", renderer.toJSON()]);
  renderer.update(<Root dynamicValue={7} />);
  results.push(["render props context", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
