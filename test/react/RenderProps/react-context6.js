var React = require("React");

var { Provider, Consumer } = React.createContext(null);

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
    <Provider>
      <Child />
    </Provider>
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
