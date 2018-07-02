const React = require("react");

function Child2(props) {
  return <span {...props} />;
}

class Child extends React.Component {
  constructor() {
    super();
  }
  componentDidMount() {
    // NO-OP
  }
  componentDidUpdate() {
    // NO-OP
  }
  render() {
    return (
      <div>
        <Child2 {...this.props} />
      </div>
    );
  }
}

Child.defaultProps = {
  className: "class-name",
};

function App(props) {
  return (
    <div>
      <Child {...props} />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];

  renderer.update(<Root children={"Hello world"} />);
  results.push(["render complex class component into functional component", renderer.toJSON()]);
  renderer.update(<Root children={"Hello world"} />);
  results.push(["update complex class component into functional component", renderer.toJSON()]);
  renderer.update(<Root children={"Hello world"} />);
  results.push(["update complex class component into functional component", renderer.toJSON()]);

  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
