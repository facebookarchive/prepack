var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

<<<<<<< HEAD
var { Provider, Consumer } = React.createContext(null);
=======
var Ctx = React.createContext(null);
>>>>>>> master

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
  return (
    <Ctx.Provider value="a">
      <Ctx.Provider value="b">
        <Child />
      </Ctx.Provider>
      <Child />
    </Ctx.Provider>
  );
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
  __optimizeReactComponentTree(App);
}

module.exports = App;