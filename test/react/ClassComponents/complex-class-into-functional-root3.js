const React = require("react");

class Child2 extends React.Component {
  constructor() {
    super();
  }
  render() {
    return <span>{this.props.state}</span>;
  }
}

class Child extends React.Component {
  constructor() {
    super();
    this.state = {
      status: null,
    };
  }
  componentWillReceiveProps() {
    this.setState({
      status: "componentWillReceiveProps",
    });
  }
  componentDidMount() {
    this.setState({
      status: "componentDidMount",
    });
  }
  render() {
    return (
      <div>
        <Child2 {...this.state} />
      </div>
    );
  }
}

function App(props) {
  return (
    <div>
      <Child />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];

  renderer.update(<Root />);
  results.push(["render complex class component into functional component", renderer.toJSON()]);
  renderer.update(<Root />);
  results.push(["update complex class component into functional component", renderer.toJSON()]);
  renderer.update(<Root />);
  results.push(["update complex class component into functional component", renderer.toJSON()]);

  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
