function createAttributedComment(props) {
  let body = getBody(props);
  let _ranges;
  let ranges;

  if (body && body.ranges) {
    _ranges = body.ranges.filter(r => r.entity.__typename).map(r => ({
      location: Number(r.offset),
      length: Number(r.length),
      decorationLine: r.entity.__typename.includes("User") ? "none" : "underline",
    }));
  } else {
    _ranges = [];
  }

  if (body && body.delight_ranges) {
    let reduce_fn = (acc, x) => {
      let color_style = x.campaign.comment_styles.find(cs => cs.style.includes("color"));
      let font_style = x.campaign.comment_styles.find(cs => cs.style.includes("font-weight"));
      if (color_style && font_style) {
        let color = color_style.value;
        let font = font_style.value;
        return acc.concat({ location: Number(x.offset), length: Number(x.length), font: font, color: color });
      } else return acc;
    };
    ranges = body.delight_ranges.reduce(reduce_fn, _ranges);
  }

  return {
    text: body.text || "",
    ranges: ranges,
  };
}

function getBody(props) {
  if (props.showTranslatedBody && props.comment.translated_body_for_viewer !== null) {
    return props.comment.translated_body_for_viewer;
  } else if (props.comment.body !== null) {
    return props.comment.body;
  } else return null;
}

global.__optimize && __optimize(createAttributedComment);

inspect = () => {
  let test_props = {
    comment: {
      body: {
        text: "Magnificent comment",
        ranges: [
          {
            entity: { __typename: ["User", "Page"] },
            offset: 0,
            length: 5,
          },
          {
            entity: { __typename: ["Page"] },
            offset: 0,
            length: 5,
          },
          {
            entity: {},
            offset: 0,
            length: 5,
          },
          {
            entity: { __typename: ["User"] },
            offset: 0,
            length: 5,
            campaign: { comment_styles: [{ style: ["color"], value: 7 }] },
          },
        ],
        delight_ranges: [
          {
            offset: 0,
            length: 5,
            campaign: { comment_styles: [{ style: ["color"], value: 7 }, { style: ["font-weight"], value: 7 }] },
          },
          {
            offset: 0,
            length: 5,
            campaign: { comment_styles: [{ style: ["color"], value: 7 }, { style: ["font-weight"], value: 7 }] },
          },
          {
            offset: 0,
            length: 5,
            campaign: { comment_styles: [{ style: ["color"], value: 7 }, { style: ["font-weight"], value: 7 }] },
          },
        ],
      },
    },
  };
  return createAttributedComment(test_props);
};
