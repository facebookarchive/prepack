/* eslint-disable */
class Foo {
  constructor() {
    this.x = 10;
  }
  method(y) {
    return this.x + y;
  }
}
/* eslint-enable */

const Bar = class extends Foo {
  constructor() {
    super();
    this.y = 10;
  }
  method(z) {
    return this.x + this.y + z;
  }
};

inspect = function() {
  var foo = new Bar();
  return [foo, foo.method(10)];
};
