#!/bin/bash

find . -name '*~' -exec rm {} \;

find . -name '.git' -prune -o \
       -name '.gitignore' -prune -o \
       -name '*.bak' -prune -o \
       -name '*.tmpl' -prune -o \
       -name 'tools' -prune -o \
       -name 'out' -prune -o \
       -name '*.md' -prune -o \
       -name '*.orig' -prune -o \
       -name '*.sh' -prune -o \
       -print | xargs zip zotero-attacher.xpi
