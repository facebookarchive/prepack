var React = require("react");

function Foo(props) {
  return <span>{props.name}</span>;
}

function App(props) {
  var Type;

  if (props.switch) {
    var x = Object.assign({}, props.data, {
      name: Foo,
    });
    Type = x.name;
  } else {
    return null;
  }

  return <Type name={"Dan"} />;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root switch={false} data={{}} />);
  results.push(["render with dynamic type", renderer.toJSON()]);
  renderer.update(<Root switch={true} data={{}} />);
  results.push(["render with dynamic type update", renderer.toJSON()]);
  renderer.update(<Root switch={false} data={{}} />);
  results.push(["render with dynamic type update", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
