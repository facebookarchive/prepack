if (this.__createReactMock) {
  var React = __createReactMock();
} else {
  var React = require('react');
}

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

<<<<<<< HEAD
function App(props: {show: boolean}) {
=======
function App(props/*: {show: boolean}*/) {
>>>>>>> upstream/master
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

if (this.__registerReactComponentRoot) {
<<<<<<< HEAD
  __registerReactComponentRoot(App);
=======
  // to be used when component folding is added in separate PR
  // __registerReactComponentRoot(App);
>>>>>>> upstream/master
}

module.exports = App;
