if (this.__createReactMock) {
  var React = __createReactMock();
} else {
	var React = require('react');
}

function Child({name}) {
	return <span>I am a child {name}</span>;
}

function MessagePane() {
  return <div key='ha'><Child name={"A"} /></div>;
}

function SettingsPane() {
  return <div key='ha'><Child name={"B"} /></div>;
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
  __registerReactComponentRoot(App);
}

module.exports = App;
