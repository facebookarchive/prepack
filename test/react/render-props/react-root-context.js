var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

var { Provider, Consumer } = React.createContext(null);

function Child(props) {
  var x = function(context) {
    var click = function () {
      return x;
    }

    return <span onClick={click}>{props.x}</span>
  }

  return (
    <div>
      <Consumer>
        {x}
      </Consumer>
    </div>
  )
}

function App(props) {
  return (
    <div>
      <Provider>
        <Child />
      </Provider>
      <Child />
    </div>
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