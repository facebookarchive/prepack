if (!this.Bootloader) {
  this.Bootloader = {loadAllModules() {}};
}

if (!this.cx) {
  this.cx = () => {};
}

function getValue() {
  return cx("yar/Jar");
}

var a = [Bootloader.loadAllModules("somethingYes"), getValue()];

function App() {
  return [cx("foo/Bar"), a];
}

this.WrappedApp = App;
