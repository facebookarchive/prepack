var React = require("React");

var { Provider, Consumer } = React.createContext("bar");

function Child(props) {
  var x = function(context) {
    var click = function() {
      return x;
    };

    return <span onClick={click}>{props.x}</span>;
  };

  return (
    <div>
      <Consumer>{x}</Consumer>
    </div>
  );
}

function App(props) {
  return (
    <div>
      <Provider value={"foo"}>
        <Child />
      </Provider>
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
  __optimizeReactComponentTree(App, {
    isRoot: true,
  });
}

module.exports = App;
