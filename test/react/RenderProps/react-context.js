var React = require("React");

var { Provider, Consumer } = React.createContext("bar");

function Child(props) {
  return (
    <div>
      <Consumer>
        {context => {
          return <span>{context}</span>;
        }}
      </Consumer>
    </div>
  );
}

function App(props) {
  return (
    <Provider value={"foo"}>
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
