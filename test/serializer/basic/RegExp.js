regexp = /Facebook/i;
regexp2 = /books/;

regexp2.lastIndex = 8;
i = "but books are books".match(regexp2);
j = regexp2.lastIndex;

inspect = function() { return "" + i + j + "Facebook is cool".match(regexp).index; }
