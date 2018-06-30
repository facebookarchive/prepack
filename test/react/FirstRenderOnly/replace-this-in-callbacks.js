var React = require("React");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

class Child1 extends React.Component {
  constructor() {
    super();
    this.someMethod = () => {
      return this.props.bar;
    };
  }
  render() {
    let DeOptComponent = this.props.DeOptComponent;
    return (
      <div>
        <DeOptComponent someMethod={this.someMethod} />
      </div>
    );
  }
}

function App(props) {
  return <Child1 {...props} />;
}

App.getTrials = function(renderer, Root) {
  function DeOptComponent(props) {
    return <span>{props.someMethod()}</span>;
  }
  renderer.update(<Root DeOptComponent={DeOptComponent} bar="123" />);
  return [["render replace this in callbacks", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;
