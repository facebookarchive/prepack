var React = require("React");

function App(props) {
  return <div {...props.foo}>{props.bar}</div>;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root foo={{ children: undefined }} bar={undefined} />);
  results.push(["jsx spread", renderer.toJSON()]);
  renderer.update(<Root foo={{ children: "prop children text" }} bar={undefined} />);
  results.push(["jsx spread", renderer.toJSON()]);
  renderer.update(<Root foo={{ children: undefined }} bar={"children prop text"} />);
  results.push(["jsx spread", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;
