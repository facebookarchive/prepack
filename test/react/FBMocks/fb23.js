var React = require("react");
var ReactDOMServer = require("react-dom/server");

function A(props) {
  return <div>Hello {props.x}</div>;
}

function B() {
  return <div>World</div>;
}

function C() {
  return "!";
}

function App() {
  return (
    <div>
      <A x={42} />
      <B />
      <C />
    </div>
  );
}

var x = ReactDOMServer.renderToString(App);
var y = ReactDOMServer.renderToStaticMarkup(App);

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root />);
  results.push(["fb23", renderer.toJSON()]);
  results.push(["renderToString", x]);
  results.push(["renderToStaticMarkup", y]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}
