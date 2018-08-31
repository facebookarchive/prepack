const React = require("react");

function Tau(props) {
  return React.createElement(
    "div",
    null,
    React.createElement(Epsilon, {
      a: props.z,
    }),
    React.createElement(Zeta, {
      p: props.h,
    })
  );
}

class Epsilon extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return React.createElement(Zeta, { p: this.props.a });
  }
}

function Zeta(props) {
  return props.p ? null : React.createElement("foobar", null);
}

if (this.__optimizeReactComponentTree) __optimizeReactComponentTree(Tau);

Tau.getTrials = function(renderer, Root) {
  const trials = [];

  renderer.update(<Root z={false} p={false} />);
  trials.push(["render 1", renderer.toJSON()]);

  renderer.update(<Root z={true} p={false} />);
  trials.push(["render 2", renderer.toJSON()]);

  renderer.update(<Root z={false} p={true} />);
  trials.push(["render 3", renderer.toJSON()]);

  renderer.update(<Root z={true} p={true} />);
  trials.push(["render 4", renderer.toJSON()]);

  return trials;
};

module.exports = Tau;
