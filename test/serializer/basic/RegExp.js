regexp = /Facebook/i;
regexp2 = /books/;
regexp3 = new RegExp("/");

regexp2.lastIndex = 8;
i = "but books are books".match(regexp2);
j = regexp2.lastIndex;

k = "and /books/ are books too".match(regexp3);

inspect = function() {
  return "" + global.i + global.j + global.k + "Facebook is cool".match(global.regexp).index;
};
