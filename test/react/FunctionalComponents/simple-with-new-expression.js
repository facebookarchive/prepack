const React = require("react");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

module.exports = __evaluatePureFunction(() => {
  var URI = require("URI");

  function App(props) {
    var _ref, _ref2;
    var _props = props;
    var className = _props.className;
    var text = _props.text;
    var feedback = _props.feedback;
    var trackingInfo = _props.trackingInfo;

    var url = (_ref2 = feedback) != null ? _ref2.url : _ref2;

    var href = new URI(url).addQueryData({ comment_tracking: trackingInfo }).makeString();

    return (
      <a href={href} className={className}>
        {text}
      </a>
    );
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(
      <Root className="link-class" title="Click me!" feedback={{ url: "http://fb.com" }} trackingInfo={null} />
    );
    return [["simple render with new expression", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App);
  }

  return App;
});
