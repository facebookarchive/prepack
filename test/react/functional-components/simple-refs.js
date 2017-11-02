if (this.__createReactMock) {
  var React = __createReactMock();
} else {
  var React = require('react');
}

let refB = false;

function A(foo) {
  return (
    <div>
      <span className="findMe" ref={foo.rootRef} />,
      <span ref={() => refB = true} />,
    </div>
  );
}

<<<<<<< HEAD
function App({rootRef}: {rootRef: Function}) {
=======
function App({rootRef}/*: {rootRef: Function}*/) {
>>>>>>> upstream/master
  return (
    <div>
      <A rootRef={rootRef} />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let refA = false;
  let rootRef = () => {
    refA = true;
  };
  renderer.update(<Root rootRef={rootRef} />);
  let results = [];
  results.push(['simple refs', renderer.toJSON()]);
  results.push(['ref A', refA]);
  results.push(['ref B', refB]);
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
