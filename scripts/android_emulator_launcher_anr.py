#!/usr/bin/env python3
"""Return only the Android system Quickstep ANR's Wait-button tap target.

Never automatically dismiss an app ANR or error dialog: an app failure must
continue to fail its smoke test.
"""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def quickstep_wait_coordinates(xml: str) -> tuple[int, int] | None:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    nodes = list(root.iter('node'))
    if not any("quickstep isn't responding" in n.get('text', '').casefold() and n.get('package') == 'android' for n in nodes):
        return None
    for node in nodes:
        if node.get('resource-id') != 'android:id/aerr_wait' or node.get('package') != 'android':
            continue
        match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
        if match:
            left, top, right, bottom = map(int, match.groups())
            if left < right and top < bottom:
                return (left + right) // 2, (top + bottom) // 2
    return None


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(2)
    try:
        location = quickstep_wait_coordinates(Path(sys.argv[1]).read_text(encoding='utf-8'))
    except OSError:
        sys.exit(1)
    if location is None:
        sys.exit(1)
    print(*location)
