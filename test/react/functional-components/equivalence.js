var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function joinClasses(className) {
  var newClassName = className || "";
  for (
    var _len = arguments.length,
      classes = Array(_len > 1 ? _len - 1 : 0),
      _key = 1;
    _key < _len;
    _key++
  ) {
    classes[_key - 1] = arguments[_key];
  }
  var argLength = classes.length;

  for (var index = 0; index < argLength; index++) {
    var nextClass = classes[index];
    if (nextClass != null && nextClass !== "") {
      newClassName =
        (newClassName ? newClassName + " " : "") + nextClass;
    }
  }
  return newClassName;
}

var csx = function csx(selector) {
  return selector && selector.replace(/([^\\])\//g, "$1__");
};

var cx = function cx(classNames) {
  if (typeof classNames == "object") {
    return Object.keys(classNames)
      .map(function(className) {
        return classNames[className] ? className : "";
      })
      .map(csx)
      .join(" ");
  } else {
    return Array.prototype.map.call(arguments, csx).join(" ");
  }
};

function App(props) {
  var classNames = cx(
    "foo/root",
    "foo/sutroColor"
  );

  return React.createElement(
    "div",
    { className: joinClasses(classNames) },
    React.createElement(
      "div",
      { className: cx("foo/wrapper") },
      React.createElement("span", {
        className: cx("public/foo/dot")
      }),

      React.createElement("span", {
        className: cx("public/foo/dot")
      }),

      React.createElement("span", {
        className: cx("public/foo/dot")
      })
    ),
    React.createElement("div", null, React.createElement("span")),
    React.createElement("a", null, React.createElement("span")),
  );
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root x={true} a="1" />);
  results.push(['ReactElement children equivalence', renderer.toJSON()]);
  renderer.update(<Root x={false} a="1" />);
  results.push(['ReactElement children equivalence update', renderer.toJSON()]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;