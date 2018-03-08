var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;
var { Provider, Consumer } = React.createContext(null);
// this is done otherwise the test fails
this['_Consumer'] = Consumer;

function Child(props) {
  return (
    <div>
      <_Consumer>
        {value => {
          return <span>{value}</span>
        }}
      </_Consumer>
    </div>
  )
}

function App(props) {
  return <div><Child /></div>;
}

App.getTrials = function(renderer, Root) {
  renderer.update((
    <Provider value={5}>
      <Root />
    </Provider>
  ));
  return [['render props relay', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;