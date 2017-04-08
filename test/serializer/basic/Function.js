var i = 0;
f = function() {
  i += 1; 
  return i.toString();
}

inspect = function() { return f() + " " + f(); }