import re
import yaml

def parse(src):
    '''Parse the YAML-formatted metadata found in a given string of source
    code. Tolerate missing or invalid metadata; those conditions are handled by
    a dedicated "Check" instance.'''

    match = re.search(r'/\*---(.*)---\*/', src, re.DOTALL)
    if not match:
        return None

    try:
        return yaml.load(match.group(1))
    except (yaml.scanner.ScannerError, yaml.parser.ParserError):
        return None
