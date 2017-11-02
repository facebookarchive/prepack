if (this.__createReactMock) {
  var React = __createReactMock();
} else {
  var React = require('react');
}

// we can't use ES2015 classes in Prepack yet (they don't serialize)
// so we have to use ES5 instead
var Stateful = (function (superclass) {
  function Stateful () {
    superclass.apply(this, arguments);
    this.state = { updated: false };
  }

  if ( superclass ) {
    Stateful.__proto__ = superclass;
  }
  Stateful.prototype = Object.create( superclass && superclass.prototype );
  Stateful.prototype.constructor = Stateful;
  Stateful.prototype.componentWillReceiveProps = function componentWillReceiveProps() {
    this.setState({ updated: true });
  }
  Stateful.prototype.render = function render () {
    return (
      <div>
        (is update: {String(this.state.updated)})
      </div>
    );
  };

  return Stateful;
}(React.Component));

function MessagePane() {
  return <div key='ha'><Stateful /></div>;
}

function SettingsPane() {
  return <div key='ha'><Stateful /></div>;
}

<<<<<<< HEAD
function App(props: {switch: boolean}) {
=======
function App(props/*: {switch: boolean}*/) {
>>>>>>> upstream/master
  if (props.switch) {
    return (
      <div>
        <MessagePane />
      </div>
    );
  }
  return (
    <div>
      <SettingsPane />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root switch={false} />);
  results.push(['mount', renderer.toJSON()]);

  renderer.update(<Root switch={false} />);
  results.push(['update with same type', renderer.toJSON()]);

  renderer.update(<Root switch={true} />);
  results.push(['update with different type', renderer.toJSON()]);

  renderer.update(<Root switch={true} />);
  results.push(['update with same type (again)', renderer.toJSON()]);

  renderer.update(<Root switch={false} />);
  results.push(['update with different type (again)', renderer.toJSON()]);
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
