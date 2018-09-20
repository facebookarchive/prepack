function fn(_ref) {
  var className = _ref.className;
  var comment = _ref.comment;
  var author = comment.author;
  var authorID = author && author.id;
  var authorName = author && author.name;
  if (!author || !authorID || authorName == null) {
    return null;
  }
  if (author.url) {
    return {
      props: {
        className: null,

        uid: authorID,
      },
      children: authorName,
    };
  } else {
    return {
      props: { className: className },
      children: authorName,
    };
  }
}

this.__optimize && __optimize(fn);
