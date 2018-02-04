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

this.abstractValue = this.__abstract ? __abstract("boolean", "this.abstractValue") : true;

function getValue() {
  return [cx("yar/Jar"), ix("yar/Jar"), cx("foo/bar", "foo/bar"), cx({
    "foo/bar1": true,
    "foo/bar2": false,
    "foo/bar3": abstractValue,
  })];
}

var a = [Bootloader.loadAllModules("somethingYes"), getValue(), JSResource.loadAll];

function App() {
  return [cx("foo/Bar"), a];
}

this.WrappedApp = App;
