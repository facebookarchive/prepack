var React = require("react");

class ClassComponent extends React.Component {
  constructor() {
    super();
    this.state = {};
  }
  getValue() {
    return this.props.value;
  }
  render() {
    return <div />;
  }
}

function Child(props) {
  return <ClassComponent ref={props.forwardedRef} value={props.value} />;
}

const WrappedComponent = React.forwardRef((props, ref) => {
  return <Child {...props} forwardedRef={ref} />;
});

function App(props) {
  return <WrappedComponent {...props} ref={props.x} />;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  var ref = React.createRef();
  var value = "Hello world!!!";
  renderer.update(<Root x={ref} value={value} />);
  results.push(["simple render with refs", renderer.toJSON()]);
  results.push(["ref node is a method of the class", ref.current.getValue()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
