var React = require("react");

class Wat extends React.Component {
  render() {
    return <div {...this.props} />;
  }
}

function App(props) {
  return <Wat {...props.inner} />;
}

App.getTrials = function(renderer, Root) {
  var obj;
  function ref(inst) {
    obj = inst;
  }
  renderer.update(<Root inner={{ className: "foo", ref }} />);
  return [["simple render with jsx spread 6", renderer.toJSON()], ["type", Object.keys(obj).join(",")]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
