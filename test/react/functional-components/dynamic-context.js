if (this.__createReactMock) {
  var React = __createReactMock();
} else {
	var React = require('react');
}

function SubChild(props, context) {
	return <span>The context title is: {context.title}</span>;
}

function Child(props: any, context: {title: string}) {
	return <span><SubChild /></span>;
}

// we can't use ES2015 classes in Prepack yet (they don't serialize)
// so we have to use ES5 instead
var StatefulComponent = (function (superclass) {
  function StatefulComponent () {
    superclass.apply(this, arguments);
  }

  if ( superclass ) StatefulComponent.__proto__ = superclass;
  StatefulComponent.prototype = Object.create( superclass && superclass.prototype );
  StatefulComponent.prototype.constructor = StatefulComponent;
  StatefulComponent.prototype.getChildContext = function getChildContext () {
		return {
			title: "Hello world!",
		}
  };
  StatefulComponent.prototype.render = function render () {
		return <Child />;
	};
	StatefulComponent.childContextTypes = {
		title: () => {},
	};

  return StatefulComponent;
}(React.Component));

this.StatefulComponent = StatefulComponent;

function App() {
	return <StatefulComponent />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return ['render with dynamic context access', renderer.toJSON()];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(Child);
}

module.exports = App;
