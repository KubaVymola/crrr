#!/bin/sh

c () {
    crrr "$1"

    if [ -f "/tmp/crrr" ]; then
        \builtin cd $(cat /tmp/crrr)
        rm /tmp/crrr

    fi
}

ch () {
    c ~
}

cr () {
    c /
}
