var React = require("React");

var { Provider, Consumer } = React.createContext(null);

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
  renderer.update(<Root />);
  return [["render props context", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;
