var React = require("React");

class Child1 extends React.Component {
  constructor() {
    super();
    var self = this;
    this.someMethod = function() {
      return self.props.bar;
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
