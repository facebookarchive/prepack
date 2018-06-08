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

var x = (
  <Provider value="a">
    <Provider value="b">
      <Child />
    </Provider>
    <Child />
  </Provider>
);

function App(props) {
  return x;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root />);
  results.push(['render props context', renderer.toJSON()]);
  renderer.update(<Root />);
  results.push(['render props context', renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    isRoot: true,
  });
}

module.exports = App;