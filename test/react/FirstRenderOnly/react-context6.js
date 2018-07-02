var React = require("React");

var { Provider, Consumer } = React.createContext(null);

function Child2(props) {
  return <span>{props.title}</span>;
}

function Child(props) {
  return (
    <div>
      <Consumer>
        {value => {
          return (
            <span>
              <Child2 title={value} />
            </span>
          );
        }}
      </Consumer>
    </div>
  );
}

function App(props) {
  return (
    <div>
      <Provider value="b">
        <Child />
      </Provider>
      <Child />
    </div>
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
