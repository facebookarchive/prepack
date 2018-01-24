var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;
var {QueryRenderer, graphql} = require('RelayModern');

var FBEnvironment = require('FBEnvironment');

function App({ initialNumComments, someVariables, query, pageSize, onCommit }) {
  return (
    <QueryRenderer
      environment={FBEnvironment}
      query={graphql`
        ${query}
      `}
      variables={someVariables}
      render={({error, props}) => {
        return <span>Hello world</span>
      }}
    />
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['fb1 mocks', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
