var React = require("React");

var div = <div data-ft={'{"tn": "O"}'} />;

function App(props) {
  return (
    <div className={cx("yar/Jar")}>
      <span className={cx("foo/bar", "foo/bar")}>
        <a
          href="#"
          className={cx({
            "foo/bar1": true,
            "foo/bar2": false,
            "foo/bar3": props.val,
            "foo/bar4": props.val + props.val,
          })}
        >
          I am a link
        </a>
        {div}
      </span>
    </div>
  );
}

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
  assertMatchesInSource(Root, /[^\w]cx\(/g, 3);

  renderer.update(<Root val={10} />);
  return [["fb6 mocks", renderer.toJSON()]];
};

module.exports = App;
