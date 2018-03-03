var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function MaybeShow(props) {
  if (props.show) {
    return props.children;
  }
  return null;
}

function Override(props) {
  var child = props.children;
  var shouldShow = props.overrideShow;
  return React.cloneElement(child, {
    show: shouldShow
  });
}

function App(props) {
  return (
    <Override overrideShow={props.show}>
      <MaybeShow show={true}>
        <h1>Hi</h1>
      </MaybeShow>
    </Override>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root show={true} />);
  results.push(['clone element (true)', renderer.toJSON()]);

  renderer.update(<Root show={false} />);
  results.push(['clone element (false)', renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
