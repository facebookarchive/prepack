var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

var { Provider, Consumer } = React.createContext(null);
// this is done otherwise the test fails
this['_Consumer'] = Consumer;

function Child(props) {
  return (
    <div>
      <Consumer>
        {value => {
          return <span>{value}</span>
        }}
      </Consumer>
    </div>
  )
}

function App(props) {
  return (
    <Provider value="a">
      <Provider value="b">
        <Child />
      </Provider>
      <Child />
    </Provider>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render props context', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    isRoot: true,
  });
}

module.exports = App;