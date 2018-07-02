var React = require("react");

function Author(props) {
  return props.author.name || "Unnamed";
}

function App(props) {
  var comment = props.comment;
  var author = comment != null ? comment.author : null;
  return author ? React.createElement(Author, { author: author }) : "Unknown";
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root comment={{ author: { name: "Jo" } }} />);
  results.push(["full", renderer.toJSON()]);
  renderer.update(<Root comment={{ author: {} }} />);
  results.push(["no name", renderer.toJSON()]);
  renderer.update(<Root comment={{ author: null }} />);
  results.push(["no author", renderer.toJSON()]);
  renderer.update(<Root comment={null} />);
  results.push(["no comment", renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
