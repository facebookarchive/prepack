var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

if (!this.Bootloader) {
  this.Bootloader = {loadAllModules() {}};
}

if (!this.JSResource) {
  this.JSResource = {loadAll() {}};
}

var cx = this.cx;

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
          })}
        >
          I am a link
        </a>
      </span>
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['fb6 mocks', renderer.toJSON()]];
};

module.exports = App;
