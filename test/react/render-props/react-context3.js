var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;
var Ctx = React.createContext(null);

function Child(props) {
  return (
    <div>
      <Ctx.Consumer>
        {value => {
          return <span>{value}</span>
        }}
      </Ctx.Consumer>
    </div>
  )
}

function App(props) {
  return <div><Child /></div>;
}

App.Ctx = Ctx;

App.getTrials = function(renderer, Root) {
  renderer.update((
    <Root.Ctx.Provider value={5}>
      <Root />
    </Root.Ctx.Provider>
  ));
  return [['render props context', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;