(function() {
  function f(c, g) {
    "use strict";
    let wrapper = { x: 23, y: undefined };
    if (c) {
      wrapper.x = Date.now();
      function h() {
        wrapper.y = wrapper.x;
        wrapper.x++;
      }
      g(h);
      return wrapper.x - wrapper.y;
    } else {
      wrapper.x = Date.now();
      function h() {
        wrapper.y = wrapper.x;
        wrapper.x++;
      }
      g(h);
      return wrapper.x - wrapper.y;
    }
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(true, g => g());
  };
})();
