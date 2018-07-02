var React = require("React");

var Ctx = React.createContext(null);

function Child(props) {
  return (
    <div>
      <Ctx.Consumer>
        {value => {
          return <span>{value}</span>;
        }}
      </Ctx.Consumer>
    </div>
  );
}

function App(props) {
  return (
    <div>
      <Ctx.Provider value="b">
        <Child />
      </Ctx.Provider>
      <Child />
    </div>
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
