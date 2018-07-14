// flow-typed signature: 3e4bea59bad05fc51a94a6c3d0c65f75
// flow-typed version: 11460f58fa/js-beautify_v1.6.x/flow_>=v0.25.x

declare module 'js-beautify' {
  declare type JSBeautifyJSOptions = {
    indent_size?: number,
    indent_char?: string,
    indent_with_tabs?: boolean,
    eol?: string,
    end_with_newline?: boolean,
    indent_level?: number,
    preserve_newlines?: boolean,
    max_preserve_newlines?: number,
    space_in_paren?: boolean,
    space_in_empty_paren?: boolean,
    jslint_happy?: boolean,
    space_after_anon_function?: boolean,
    brace_style?: "collapse"
      |"collapse,preserve-inline"
      |"expand"
      |"expand,preserve-inline"
      |"end-expand"
      |"end-expand,preserve-inline"
      |"none"
      |"none,preserve-inline",
    break_chained_methods?: boolean,
    keep_array_indentation?: boolean,
    unescape_strings?: boolean,
    wrap_line_length?: number,
    e4x?: boolean,
    comma_first?: boolean,
    operator_position?: "before-newline"|"after-newline"|"preserve-newline",
    eval_code?: boolean,
    space_before_conditional?: boolean
  };

  declare type JSBeautifyCSSOptions = {
    indent_size?: number,
    indent_char?: string,
    indent_with_tabs?: boolean,
    eol?: string,
    end_with_newline?: boolean,
    selector_separator_newline?: boolean,
    newline_between_rules?: boolean
  };

  declare type JSBeautifyHTMLOptions = {
    indent_size?: number,
    indent_char?: string,
    indent_with_tabs?: boolean,
    eol?: string,
    end_with_newline?: boolean,
    preserve_newlines?: boolean,
    max_preserve_newlines?: number,
    indent_inner_html?: boolean,
    brace_style?: string,
    indent_scripts?: "keep"|"separate"|"normal",
    wrap_line_length?: number,
    wrap_attributes?: "auto"|"force"|"force-aligned",
    wrap_attributes_indent_size?: number,
    unformatted?: string|Array<string>,
    content_unformatted?: string|Array<string>,
    extra_liners?: string|Array<string>,
  };

  declare module.exports: {
    (code: string, options?: JSBeautifyJSOptions): string,
    js: (code: string, options?: JSBeautifyJSOptions) => string,
    css: (code: string, options?: JSBeautifyCSSOptions) => string,
    html: (code: string, options?: JSBeautifyHTMLOptions) => string,
    js_beautify: (code: string, options?: JSBeautifyJSOptions) => string,
    css_beautify: (code: string, options?: JSBeautifyCSSOptions) => string,
    html_beautify: (code: string, options?: JSBeautifyHTMLOptions) => string
  };
}
