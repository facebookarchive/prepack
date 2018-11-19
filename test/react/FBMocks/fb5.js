var React = require("React");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

module.exports = this.__evaluatePureFunction(() => {
  if (!this.Bootloader) {
    this.Bootloader = { loadModules() {} };
  }

  if (!this.JSResource) {
    this.JSResource = { loadAll() {} };
  }

  if (!this.ix) {
    this.ix = () => {};
  }

  // Verify that the generated code can still reference abstract values correctly.
  this.abstractTrue = this.__abstract ? __abstract("boolean", "true") : true;
  this.abstractFalse = this.__abstract ? __abstract("boolean", "false") : false;

  function getClassNames() {
    return [
      cx("cx-one"),
      cx("cx-multi-1", "cx-multi-2"),
      cx({
        "cx-obj-1": true,
        "cx-obj-2": false,
        "cx-obj-3-true": abstractTrue,
        "cx-obj-4-false": abstractFalse,
      }),
    ];
  }

  JSResource.loadAll("hi");
  Bootloader.loadModules("somethingYes", function() {});

  // Hoist to force the init time calculation
  var classNames = getClassNames();
  function App() {
    return <div className={classNames} />;
  }
  App.getClassNames = getClassNames;

  function assertMatchesInSource(fn, regex, expectedCount) {
    const matches = fn.toString().match(regex);
    const count = matches ? matches.length : 0;
    if (count !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} matches of ${regex} in the function ` +
          `source but found ${count}:\n\n${fn.toString()}`
      );
    }
  }

  App.getTrials = function(renderer, Root) {
    // Check that matches didn't get renamed
    assertMatchesInSource(Root.getClassNames, /[^\w]cx\(/g, 3);

    renderer.update(<Root />);
    return [["fb5 mocks", renderer.toJSON()]];
  };

  return App;
});
