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

  if ( superclass ) Stateful.__proto__ = superclass;
  Stateful.prototype = Object.create( superclass && superclass.prototype );
  Stateful.prototype.constructor = Stateful;
  Stateful.prototype.componentWillReceiveProps = function componentWillReceiveProps() {
    this.setState({ updated: true });
  }
  Stateful.prototype.render = function render () {
    return (
      <div>
        {this.props.children}
        (is update: {String(this.state.updated)})
      </div>
    );
	};

  return Stateful;
}(React.Component));

function MessagePane() {
  return <Stateful>Hi</Stateful>;
}

function SettingsPane() {
  return <Stateful>Bye</Stateful>;
}

function App(props: {switch: boolean}) {
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
  renderer.update(<Root switch={false} />);
  let results = [];
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
  // to be used when component folding is added in separate PR
  // __registerReactComponentRoot(App);
}

module.exports = App;
