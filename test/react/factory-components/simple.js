function FactoryComponent(props) {
	return {
		render() {
			return <div>{props.title}</div>;
		},
	}
}

FactoryComponent.getTrials = function(renderer, Root) {
	renderer.update(<Root />);
	return [['render simple factory classes', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(FactoryComponent);
}

module.exports = FactoryComponent;