// does contain:=> {

function foo(x) {
  this.x = x;
  const bar = () => {
    return this.x;
  };
  if (global.__optimize) __optimize(bar);
  this.bar = bar;
}

if (global.__optimize) __optimize(foo);

inspect = function() {
  return foo(5).bar();
};
