var React = require("React");

var { Provider, Consumer } = React.createContext(null);

function Child(props) {
  return (
    <div>
      <Consumer>
        {context => {
          return <span>123</span>;
        }}
      </Consumer>
    </div>
  );
}

function App(props) {
  return (
    <Provider>
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
