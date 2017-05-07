from ..check import Check

_REQUIRED_FIELDS = set(['description'])
_OPTIONAL_FIELDS = set([
    'author', 'es5id', 'es6id', 'esid', 'features', 'flags', 'includes',
    'info', 'negative', 'timeout'
])
_VALID_FIELDS = _REQUIRED_FIELDS | _OPTIONAL_FIELDS

class CheckFrontmatter(Check):
    '''Ensure tests have the expected YAML-formatted metadata.'''
    ID = 'FRONTMATTER'

    def run(self, name, meta, source):
        if name.endswith('_FIXTURE.js'):
            if meta is not None:
                return '"Fixture" files cannot specify metadata'
            return

        if meta is None:
            return 'No valid YAML-formatted frontmatter'

        fields = set(meta.keys())

        missing = _REQUIRED_FIELDS - fields
        if len(missing) > 0:
            return 'Required fields missing: %s' % ', '.join(list(missing))

        unrecognized = fields - _VALID_FIELDS
        if len(unrecognized) > 0:
            return 'Unrecognized fields: %s' % ', '.join(list(unrecognized))

        if 'negative' in meta:
            negative = meta['negative']
            if not isinstance(negative, dict):
                return '"negative" must be a dictionary with fields "type" and "phase"'

            if not 'type' in negative:
                return '"negative" must specify a "type" field'

            if not 'phase' in negative:
                return '"negative" must specify a "phase" field'
