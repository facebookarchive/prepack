if (!this.Bootloader) {
  this.Bootloader = {loadAllModules() {}};
}

if (!this.JSResource) {
  this.JSResource = {loadAll() {}};
}

if (!this.cx) {
  this.cx = () => {};
}

if (!this.ix) {
  this.ix = () => {};
}

function getValue() {
  return [cx("yar/Jar"), ix("yar/Jar")];
}

var a = [Bootloader.loadAllModules("somethingYes"), getValue(), JSResource.loadAll];

function App() {
  return [cx("foo/Bar"), a];
}

this.WrappedApp = App;
