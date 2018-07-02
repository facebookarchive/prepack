var React = require("react");

function FactoryComponent(props) {
  return {
    render() {
      return <div>{props.title}</div>;
    },
  };
}

function App(props) {
  return (
    <div>
      Hello, <FactoryComponent title={props.title} />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render simple factory classes #2", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
