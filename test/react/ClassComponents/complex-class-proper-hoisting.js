const React = require("react");

function Tau(props) {
  return React.createElement(
    "a",
    null,
    React.createElement("b", null),
    React.createElement(Epsilon, null),
    React.createElement("c", null)
  );
}

class Epsilon extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return React.createElement(React.Fragment, null, React.createElement("d", null), React.createElement("b", null));
  }
}

if (this.__optimizeReactComponentTree) __optimizeReactComponentTree(Tau);

Tau.getTrials = renderer => {
  const trials = [];

  renderer.update(<Epsilon />);
  trials.push(["render Epsilon", renderer.toJSON()]);

  renderer.update(<Tau />);
  trials.push(["render Tau", renderer.toJSON()]);

  const a = Tau().props.children[0];
  const b = Epsilon.prototype.render.call(undefined).props.children[1];
  if (a.type !== "b" || b.type !== "b") throw new Error("Expected <b>s");
  trials.push(["different React elements", JSON.stringify(a !== b)]);

  return trials;
};

module.exports = Tau;
