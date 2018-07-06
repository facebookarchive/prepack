var React = require("React");

var { Provider, Consumer } = React.createContext("foo");

function Child(props) {
  return (
    <div>
      <Consumer>
        {value => {
          return <span>{value}</span>;
        }}
      </Consumer>
    </div>
  );
}

function App(props) {
  return (
    <Provider value={5}>
      <Child />
    </Provider>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root />);
  results.push(["render props context", renderer.toJSON()]);
  renderer.update(<Root />);
  results.push(["render props context", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
