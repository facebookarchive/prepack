var Foo = global.__abstract
  ? __abstract(undefined, "(function () { this.x = 10 })")
  : function() {
      this.x = 10;
    };

function additional1() {
  return new Foo();
}

if (global.__optimize) {
  __optimize(additional1);
}

inspect = function() {
  return JSON.stringify(additional1());
};
