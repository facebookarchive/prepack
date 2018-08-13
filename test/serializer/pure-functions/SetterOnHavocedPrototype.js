var obj = global.__abstract && global.__makePartial ? __makePartial(__abstract({}, "({foo:1})")) : { foo: 1 };

function fn(cb) {
  var foo = {
    set x(v) {
      this.y = 1;
    },
  };
  var bar = Object.create(foo);
  bar.y = 2;
  cb(foo);
  bar.x = 3;
  return bar.y;
}

if (global.__optimize) {
  __optimize(fn);
}

inspect = function() {
  return fn(o => o);
};
