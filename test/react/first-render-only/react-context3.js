var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;
var { Provider, Consumer } = React.createContext(null);
// this is done otherwise the test fails because getTrials
// fails to get the same reference to the context as the
// component, due to how test-react evaluates this module
// (strange, I can't see any work around apart from this)
// this shouldn't happen in real code, as we don't do
// what we do with test-react and try and eval the module
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
  return [['render props context', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;