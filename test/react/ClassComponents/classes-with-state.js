var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      title: "It works!",
    };
  }
  render() {
    return <div>{this.state.title}</div>;
  }
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render with class with state', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
